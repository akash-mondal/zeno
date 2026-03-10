import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenId,
  TokenAssociateTransaction,
  AccountId,
  PrivateKey,
} from '@hashgraph/sdk';
import { getClient } from './client';

function getOperatorKey(): PrivateKey {
  return PrivateKey.fromStringDer(process.env.HEDERA_PRIVATE_KEY!);
}

export async function createComplianceCreditToken(): Promise<string> {
  const client = getClient();
  const operatorId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
  const supplyKey = getOperatorKey();

  const tx = new TokenCreateTransaction()
    .setTokenName('Ganga Green Compliance Credit')
    .setTokenSymbol('GGCC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey)
    .setAdminKey(supplyKey)
    .setTokenMemo('Zeno ComplianceCredit — 1 GGCC = 1 facility-day of verified compliant discharge');

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.tokenId) throw new Error('Failed to create GGCC token');
  return receipt.tokenId.toString();
}

export async function createViolationNFTCollection(): Promise<string> {
  const client = getClient();
  const operatorId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
  const supplyKey = getOperatorKey();

  const tx = new TokenCreateTransaction()
    .setTokenName('Zeno Violation Record')
    .setTokenSymbol('ZVIOL')
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey)
    .setAdminKey(supplyKey)
    .setTokenMemo('Zeno ViolationNFT — immutable record of discharge standard violation');

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.tokenId) throw new Error('Failed to create ViolationNFT collection');
  return receipt.tokenId.toString();
}

export async function createComplianceCertNFTCollection(): Promise<string> {
  const client = getClient();
  const operatorId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
  const supplyKey = getOperatorKey();

  const tx = new TokenCreateTransaction()
    .setTokenName('Zeno Compliance Certificate')
    .setTokenSymbol('ZCERT')
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(supplyKey)
    .setAdminKey(supplyKey)
    .setTokenMemo('Zeno ComplianceCertificateNFT — sustained compliance achievement');

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.tokenId) throw new Error('Failed to create ComplianceCertNFT collection');
  return receipt.tokenId.toString();
}

export async function mintComplianceCredit(
  tokenId: string,
  amount: number
): Promise<string> {
  const client = getClient();

  const tx = new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .setAmount(amount);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return response.transactionId.toString();
}

export async function mintViolationNFT(
  tokenId: string,
  metadata: Record<string, unknown>
): Promise<{ txId: string; serial: number }> {
  const client = getClient();

  // Hedera NFT metadata limit: 100 bytes per entry
  // Store compact reference — full data lives on HCS
  const compact = [
    metadata.facilityId || '',
    metadata.parameter || '',
    metadata.readingValue || '',
    metadata.threshold || '',
    metadata.timestamp ? (metadata.timestamp as string).substring(0, 19) : '',
  ].join('|');
  const metadataBytes = Buffer.from(compact.substring(0, 100));

  const tx = new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .addMetadata(metadataBytes);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    serial: Number(receipt.serials[0]),
  };
}

export async function mintComplianceCertNFT(
  tokenId: string,
  metadata: Record<string, unknown>
): Promise<{ txId: string; serial: number }> {
  const client = getClient();

  const compact = [
    metadata.facilityId || '',
    metadata.compliantDays || '',
    metadata.issuedAt ? (metadata.issuedAt as string).substring(0, 19) : '',
  ].join('|');
  const metadataBytes = Buffer.from(compact.substring(0, 100));

  const tx = new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .addMetadata(metadataBytes);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    serial: Number(receipt.serials[0]),
  };
}
