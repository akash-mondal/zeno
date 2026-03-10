# E2E Pipeline Test

Full end-to-end pipeline test for Project Zeno. Runs 10 steps with 38 assertions against the **real Hedera testnet** — no mocks, no local simulation.

## What It Covers

| Step | Description |
|------|-------------|
| 1 | **OCEMS Data Generation** — produces compliant, violation, and ZLD breach sensor readings using realistic facility profiles |
| 2 | **Ingestion Validation** — rejects invalid readings (out-of-range pH, chemistry invariant violations) before they reach the chain |
| 3 | **HCS Topic Creation** — creates system topics (registry, compliance, alerts) and a per-facility sensor data topic |
| 4 | **HCS Sensor Submission** — submits 3 KMS-signed sensor readings to the facility topic |
| 5 | **Mirror Node Query** — waits for propagation, then queries messages back and verifies payload integrity |
| 6 | **Compliance Evaluation** — runs CPCB Schedule-VI engine on both compliant and violation batches, verifies token action decisions |
| 7 | **Smart Contract Verification** — deploys ComplianceChecker.sol, registers facility on-chain, runs view-call compliance check, records evaluation hash |
| 8 | **HTS Token Minting** — creates GGCC fungible token and ViolationNFT collection, mints one of each |
| 9 | **HCS Compliance Anchoring** — submits the compliance evaluation result to the system compliance topic |
| 10 | **Trust Chain Assembly** — builds a complete Section 65B evidence package linking token to reading to evaluation to KMS proof |

## Hedera Resources Created Per Run

Each run creates fresh testnet resources (no reuse):

- **4 HCS topics** — registry, compliance, alerts, facility
- **1 smart contract** — ComplianceChecker deployed via ethers
- **2 HTS tokens** — GGCC (fungible), ViolationNFT (non-fungible collection)
- Multiple HCS messages (sensor readings + compliance evaluation)
- Token mint transactions (1 GGCC + 1 ViolationNFT serial)

Results are saved to `scripts/e2e-results.json` with HashScan links.

## KMS Device Signing

When AWS KMS is configured, the test uses **real HSM-backed ECDSA signing** for device identity:

- Each sensor reading is signed with `signReadingPayload()` via AWS KMS
- HCS submissions use a KMS-signed Hedera client (`createKMSSignedClient`)
- Trust chain includes cryptographic proof verified with `verifyReadingSignature()`
- Without KMS, the test falls back to operator key signing (non-production mode)

## Prerequisites

### Environment Variables (`.env` at repo root)

**Required:**

| Variable | Description |
|----------|-------------|
| `HEDERA_ACCOUNT_ID` | Testnet operator account (e.g., `0.0.7284970`) |
| `HEDERA_PRIVATE_KEY` | ED25519 or ECDSA private key for the operator |
| `HEDERA_PRIVATE_KEY_HEX` | Hex-encoded private key (for ethers/smart contract calls) |
| `HEDERA_JSON_RPC_URL` | JSON-RPC relay endpoint (Validation Cloud) |

**Optional (enables KMS signing):**

| Variable | Description |
|----------|-------------|
| `KMS_KEY_ID` | AWS KMS key ID (`ECC_SECG_P256K1`) |
| `KMS_ACCOUNT_ID` | Hedera account controlled by KMS key (e.g., `0.0.8148249`) |
| `AWS_REGION` | AWS region for KMS calls |

### Build First

```bash
npx turbo run build
```

## Running

```bash
npx tsx scripts/e2e-pipeline.ts
```

Takes ~60-90 seconds (Mirror Node propagation wait + testnet transaction latency).

Exit code 0 = all 38 assertions passed. Exit code 1 = one or more failures.
