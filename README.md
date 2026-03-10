# Project Zeno

**Blockchain-verified industrial effluent compliance for India's rivers.**

Built on [Hedera](https://hedera.com) for the [Hello Future Apex Hackathon 2026](https://hackathon.stackup.dev/web/events/hedera-hello-future-apex-hackathon-2026) — Sustainability Track + AWS Bounty.

---

## The Problem

India's Central Pollution Control Board (CPCB) mandates Online Continuous Emission Monitoring Systems (OCEMS) for 4,433 Grossly Polluting Industries. The monitoring data is self-reported, tamperable, and siloed:

- **1,686 GPIs** operate without any OCEMS monitoring
- **9 documented tampering methods** undermine existing systems — from calibration drift to sample dilution to bypass piping
- **60,000 tonnes of chromium** flow into the Ganga from Kanpur's Jajmau tannery cluster annually — 840x the legal limit
- CPCB's own `cems.cpcb.gov.in` portal is centralized and not publicly accessible

**No independent party can verify that monitoring data hasn't been altered between device and regulator.**

## The Solution

Zeno is a **parallel blockchain trust layer** that sits alongside CPCB's existing `cems.cpcb.gov.in` infrastructure. It doesn't replace the regulatory system — it makes it auditable, tamper-proof, and publicly verifiable.

```
OCEMS Device ──→ CPCB cems.cpcb.gov.in              (existing pipeline, unchanged)
            └──→ AWS KMS Sign ──→ Hedera HCS          (Zeno trust layer)
                               ──→ Guardian dMRV
                               ──→ Smart Contracts
                               ──→ HTS Tokens
                               ──→ AI Agent
                               ──→ Satellite Validation
                               ──→ Mirror Node → Dashboard
```

Every compliance token traces back through a 6-layer trust chain: facility registration → raw sensor data → compliance evaluation → KMS cryptographic proof → calibration status → satellite cross-validation. This chain constitutes a Section 65B-compliant evidence package under India's IT Act 2000.

---

## Architecture

### Hedera Services (7 integrated)

| Service | Integration |
|---------|-------------|
| **HCS** | Multi-topic architecture — system topics (registry, compliance, calibration, alerts) + per-facility sensor data topics with submit key access control |
| **HTS** | Three token types: ComplianceCredit (GGCC) fungible token, ViolationNFT, ComplianceCertificateNFT — full digital environmental asset lifecycle |
| **Smart Contracts** | ComplianceChecker.sol (on-chain threshold verification with HTS precompile at 0x167), PenaltyCalculator.sol (graduated penalties) |
| **Guardian** | 5-role dMRV policy: Standard Registry (CPCB), Project Proponent (Industry), SPCB Inspector, VVB Auditor, IoT Data Service |
| **Agent Kit** | Custom CompliancePlugin with 4 tools: compliance check, anomaly detection, satellite cross-validation, violation minting |
| **Mirror Node** | REST API powering the entire dashboard — true Web3 architecture, no external database |
| **AWS KMS** | Device-level ECDSA signing (ECC_SECG_P256K1), keys never leave FIPS 140-2 Level 3 HSM, CloudTrail audit |

### Compliance Engine

Zeno implements CPCB's Schedule-VI discharge standards with production-grade depth:

- **Two-tier thresholds** — Schedule-VI defaults with per-facility CTO (Consent to Operate) overrides for sensitive zones
- **ZLD enforcement** — Zero Liquid Discharge mandated facilities: any discharge = violation regardless of parameter quality
- **Calibration tolerance bands** — ±10% for COD/BOD/TSS, ±0.2 pH units (matching CSIR-NPL certified analyzer specifications)
- **Three-tier violation response** — Compliant → mint GGCC | Moderate (≤50% over) → pending review (satellite + VVB audit) | Critical (>50% over) → immediate ViolationNFT + SPCB alert

### Token Economy

| Token | Type | Purpose |
|-------|------|---------|
| **GGCC** | Fungible (FT) | 1 token = 1 verified compliant evaluation. Tradeable between facilities. |
| **ViolationNFT** | Non-Fungible (NFT) | Immutable violation record. Soulbound. Contains parameter data + satellite confirmation. |
| **ComplianceCertNFT** | Non-Fungible (NFT) | Issued after 90+ days sustained compliance. Premium evidence for regulators and insurers. |

---

## Project Structure

```
zeno/
├── apps/
│   └── web/                          # Next.js 16 dashboard (3 portals)
├── packages/
│   ├── blockchain/                   # Hedera base layer (production-locked)
│   │   ├── src/
│   │   │   ├── types.ts              # All interfaces, schemas, CPCB standards
│   │   │   ├── client.ts             # Hedera SDK client factory
│   │   │   ├── topics.ts             # Multi-topic HCS architecture
│   │   │   ├── hcs.ts                # Envelope-wrapped HCS messaging
│   │   │   ├── hts.ts                # Token creation and minting
│   │   │   ├── compliance.ts         # CPCB Schedule-VI compliance engine
│   │   │   ├── trust-chain.ts        # Section 65B evidence package builder
│   │   │   ├── mirror.ts             # Mirror Node REST API wrappers
│   │   │   ├── kms-signer.ts         # AWS KMS signing pipeline
│   │   │   └── validator.ts          # Sensor reading ingestion validation
│   │   ├── scripts/
│   │   │   └── test-hedera-pipeline.ts  # 8-phase end-to-end testnet pipeline
│   │   └── README.md                 # Detailed architecture with Mermaid diagrams
│   ├── simulator/                    # OCEMS sensor data generator
│   ├── contracts/                    # Solidity smart contracts (Hardhat)
│   ├── agent/                        # AI compliance agent (Agent Kit + LangChain)
│   └── satellite/                    # Sentinel-2 water quality API (Python)
├── guardian/                         # Guardian dMRV policy files
├── docs/                             # AWS KMS docs, architecture diagrams
└── scripts/                          # E2E tests, env validation
```

> **Base layer documentation**: See [`packages/blockchain/README.md`](packages/blockchain/README.md) for the complete Hedera integration architecture — multi-topic HCS design, data flow diagrams, trust chain structure, and compliance evaluation logic with Mermaid diagrams.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Blockchain SDK | `@hashgraph/sdk` | 2.80.0 |
| Guardian | Hedera Guardian | 3.5.0 |
| Agent Kit | `hedera-agent-kit` | 3.8.0 |
| Signing | AWS KMS (ECC_SECG_P256K1) | — |
| Frontend | Next.js | 16.1.6 |
| UI | shadcn/ui, React-Leaflet 5.0, Recharts 3.8 | — |
| Contracts | Hardhat | 3.1.11 |
| Satellite | Google Earth Engine, Sentinel-2 Se2WaQ | — |
| Build | Turborepo | 2.8.14 |

## Quick Start

```bash
# Prerequisites: Node.js 25+, Python 3.11+, AWS CLI
git clone https://github.com/akash-mondal/zeno.git
cd zeno && npm install

# Configure
cp .env.example .env
# Fill in: Hedera testnet credentials, AWS KMS keys, GEE service account

# Build all packages
npx turbo run build

# Run the blockchain pipeline test (real Hedera testnet)
npx tsx packages/blockchain/scripts/test-hedera-pipeline.ts

# Run dashboard
npm run dev -w apps/web
```

## Testnet Resources

All resources verified on Hedera testnet via [HashScan](https://hashscan.io/testnet):

| Resource | ID |
|----------|-----|
| Operator Account | [`0.0.7284970`](https://hashscan.io/testnet/account/0.0.7284970) |
| ZENO-REGISTRY Topic | [`0.0.8144973`](https://hashscan.io/testnet/topic/0.0.8144973) |
| ZENO-COMPLIANCE Topic | [`0.0.8144974`](https://hashscan.io/testnet/topic/0.0.8144974) |
| ZENO-CALIBRATION Topic | [`0.0.8144975`](https://hashscan.io/testnet/topic/0.0.8144975) |
| ZENO-ALERTS Topic | [`0.0.8144976`](https://hashscan.io/testnet/topic/0.0.8144976) |
| Facility Topic (KNP-TAN-001) | [`0.0.8144978`](https://hashscan.io/testnet/topic/0.0.8144978) |
| GGCC Token | [`0.0.8144733`](https://hashscan.io/testnet/token/0.0.8144733) |
| ViolationNFT | [`0.0.8144734`](https://hashscan.io/testnet/token/0.0.8144734) |
| ComplianceCertNFT | [`0.0.8144735`](https://hashscan.io/testnet/token/0.0.8144735) |

## AWS Bounty

Secure key management for on-chain applications using AWS KMS:

- **Key generation**: `ECC_SECG_P256K1` in FIPS 140-2 Level 3 HSMs — private keys never leave hardware
- **Transaction signing**: `MessageType: DIGEST` pattern — hash locally with keccak256, send 32-byte digest to KMS
- **Access controls**: IAM least-privilege per device (`kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey` only)
- **Audit logging**: CloudTrail records every signing operation with timestamp, caller ARN, key ID
- **Key rotation**: Zero-downtime via `CryptoUpdateTransaction` signed by both old and new keys

See [`docs/aws-kms/`](docs/aws-kms/) for full architecture documentation. Standalone demo: `npx tsx packages/blockchain/scripts/kms-demo.ts`

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data layer | Mirror Node only | True Web3 — no external DB. All data lives on Hedera. |
| Guardian + Smart Contract | Both | Guardian = workflow orchestration. Smart contract = trustless on-chain proof. |
| Satellite | Sentinel-2 (S2_SR_HARMONIZED) | 10m resolution, 5-day revisit, Se2WaQ validated (R²=0.91 for turbidity) |
| Signing | AWS KMS | Keys never leave HSM. CloudTrail. AWS bounty. Production-grade. |
| Token model | GGCC + ViolationNFT + CertNFT | Full digital environmental asset lifecycle (Daniel Swid framework) |
| Compliance | Two-tier + ZLD + tolerance bands | Matches real CPCB architecture: Schedule-VI defaults, CTO overrides, calibration tolerances |

## Legal Framework

Zeno's blockchain records are designed for admissibility in National Green Tribunal (NGT) proceedings:

- **IT Act 2000, Section 65B** — Electronic records with KMS signatures + CloudTrail constitute valid certificate chain
- **Indian Evidence Act, Section 85B** — KMS-signed sensor data meets electronic agreement authenticity threshold
- **Environment Protection Act 1986** — Blockchain-anchored data provides irrefutable evidence of discharge violations
- **Water Act 1974, Sections 43-44** — Makes OCEMS data manipulation detectable and provable

## License

[MIT](LICENSE)

---

*Built for the Hedera Hello Future Apex Hackathon 2026. Sustainability Track + AWS Bounty.*
