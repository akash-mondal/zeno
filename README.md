# Project Zeno

**Blockchain-verified industrial effluent compliance for India's rivers.**

Built on [Hedera](https://hedera.com) for the [Hello Future Apex Hackathon 2026](https://hackathon.stackup.dev/web/events/hedera-hello-future-apex-hackathon-2026) — Sustainability Track + AWS Bounty.

---

## The Problem

India's 4,433 Grossly Polluting Industries (GPIs) are mandated by CPCB to install Online Continuous Emission Monitoring Systems (OCEMS). But the monitoring data is self-reported, tamperable, and siloed. Nine documented methods of OCEMS tampering exist. 1,686 GPIs operate without monitoring at all. 60,000 tonnes of chromium flow into the Ganga from Kanpur's tanneries every year — 840x the legal limit.

**No one can prove the monitoring data is real.**

## The Solution

Zeno is a parallel blockchain trust layer that sits alongside CPCB's existing monitoring infrastructure. It doesn't replace the regulator's system — it makes it auditable.

- **AWS KMS-signed sensor data** anchored to Hedera Consensus Service — tamper-proof, device-authenticated
- **Guardian dMRV policy engine** for automated compliance verification with 5-role workflow
- **Smart contracts** for on-chain, trustless compliance checking (callable by anyone)
- **Sentinel-2 satellite cross-validation** — independent verification that doesn't rely on OCEMS
- **AI compliance agent** (Hedera Agent Kit) that detects anomalies like calibration drift and sensor disconnection
- **Three-portal dashboard** — regulator, industry, and citizen access to compliance data

Every compliance token traces back through a full trust chain: sensor reading → KMS signature → HCS message → satellite validation → smart contract verification.

## Architecture

```
[OCEMS Device] → [Direct to CPCB]              ← existing pipeline (unchanged)
             └→ [AWS KMS Signing] → [HCS]       ← Zeno parallel trust layer
                                  → [Guardian dMRV]
                                  → [Smart Contracts]
                                  → [HTS Tokens (GGCC/ViolationNFT)]
                                  → [AI Agent]
                                  → [Satellite Cross-Validation]
                                  → [Mirror Node → Dashboard]
```

**7 Hedera services**: HCS, HTS, Smart Contracts, Guardian, Agent Kit, Mirror Node, AWS KMS

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Hedera (HCS, HTS, Smart Contracts, Guardian 3.5, Agent Kit 3.8) |
| Signing | AWS KMS (ECC_SECG_P256K1, FIPS 140-2 Level 3 HSM) |
| Frontend | Next.js 16, shadcn/ui, React-Leaflet, Recharts |
| Contracts | Solidity via Hardhat, deployed on Hedera EVM |
| AI | Hedera Agent Kit + LangChain |
| Satellite | Google Earth Engine, Sentinel-2 (Se2WaQ indices) |
| Build | Turborepo, npm workspaces |

## Project Structure

```
zeno/
├── apps/web/                  # Next.js dashboard (3 portals)
├── packages/
│   ├── blockchain/            # Hedera SDK wrappers + AWS KMS signer
│   ├── simulator/             # OCEMS sensor data generator
│   ├── contracts/             # Solidity smart contracts
│   ├── agent/                 # AI compliance agent
│   └── satellite/             # Sentinel-2 water quality API (Python)
├── guardian/                  # Guardian dMRV policy files
├── scripts/                   # E2E tests, env validation
└── docs/                      # AWS KMS docs, architecture diagrams
```

## Quick Start

```bash
# Prerequisites: Node.js 25+, Python 3.11+, AWS CLI

# Clone and install
git clone https://github.com/akash-mondal/zeno.git
cd zeno
npm install

# Configure
cp .env.example .env
# Fill in: Hedera testnet credentials, AWS KMS keys, GEE service account

# Build
npx turbo run build

# Validate all connections
npx ts-node scripts/validate-env.ts

# Run dashboard
npm run dev -w apps/web
```

## Hedera Services Integration

| Service | Usage |
|---------|-------|
| **HCS** | Per-facility sensor data topics, immutable audit trail |
| **HTS** | ComplianceCredit (GGCC) fungible token, ViolationNFT, ComplianceCertificateNFT |
| **Smart Contracts** | ComplianceChecker.sol (threshold verification), PenaltyCalculator.sol |
| **Guardian** | 5-role dMRV policy: CPCB, Industry, SPCB Inspector, VVB Auditor, IoT Service |
| **Agent Kit** | Custom CompliancePlugin with 4 domain-specific tools |
| **Mirror Node** | REST API powering the entire dashboard |
| **AWS KMS** | Device-level ECDSA signing, keys never leave HSM |

## AWS Bounty

Secure key management solution using AWS KMS for Hedera transaction signing:

- ECC_SECG_P256K1 keys generated and stored in FIPS 140-2 Level 3 HSMs
- Transaction signing via MessageType: DIGEST (private keys never exposed)
- IAM least-privilege policies per device
- CloudTrail audit logging for every signing operation
- Key rotation via CryptoUpdateTransaction
- Standalone demo: `npx ts-node packages/blockchain/scripts/kms-demo.ts`

See [`docs/aws-kms/`](docs/aws-kms/) for full architecture documentation.

## CPCB Discharge Standards

Compliance thresholds hardcoded from Schedule-VI:

| Parameter | Limit |
|-----------|-------|
| pH | 5.5 – 9.0 |
| BOD (3-day, 27°C) | ≤ 30 mg/L |
| COD | ≤ 250 mg/L |
| TSS | ≤ 100 mg/L |
| Total Chromium | ≤ 2.0 mg/L |
| Hexavalent Chromium | ≤ 0.1 mg/L |
| Oil & Grease | ≤ 10 mg/L |
| Ammoniacal Nitrogen | ≤ 50 mg/L |
| Temperature | ≤ 5°C above ambient |

Facilities with ZLD (Zero Liquid Discharge) mandates: any discharge is a violation regardless of parameters.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data layer | Mirror Node only | True Web3 architecture — no external DB dependency. All data lives on Hedera. |
| Guardian + Smart Contract | Both | Guardian handles workflow; smart contract provides trustless on-chain verification. |
| Satellite source | Sentinel-2 | 10m resolution, 5-day revisit, Se2WaQ validated (R²=0.91 for turbidity) |
| Signing | AWS KMS | Keys never leave HSM. CloudTrail audit. AWS bounty alignment. |
| Token model | GGCC FT + ViolationNFT + CertNFT | Full digital environmental asset lifecycle per Daniel Swid's framework |

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

*Built for the Hedera Hello Future Apex Hackathon 2026. Targeting Sustainability Track + AWS Bounty.*
