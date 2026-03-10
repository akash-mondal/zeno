import {
  KMSClient,
  GetPublicKeyCommand,
  SignCommand,
} from '@aws-sdk/client-kms';
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PublicKey,
  Transaction,
  AccountBalanceQuery,
  TransferTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { keccak256 } from 'js-sha3';
import * as asn1js from 'asn1js';
import { ec as EC } from 'elliptic';
import { getClient } from './client';

const ec = new EC('secp256k1');

/**
 * DER SPKI header for secp256k1 public keys from AWS KMS.
 * All ECC_SECG_P256K1 keys from KMS have this exact 23-byte prefix.
 * Strip it to get the 65-byte uncompressed public key (04 || x || y).
 */
const DER_SPKI_HEADER_HEX = '3056301006072a8648ce3d020106052b8104000a034200';

// ─── KMS Client Setup ────────────────────────────────────────────────

function getKMSClient(): KMSClient {
  return new KMSClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function getKMSKeyId(): string {
  const keyId = process.env.KMS_KEY_ID;
  if (!keyId) throw new Error('KMS_KEY_ID must be set in environment');
  return keyId;
}

// ─── Public Key Extraction ───────────────────────────────────────────

/**
 * Fetch the public key from AWS KMS and convert to Hedera ECDSA PublicKey.
 *
 * KMS returns DER-encoded SPKI format (88 bytes):
 *   [23-byte DER header] + [65-byte uncompressed key: 04 || x || y]
 *
 * Steps:
 *   1. Strip DER SPKI header (fixed for secp256k1)
 *   2. Compress with elliptic: 65 bytes → 33 bytes (02/03 || x)
 *   3. Create Hedera PublicKey via fromBytesECDSA()
 *
 * Reference: hedera-dev/aws-kms-workshop
 */
export async function getHederaPublicKeyFromKMS(
  kmsClient?: KMSClient,
  keyId?: string
): Promise<PublicKey> {
  const kms = kmsClient || getKMSClient();
  const kid = keyId || getKMSKeyId();

  const response = await kms.send(new GetPublicKeyCommand({ KeyId: kid }));

  if (!response.PublicKey) {
    throw new Error('KMS returned no public key');
  }

  const derHex = Buffer.from(response.PublicKey).toString('hex');

  // Verify and strip the fixed DER header
  if (!derHex.startsWith(DER_SPKI_HEADER_HEX)) {
    throw new Error(
      `Unexpected DER format. Expected header: ${DER_SPKI_HEADER_HEX}, ` +
      `got: ${derHex.slice(0, DER_SPKI_HEADER_HEX.length)}`
    );
  }

  const rawUncompressedHex = derHex.slice(DER_SPKI_HEADER_HEX.length);

  // Compress: 04||x||y (65 bytes) → 02/03||x (33 bytes)
  const key = ec.keyFromPublic(rawUncompressedHex, 'hex');
  const compressedHex = key.getPublic(true, 'hex'); // true = compressed

  // Use fromBytesECDSA — same pattern as the official workshop
  return PublicKey.fromBytesECDSA(
    Buffer.from(compressedHex, 'hex')
  );
}

// ─── DER Signature Parsing ──────────────────────────────────────────

/**
 * Parse a DER-encoded ECDSA signature into raw 64-byte R||S format.
 *
 * KMS returns: SEQUENCE { INTEGER r, INTEGER s }
 * We need:     r (32 bytes, big-endian, zero-padded) || s (32 bytes)
 *
 * R and S may have leading 0x00 (ASN.1 sign byte) — strip it.
 * R and S may be <32 bytes — left-pad with zeros.
 */
export function parseDERSignature(derSig: Uint8Array): Uint8Array {
  const asn1 = asn1js.fromBER(derSig);

  if (asn1.offset === -1) {
    throw new Error('Failed to parse DER signature');
  }

  const sequence = asn1.result as asn1js.Sequence;
  const rInt = (sequence.valueBlock.value[0] as asn1js.Integer).valueBlock.valueHexView;
  const sInt = (sequence.valueBlock.value[1] as asn1js.Integer).valueBlock.valueHexView;

  // Strip leading zeros, pad to exactly 32 bytes
  const r = padTo32(stripLeadingZeros(Buffer.from(rInt)));
  const s = padTo32(stripLeadingZeros(Buffer.from(sInt)));

  const result = new Uint8Array(64);
  result.set(r, 0);   // bytes 0-31: r
  result.set(s, 32);  // bytes 32-63: s
  return result;
}

function stripLeadingZeros(buf: Buffer): Buffer {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  return buf.slice(i);
}

function padTo32(buf: Buffer): Buffer {
  if (buf.length === 32) return buf;
  if (buf.length > 32) return buf.slice(buf.length - 32);
  const padded = Buffer.alloc(32);
  buf.copy(padded, 32 - buf.length);
  return padded;
}

// ─── KMS Signer Function ────────────────────────────────────────────

/**
 * Build a custom signer function compatible with Hedera SDK's setOperatorWith().
 *
 * Flow:
 *   1. Receive raw transaction body bytes from SDK
 *   2. keccak256 hash (required by HIP-222 for ECDSA on Hedera)
 *   3. Send 32-byte digest to KMS (MessageType: DIGEST — prevents double-hashing)
 *   4. Parse DER-encoded response → 64-byte R||S
 *
 * CRITICAL: MessageType MUST be "DIGEST" because we pre-hash with keccak256.
 * If set to "RAW", KMS would SHA-256 hash it again, producing an invalid signature.
 */
export function buildKMSSigner(
  kmsClient?: KMSClient,
  keyId?: string
): (message: Uint8Array) => Promise<Uint8Array> {
  const kms = kmsClient || getKMSClient();
  const kid = keyId || getKMSKeyId();

  return async (message: Uint8Array): Promise<Uint8Array> => {
    // Hash locally — only the 32-byte digest goes to KMS
    const hashHex = keccak256(Buffer.from(message));
    const hash = Buffer.from(hashHex, 'hex');

    const signResponse = await kms.send(
      new SignCommand({
        KeyId: kid,
        Message: hash,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    );

    if (!signResponse.Signature) {
      throw new Error('KMS returned no signature');
    }

    return parseDERSignature(new Uint8Array(signResponse.Signature));
  };
}

// ─── Payload Signing (Application-Layer) ─────────────────────────────

/**
 * Sign a sensor reading's payload with KMS and populate kmsSigHash.
 *
 * This is APPLICATION-LAYER signing — separate from Hedera transaction signing.
 * It proves the DEVICE produced this specific reading, not just that someone
 * submitted it to HCS. Without this, anyone with the operator key could
 * submit fake readings. With this, only the device's KMS key can produce
 * valid signatures.
 *
 * Flow:
 *   1. Canonicalize reading JSON (exclude kmsSigHash to avoid circular ref)
 *   2. keccak256 hash the canonical JSON
 *   3. KMS signs the hash (DIGEST mode)
 *   4. Return hex-encoded 64-byte R||S signature
 */
export async function signReadingPayload(
  reading: Record<string, unknown>,
  kmsClient?: KMSClient,
  keyId?: string,
): Promise<string> {
  const kms = kmsClient || getKMSClient();
  const kid = keyId || getKMSKeyId();

  // Canonicalize: remove kmsSigHash to avoid circular dependency, sort keys
  const { kmsSigHash, ...payloadWithoutSig } = reading as Record<string, unknown>;
  const canonical = JSON.stringify(payloadWithoutSig, Object.keys(payloadWithoutSig).sort());

  // Hash the canonical payload
  const hashHex = keccak256(canonical);
  const hash = Buffer.from(hashHex, 'hex');

  const signResponse = await kms.send(
    new SignCommand({
      KeyId: kid,
      Message: hash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
  );

  if (!signResponse.Signature) {
    throw new Error('KMS returned no signature for reading payload');
  }

  const rawSig = parseDERSignature(new Uint8Array(signResponse.Signature));
  return Buffer.from(rawSig).toString('hex');
}

/**
 * Sign a batch of readings — one KMS call for the whole batch.
 * More efficient than signing each reading individually.
 *
 * Returns the batch signature hash. Individual readings get the
 * batch hash as their kmsSigHash (they're covered by the batch signature).
 */
export async function signBatchPayload(
  readings: Array<Record<string, unknown>>,
  kmsClient?: KMSClient,
  keyId?: string,
): Promise<string> {
  const kms = kmsClient || getKMSClient();
  const kid = keyId || getKMSKeyId();

  // Hash each reading individually, then hash the concatenated hashes
  const readingHashes = readings.map(r => {
    const { kmsSigHash, ...payloadWithoutSig } = r as Record<string, unknown>;
    const canonical = JSON.stringify(payloadWithoutSig, Object.keys(payloadWithoutSig).sort());
    return keccak256(canonical);
  });

  // Batch hash = keccak256(hash1 + hash2 + ... + hashN)
  const concatenated = readingHashes.join('');
  const batchHashHex = keccak256(concatenated);
  const batchHash = Buffer.from(batchHashHex, 'hex');

  const signResponse = await kms.send(
    new SignCommand({
      KeyId: kid,
      Message: batchHash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
  );

  if (!signResponse.Signature) {
    throw new Error('KMS returned no signature for batch payload');
  }

  const rawSig = parseDERSignature(new Uint8Array(signResponse.Signature));
  return Buffer.from(rawSig).toString('hex');
}

/**
 * Verify a KMS signature against a reading payload.
 * Uses the elliptic library to verify locally (no KMS call needed for verification).
 * Anyone with the public key can verify — that's the whole point.
 */
export function verifyReadingSignature(
  reading: Record<string, unknown>,
  publicKeyHex: string, // 33-byte compressed hex from KMS
): boolean {
  try {
    const { kmsSigHash: sigRaw, ...payloadWithoutSig } = reading as Record<string, unknown>;
    const kmsSigHash = sigRaw as string | undefined;
    if (!kmsSigHash || kmsSigHash === 'not-configured' || kmsSigHash === '') return false;

    const canonical = JSON.stringify(payloadWithoutSig, Object.keys(payloadWithoutSig).sort());
    const hashHex = keccak256(canonical);

    const key = ec.keyFromPublic(publicKeyHex, 'hex');
    const sigBuf = Buffer.from(kmsSigHash, 'hex');
    if (sigBuf.length !== 64) return false;

    const r = sigBuf.slice(0, 32).toString('hex');
    const s = sigBuf.slice(32, 64).toString('hex');

    return key.verify(hashHex, { r, s });
  } catch {
    return false;
  }
}

// ─── Account Creation ────────────────────────────────────────────────

/**
 * Create a new Hedera account whose key is the KMS public key.
 * The private key for this account exists ONLY inside the AWS HSM.
 */
export async function createKMSAccount(initialBalance: number = 10): Promise<{
  accountId: string;
  publicKey: PublicKey;
}> {
  const client = getClient();
  const publicKey = await getHederaPublicKeyFromKMS();

  console.log('  KMS Public Key:', publicKey.toStringRaw());

  const tx = new AccountCreateTransaction()
    .setKey(publicKey)
    .setInitialBalance(new Hbar(initialBalance));

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.accountId) throw new Error('Failed to create KMS account');

  const accountId = receipt.accountId.toString();
  console.log('  KMS Account ID:', accountId);

  return { accountId, publicKey };
}

// ─── KMS-Signed Client (Workshop Pattern) ────────────────────────────

/**
 * Create a Hedera client that signs ALL transactions with AWS KMS.
 * Uses setOperatorWith() — the official pattern from the workshop.
 *
 * This is the preferred integration method. The SDK internally
 * calls the signer with the correct body bytes for each transaction.
 */
export function createKMSSignedClient(
  accountId: string,
  publicKey: PublicKey,
  kmsClient?: KMSClient,
  keyId?: string
): Client {
  const client = Client.forTestnet();
  const signer = buildKMSSigner(kmsClient, keyId);
  client.setOperatorWith(accountId, publicKey, signer);
  return client;
}

// ─── Transaction Signing (Manual Pattern) ────────────────────────────

/**
 * Sign and execute a Hedera transaction using KMS.
 *
 * Uses signWithOperator pattern — the SDK handles extracting
 * the correct body bytes and calling our signer function.
 */
export async function signAndExecute<T extends Transaction>(
  tx: T,
  kmsAccountId?: string,
  kmsPublicKey?: PublicKey
): Promise<{ txId: string; receipt: unknown }> {
  // Get or create KMS client
  const pubKey = kmsPublicKey || await getHederaPublicKeyFromKMS();
  const accId = kmsAccountId || process.env.KMS_ACCOUNT_ID;
  if (!accId) throw new Error('KMS_ACCOUNT_ID must be set or passed');

  // Create a KMS-signed client
  const kmsClient = createKMSSignedClient(accId, pubKey);

  // Freeze with the KMS client and execute
  // The SDK automatically calls our signer with the correct body bytes
  const frozen = tx.freezeWith(kmsClient);
  const response = await frozen.execute(kmsClient);
  const receipt = await response.getReceipt(kmsClient);

  return {
    txId: response.transactionId.toString(),
    receipt,
  };
}
