# Project Zeno — Full Build Plan
## Hedera Apex Hackathon 2026 | Sustainability Track + AWS Bounty

---

## TODAY (March 9) — Foundation Day: Zero Assumptions Left

**Goal**: Every external service connected, every integration point verified with real round-trips, AND every foundational code module built and tested. After today, ALL remaining work is feature coding on a proven foundation.

---

### Task 1: Monorepo Scaffold + All Dependencies Installed
**Eliminates**: Package version conflicts, import resolution issues, build pipeline failures

```
1a. Initialize monorepo with npm workspaces + Turborepo
    - Root package.json with workspaces: ["apps/*", "packages/*"]
    - turbo.json with build/test/lint pipelines
    - git init + .gitignore
    - Create full directory structure per project spec

1b. Install ALL dependencies for every package:
    - apps/web: Next.js 16, shadcn/ui, react-leaflet, leaflet, recharts, next-intl
    - packages/blockchain: @hashgraph/sdk, @aws-sdk/client-kms, asn1js, elliptic, js-sha3
    - packages/simulator: typescript only
    - packages/contracts: hardhat, @hashgraph/sdk, dotenv
    - packages/agent: hedera-agent-kit, @langchain/core, langchain, @langchain/langgraph, @langchain/openai, zod
    - packages/satellite: earthengine-api, fastapi, uvicorn (Python venv)

1c. Write tsconfig.json for each TS package (ES2020/NodeNext)
1d. Verify: `turbo run build` passes across all packages (stub index.ts files)
```

**Verification**: `turbo run build` succeeds. No dependency conflicts. All packages resolve each other.

---

### Task 2: Hedera Testnet — Full HCS + HTS + Mirror Node Pipeline
**Eliminates**: SDK compatibility, HCS message format issues, HTS token creation failures, Mirror Node query parsing
**Requires from user**: portal.hedera.com account → ACCOUNT_ID + PRIVATE_KEY

```
2a. Create .env with HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY
2b. Write packages/blockchain/src/client.ts — Client.forTestnet().setOperator()
2c. Verify connection: query account balance

--- HCS (sensor data pipeline) ---
2d. Write packages/blockchain/src/hcs.ts:
    - createFacilityTopic(facilityId) → TopicCreateTransaction → returns topicId
    - submitSensorReading(topicId, reading) → TopicMessageSubmitTransaction
    - getSensorReadings(topicId, fromTimestamp?) → Mirror Node query + parse
2e. Define the EXACT SensorReading JSON schema that will be used everywhere:
    { timestamp, facilityId, facilityDID, pH, BOD_mgL, COD_mgL, TSS_mgL,
      temperature_C, totalChromium_mgL, hexChromium_mgL, oilAndGrease_mgL,
      ammoniacalN_mgL, dissolvedOxygen_mgL, flow_KLD, sensorStatus,
      kmsKeyId, kmsSigHash }
2f. Submit 3 test sensor readings to HCS, query them back via Mirror Node
2g. Verify: messages appear on HashScan, Mirror Node returns parsed JSON

--- HTS (token pipeline) ---
2h. Write packages/blockchain/src/hts.ts:
    - createComplianceCreditToken() → TokenCreateTransaction (FT, symbol: GGCC)
    - createViolationNFTCollection() → TokenCreateTransaction (NFT)
    - createComplianceCertNFTCollection() → TokenCreateTransaction (NFT)
    - mintComplianceCredit(accountId, amount) → TokenMintTransaction
    - mintViolationNFT(metadata) → TokenMintTransaction
2i. Create all 3 token types on testnet — save token IDs to .env
2j. Mint 1 test GGCC token + 1 test ViolationNFT
2k. Verify: tokens visible on HashScan, queryable via Mirror Node

--- Mirror Node typed wrappers ---
2l. Write packages/blockchain/src/mirror.ts:
    - getTopicMessages(topicId, filters) — with pagination
    - getAccountTokens(accountId) — token balances
    - getTransactionDetails(txId) — full tx info
    - getNFTInfo(tokenId, serial) — NFT metadata
2m. Test all query patterns with real data from 2f-2j
2n. Measure latency, test pagination (Mirror Node max 100/page)
```

**Verification**: HCS topic exists, 3 messages queryable. 3 token types created. 1 FT + 1 NFT minted. All Mirror Node wrappers return typed data. All IDs saved.

---

### Task 3: AWS KMS — Full Signing Pipeline End-to-End
**Eliminates**: DER parsing bugs, KMS-Hedera key incompatibility, IAM permission issues, signature format mismatches
**Requires from user**: AWS account, AWS CLI installed

```
3a. AWS account setup:
    - IAM user: hedera-kms-user
    - IAM policy: kms:Sign, kms:GetPublicKey, kms:DescribeKey (least-privilege)
    - Access keys → .env
3b. Create KMS key: ECC_SECG_P256K1
    - Create alias: alias/hedera-signing-key
    - Verify: aws kms describe-key + aws kms get-public-key
3c. Write packages/blockchain/src/kms-signer.ts (THE critical file):
    - getHederaPublicKeyFromKMS(): GetPublicKey → strip DER header → compress → add Hedera prefix
    - createKMSAccount(): AccountCreateTransaction with KMS public key
    - buildKMSSigner(): keccak256 → SignCommand DIGEST → parseDERSignature → R||S
    - parseDERSignature(): asn1js DER → extract R,S → strip 0x00 → pad 32 → concat 64
    - signAndExecute(tx): freeze → sign with KMS signer → execute
3d. Test full pipeline:
    - Create Hedera account with KMS key
    - Transfer HBAR using KMS-signed transaction
    - Submit HCS message using KMS-signed transaction
    - Verify all on HashScan
3e. Verify CloudTrail: aws cloudtrail lookup-events
3f. Write packages/blockchain/scripts/kms-demo.ts (standalone demo for AWS bounty judges)
3g. Test key rotation: create 2nd key → CryptoUpdateTransaction signed by both → verify
```

**Verification**: KMS account on testnet, KMS-signed transfer + HCS message, CloudTrail logs, key rotation works. `kms-demo.ts` runs end-to-end.

---

### Task 4: OCEMS Data Generator — Fully Working
**Eliminates**: Bad sensor ranges, COD/BOD chemistry violations, missing industry categories, schema mismatches with HCS
**No external dependencies — pure code**

```
4a. Write packages/simulator/src/standards.ts:
    - DISCHARGE_LIMITS const with all CPCB Schedule-VI thresholds
    - Industry category enum (17 types)
    - CTO override type

4b. Write packages/simulator/src/facilities.ts:
    - 5 Kanpur Jajmau tannery configs (realistic names, GPS coords, CTO limits)
    - 1 ZLD-mandated distillery (for ZLD violation demo)
    - 1 facility with stricter CTO limits (near drinking water intake)
    - Each facility: name, category, state, district, lat, lon, ctoDischargeMode, ctoCustomLimits

4c. Write packages/simulator/src/generators.ts:
    - generateSensorReading(facility, opts) → SensorReading JSON
    - Enforce COD > BOD (fundamental chemistry)
    - Configurable violation probability per facility
    - Realistic ranges per parameter (from spec tables)
    - sensorStatus: online/offline_queued/reconnected_batch/maintenance/calibrating

4d. Write packages/simulator/src/index.ts:
    - Main loop: generate readings for all facilities at 15-min intervals
    - Output to stdout as JSON (consumed by blockchain pipeline)
    - CLI flags: --interval (ms), --facilities (count), --violation-rate

4e. Test: run generator, verify:
    - COD > BOD always (run 1000 readings, assert)
    - Values within specified ranges
    - ZLD facility produces flow readings (violation)
    - CTO facility uses custom limits
    - Output JSON matches SensorReading schema from Task 2e exactly
```

**Verification**: `npm run -w packages/simulator start` outputs valid, schema-conformant sensor readings. 1000-reading stress test passes all invariants.

---

### Task 5: Smart Contracts — ComplianceChecker Deployed on Testnet
**Eliminates**: Hardhat-Hedera JSON-RPC issues, HTS precompile (0x167) accessibility, Solidity threshold logic bugs
**Depends on**: Task 2 (token IDs for HTS precompile)

```
5a. Configure hardhat.config.ts:
    - Network: hedera_testnet (https://testnet.hashio.io/api)
    - Operator private key in hex format

5b. Write packages/contracts/contracts/ComplianceChecker.sol:
    - CPCB Schedule-VI thresholds hardcoded as defaults
    - registerFacility(facilityId, ctoCustomLimits, isZLD) — stores per-facility limits
    - checkCompliance(facilityId, pH, BOD, COD, TSS, temp, Cr, hexCr, OG, NH3) → returns ComplianceResult
    - Two-tier: uses CTO limits if set, else defaults
    - ZLD mode: ANY flow > 0 = violation regardless of parameters
    - Returns per-parameter bool + overall status
    - HTS precompile integration at 0x167 for token minting (mint GGCC on comply, ViolationNFT on violate)

5c. Write packages/contracts/contracts/PenaltyCalculator.sol:
    - Graduated penalty tiers based on violation count + severity
    - Links to ViolationNFT

5d. Write packages/contracts/test/ComplianceChecker.test.ts:
    - Test all 9 parameters individually
    - Test CTO override
    - Test ZLD enforcement
    - Test edge cases (exactly at threshold, negative values rejected)

5e. Deploy both contracts to Hedera testnet
5f. Call checkCompliance with test data — verify correct result
5g. Verify contracts on HashScan
```

**Verification**: `npx hardhat test` passes all cases. Both contracts deployed on testnet. ComplianceChecker correctly evaluates readings with CTO overrides and ZLD mode.

---

### Task 6: Satellite API — Real Sentinel-2 Data for Kanpur
**Eliminates**: GEE authentication failures, Sentinel-2 data availability gaps, Se2WaQ formula errors, cloud masking issues
**Requires from user**: GEE account + Cloud project + service account JSON key

```
6a. GEE setup: Cloud project, Earth Engine API enabled, service account key
6b. Write packages/satellite/water_quality.py:
    - Se2WaQ formulas (exact from spec):
      Turbidity = 8.93 × (B03/B01) − 6.39
      Chlorophyll-a = 4.26 × (B03/B01)^3.94
      CDOM = 537 × exp(−2.93 × B03/B04)
      DOC = 432 × exp(−2.24 × B03/B04)
    - NDTI = (B4−B3)/(B4+B3)
    - NDCI = (B5−B4)/(B5+B4)
    - Cloud mask using SCL band (classes 7-10)

6c. Write packages/satellite/api.py:
    - FastAPI endpoint: GET /water-quality?lat=&lon=&start_date=&end_date=
    - Auth with service account
    - Query COPERNICUS/S2_SR_HARMONIZED
    - Apply cloud mask, compute indices, return JSON

6d. Test with Kanpur Jajmau coordinates (26.4499, 80.3319)
6e. Test with multiple dates to verify data availability
6f. Verify formulas produce physically reasonable values (turbidity > 0, chlorophyll > 0)
```

**Verification**: `curl http://localhost:8000/water-quality?lat=26.4499&lon=80.3319` returns real satellite water quality data. Values are physically reasonable.

---

### Task 7: Agent Kit — Verify Plugin Architecture + Create Skeleton
**Eliminates**: Plugin interface mismatch, LangChain version conflicts, tool registration failures
**Requires**: OpenAI API key (for LangChain LLM)

```
7a. Examine hedera-agent-kit's actual exported Plugin interface (read source/types)
7b. Write packages/agent/src/compliance-plugin.ts skeleton:
    - Implements the real Plugin interface (not assumed)
    - 4 tool stubs with Zod parameter schemas:
      check_sensor_compliance, detect_anomalies, cross_validate_satellite, mint_violation_nft
    - Each tool returns placeholder data for now (but correct types)
7c. Write packages/agent/src/index.ts:
    - Initialize HederaAgentKit with operator credentials
    - Register CompliancePlugin
    - Create LangChain agent with registered tools
7d. Test: send a query → agent selects correct tool → returns response
7e. Verify: tool parameter validation works (Zod rejects bad input)
```

**Verification**: Plugin registers, tools appear in agent's available tools, agent correctly routes a compliance query to the right tool.

---

### Task 8: Next.js Dashboard — Shell with Working Data Flow
**Eliminates**: React-Leaflet SSR issues, recharts import problems, next-intl setup, API route structure
**No external dependencies — builds on Task 2 mirror.ts**

```
8a. Set up Next.js with all configurations:
    - shadcn/ui initialized
    - next-intl configured (en + hi locales)
    - Tailwind configured
    - React-Leaflet dynamic import (SSR-incompatible)

8b. Create route structure:
    - /dashboard (regulator portal)
    - /industry (industry portal)
    - /public-portal (citizen access)
    - /api/sensor-data (POST — receive from generator)
    - /api/compliance (GET — query compliance status)
    - /api/satellite (GET — proxy to Python satellite API)
    - /api/agent (POST — AI agent chat)

8c. Build one working component per critical UI library:
    - React-Leaflet: render a map centered on Kanpur with 1 marker → proves no SSR crash
    - Recharts: render a LineChart with 5 dummy pH readings + ReferenceLines at 5.5/9.0 → proves chart rendering
    - shadcn/ui: render a Card + Table + Badge → proves component library works

8d. Wire /api/sensor-data to packages/blockchain HCS pipeline:
    - POST sensor reading → validate → submit to HCS → return txId
    - This is the critical data ingestion path

8e. Wire /dashboard to Mirror Node:
    - Fetch HCS messages → parse → display in table
    - This proves the full read path works
```

**Verification**: `npm run dev` at localhost:3000. Map renders. Chart renders. API route accepts sensor data and submits to HCS. Dashboard page shows data from Mirror Node.

---

### Task 9: Ingestion Validation Layer
**Eliminates**: Bad data reaching HCS, schema drift between generator and blockchain, missing validation edge cases

```
9a. Write packages/blockchain/src/validator.ts:
    - validateSensorReading(reading): boolean + errors[]
    - JSON Schema validation against SensorReading schema
    - Range checks: pH 0-14, no negative concentrations, temp < 100°C
    - Chemistry: COD > BOD enforcement
    - Timestamp: no future timestamps, no >24hr stale
    - KMS signature hash presence check

9b. Write unit tests for validator:
    - Valid reading passes
    - pH = -1 rejected
    - COD < BOD rejected
    - Future timestamp rejected
    - Missing required fields rejected

9c. Integrate validator into HCS submission pipeline (Task 2d's submitSensorReading)
```

**Verification**: Unit tests pass. Invalid readings are rejected before reaching HCS. Valid readings flow through.

---

### Task 10: End-to-End Integration Test
**Eliminates**: "It works in isolation but not together"

```
10a. Write scripts/e2e-test.ts:
    1. Generate a sensor reading (simulator)
    2. KMS-sign it (kms-signer)
    3. Validate it (validator)
    4. Submit to HCS (hcs)
    5. Query it back via Mirror Node (mirror)
    6. Check compliance via smart contract (ComplianceChecker)
    7. Mint appropriate token (GGCC or ViolationNFT)
    8. Verify token on Mirror Node
    9. Print full trust chain: reading → KMS sig → HCS message → compliance result → token

10b. Run it — should complete without errors
10c. Save all IDs (topic, message, account, token, contract) to a reference file
```

**Verification**: `npx ts-node scripts/e2e-test.ts` completes the full pipeline. Every step succeeds. Trust chain printout shows all linked IDs.

---

### Task 11: .env.example + Environment Validation Script
**Eliminates**: Missing env vars, undocumented configuration

```
11a. Create .env.example with every variable:
    # Hedera
    HEDERA_ACCOUNT_ID=
    HEDERA_PRIVATE_KEY=
    HEDERA_NETWORK=testnet
    # Hedera Resource IDs (populated during setup)
    HCS_FACILITY_TOPIC_IDS=  # comma-separated
    GGCC_TOKEN_ID=
    VIOLATION_NFT_TOKEN_ID=
    COMPLIANCE_CERT_NFT_TOKEN_ID=
    COMPLIANCE_CHECKER_CONTRACT_ID=
    PENALTY_CALCULATOR_CONTRACT_ID=
    # AWS KMS
    AWS_ACCESS_KEY_ID=
    AWS_SECRET_ACCESS_KEY=
    AWS_REGION=us-east-1
    KMS_KEY_ID=
    KMS_ACCOUNT_ID=  # Hedera account created with KMS key
    # Google Earth Engine
    GEE_SERVICE_ACCOUNT_KEY_PATH=
    GEE_PROJECT_ID=
    # Agent (OpenAI for LangChain)
    OPENAI_API_KEY=

11b. Write scripts/validate-env.ts:
    - Check every var exists and is non-empty
    - Test Hedera connection (balance query)
    - Test AWS KMS (describe-key)
    - Test Mirror Node (query account)
    - Test GEE (authenticate)
    - Test smart contract (call checkCompliance with test data)
    - Print ✓/✗ for each with error details
```

**Verification**: `npx ts-node scripts/validate-env.ts` shows all green. Zero failures.

---

### End-of-Day Checklist (ALL must pass):

**Infrastructure:**
- [ ] `turbo run build` passes across all packages
- [ ] Git repo initialized with first commit
- [ ] `.env.example` complete, `scripts/validate-env.ts` all green

**Hedera (3 services verified):**
- [ ] HCS: Topic created, 3+ messages submitted, queryable via Mirror Node, visible on HashScan
- [ ] HTS: 3 token types created (GGCC FT, ViolationNFT, ComplianceCertNFT), test mint works
- [ ] Mirror Node: All query patterns (topics, accounts, tokens, transactions, NFTs) return typed data with pagination

**AWS (bounty foundation):**
- [ ] KMS key created (ECC_SECG_P256K1), IAM policy attached
- [ ] Full DER→compressed→Hedera public key conversion works
- [ ] Hedera account created with KMS-derived key
- [ ] KMS-signed transaction (Transfer + HCS message) succeeds on testnet
- [ ] CloudTrail shows signing events
- [ ] Key rotation demonstrated (CryptoUpdate with both keys)
- [ ] `kms-demo.ts` runs end-to-end

**Smart Contracts:**
- [ ] ComplianceChecker.sol deployed on testnet with all threshold logic
- [ ] PenaltyCalculator.sol deployed on testnet
- [ ] `npx hardhat test` passes all test cases (9 params, CTO override, ZLD)
- [ ] HTS precompile (0x167) accessible from contract

**Data Pipeline:**
- [ ] OCEMS generator produces valid readings (1000-reading stress test, COD > BOD)
- [ ] Ingestion validator catches all bad data types
- [ ] Generator output schema === HCS message schema (no format mismatch)

**Satellite:**
- [ ] GEE authenticated, real Sentinel-2 data returned for Kanpur
- [ ] Se2WaQ formulas produce physically reasonable values

**AI Agent:**
- [ ] Agent Kit plugin interface verified against actual source
- [ ] Plugin skeleton registered, tools callable, Zod validation works

**Dashboard:**
- [ ] Next.js runs, React-Leaflet map renders (no SSR crash), Recharts works
- [ ] API route POSTs sensor data → HCS submission works
- [ ] Dashboard reads data from Mirror Node

**End-to-End:**
- [ ] `scripts/e2e-test.ts`: Generate → KMS sign → Validate → HCS → Mirror Node → Smart Contract → Token mint → all succeeds
- [ ] Full trust chain printout with all linked IDs

**After today**: Pure feature coding on proven infrastructure. Every service works. Every integration point tested. Every schema locked down.

---

## Full Build Plan (Reference — Phases 0-8 below)

---

## Context

Building the world's first blockchain-based industrial effluent compliance platform for India's 4,433 Grossly Polluting Industries (GPIs). Targets the Sustainability track ($18,500 1st place) + AWS Bounty ($4,000 1st place) = $22,500 combined. Submission deadline: March 23, 2026, 11:59 PM ET.

The project directory is empty (only `projectspec.pdf` exists). Greenfield build.

**Build approach**: Claude Code is the primary builder (solo dev with AI). Guardian deploys on AWS EC2 (cloud budget available). Both Hedera testnet and AWS accounts need setup from scratch. **Production-level: no mocks, no shortcuts, no fallbacks. Everything uses real services.**

**Key competitive advantage**: Zero blockchain-OCEMS solutions exist globally. Low competition in sustainability track (confirmed by organizer Charlene: "not many participants submit for sustainability"). Daniel Swid is the Guardian/sustainability mentor.

---

## Architecture Overview

```
13 Components → 7 Hedera Services → 3 Portals

[OCEMS Device] → [Direct to CPCB (cems.cpcb.gov.in)]     ← existing pipeline (unchanged)
             └→ [AWS KMS Signing] → [HCS Data Logging]    ← Zeno parallel trust layer
                                  → [Guardian dMRV Policy Engine]
                                  → [Smart Contracts (ComplianceChecker)]
                                  → [HTS Token Minting (GGCC/ViolationNFT)]
                                  → [AI Compliance Agent (Agent Kit)]
                                  → [Satellite Cross-Validation (GEE)]
                                  → [Mirror Node Data Service]
                                  → [Next.js Dashboard (3 portals)]
```

### Critical Positioning: Zeno is NOT a Third-Party Technology Provider

Zeno is a **parallel blockchain trust layer** that sits alongside (not replaces) CPCB's existing cems.cpcb.gov.in portal. The September 2025 CPCB directive eliminated third-party Technology Providers from the data pipeline. Zeno complies fully:

- **OCEMS devices continue to transmit directly to CPCB servers** — Zeno does not intercept or replace this pipeline
- **Zeno receives a copy of the same sensor data** at the device level (or via CPCB's API when available), KMS-signs it, and anchors it to Hedera as an independent, tamper-proof audit trail
- **The blockchain record serves as evidence** when CPCB/SPCB data and industry data disagree — it's a dispute resolution tool, not a replacement for regulatory infrastructure
- **For the hackathon demo**, the OCEMS data generator stands in for real OCEMS devices, producing the same data format that would come from actual analyzers

This means Zeno adds value ON TOP of CPCB's existing system: immutability, cross-agency trust, citizen transparency, and cryptographic proof that data wasn't altered between device and regulator.

### Legal Framework for Blockchain Evidence in India

Zeno's blockchain records are admissible in NGT proceedings under:

- **IT Act 2000, Section 65B** — Electronic records (including blockchain transactions) are admissible as evidence if accompanied by a certificate from the person responsible for the computer system. HCS messages with KMS signatures + CloudTrail logs constitute a valid Section 65B certificate chain.
- **Indian Evidence Act, Section 85B** — Presumption as to electronic agreements: signed electronic records are presumed authentic. KMS-signed sensor data with verifiable public keys meets this threshold.
- **Environment (Protection) Act 1986, Section 15** — Penalties for contravention. Blockchain-anchored OCEMS data provides irrefutable evidence of discharge standard violations with exact timestamps and cryptographic integrity.
- **Water (Prevention and Control of Pollution) Act 1974, Section 43-44** — Criminal offense for data manipulation. CPCB's April 2018 Caution Notice on OCEMS Tampering already warns that data manipulation is criminal. Zeno makes tampering detectable and provable.
- **NGT Standing Order** — NGT accepts electronic evidence including satellite imagery, sensor data, and digital monitoring reports. Zeno bundles all three into a verifiable trust chain.

**Implementation**: Each ViolationNFT includes metadata sufficient to generate a Section 65B-compliant evidence package: original sensor reading, KMS signature hash, HCS message ID, CloudTrail log reference, and satellite cross-validation data.

### NMCG Integration Strategy

Zeno is designed to serve as the data integrity layer for NMCG's (National Mission for Clean Ganga) existing monitoring infrastructure:

- **NMCG Dashboard Feed**: Zeno's Mirror Node API provides a blockchain-verified data feed that NMCG can query for real-time compliance status across all 1,072 Ganga GPIs. This is an API layer on top of what NMCG already tracks — not a replacement.
- **NGT Compliance Reporting**: When NGT orders (like the November 2025 Justice Shrivastava bench order) require compliance reports, Zeno provides cryptographically verified data trails that are more trustworthy than self-reported industry data.
- **NMCG's ₹42,500 Crore Spend Accountability**: NMCG has funded ₹629 crore for the Kanpur CETP, ₹520 crore to VA Tech WABAG — Zeno proves whether these investments are producing actual discharge improvements by correlating facility compliance with satellite-observed water quality.
- **Existing NMCG Tech Stack**: NMCG already uses GIS platforms, SCADA integration, and the CPCB OCEMS portal. Zeno's API routes (`/api/compliance`, `/api/satellite`) are designed to integrate with these systems.

### Grievance Redressal & Dispute Resolution

When a facility disputes a ViolationNFT, the following workflow applies:

1. **Facility raises dispute** via Industry Portal → creates a DisputeVC on HCS with evidence (re-calibration records, maintenance logs, third-party lab results uploaded to IPFS)
2. **SPCB Inspector reviews** via `InterfaceDocumentsSourceBlock` → can request additional evidence or physical inspection
3. **VVB Auditor conducts independent verification** — cross-references satellite data, nearby facility readings, historical patterns
4. **Resolution recorded on HCS** — either:
   - Dispute upheld: ViolationNFT metadata updated with resolution status (NFT remains for audit trail, but flagged as disputed/resolved)
   - Dispute rejected: Penalty enforcement proceeds, escalation to NGT if needed
5. **Appeal path**: Facility can escalate to CPCB (Standard Registry) or file with NGT under Environment Protection Act 1986

This maps directly to NGT's existing dispute resolution procedures while adding blockchain-verified evidence at each step.

---

## Digital Environmental Asset Lifecycle (Daniel Swid's Framework)

Mapping Zeno to the Nature → Measured Outcome → Tradable Unit → Financial Value framework:

| Stage | Daniel's Framework | Zeno Implementation |
|-------|-------------------|---------------------|
| **Nature** (underlying asset) | Ecosystem providing services | Ganga river basin water quality — the "stock" of clean water as ecosystem asset |
| **Measured Outcome** | Science measures change | Verified reduction in pollutant discharge: BOD/COD/TSS/Cr levels at each GPI discharge point, cross-validated by Sentinel-2 satellite imagery showing actual water quality improvement downstream |
| **Tradable Unit** | Tokenized outcome | **GGCC (ComplianceCredit)**: 1 GGCC = 1 facility-day of verified discharge below CPCB thresholds. Not just "compliance status" — it represents measurable pollutant reduction vs. the counterfactual of unmonitored discharge |
| **Financial Value** | Market prices the asset | Compliance credits tradeable between facilities: a clean tannery earns GGCC that a violating tannery can purchase to fund remediation (see Marketplace below). Insurers discount premiums for facilities with consistent GGCC history. NMCG can retire GGCC to prove Namami Gange investment effectiveness. |

**Why this matters for judging**: Daniel emphasized that digital environmental assets need the full lifecycle — from nature through financial value — with trust embedded at every step. Zeno's GGCC isn't just a compliance badge; it's a verifiable claim of environmental improvement backed by sensor data + satellite imagery + KMS signatures, all auditable through the trust chain explorer.

**SEEA (UN System of Environmental-Economic Accounting) Alignment**:
- **Stock accounts** (ecosystem extent + condition): Satellite-derived river water quality indices (turbidity, chlorophyll, CDOM) at 112 CPCB NWMP monitoring stations along Ganga. Tracked over time to show ecosystem condition trends.
- **Flow accounts** (changes): Per-facility discharge quality improvements. Each GGCC token represents a measured flow — the verified change from potential pollution to compliant discharge.
- Dashboard includes a "River Health Trends" panel showing stock account changes: Is the Ganga actually getting cleaner as more facilities achieve compliance? Satellite time-series data answers this independently of OCEMS self-reporting.

---

## Judging Criteria — Full Rubric Response Strategy

### Innovation (10%)

**"Does the team's project align to the hackathon track?"**
Yes — Sustainability track. Zeno directly addresses environmental degradation of India's rivers through blockchain-verified industrial compliance. Not tangentially sustainability (like carbon credits for tech companies) — this is ground-level pollution monitoring for the most polluted river basin on Earth.

**"How innovative is the solution? Does this exist cross-chain?"**
Honest answer: Streamline/KarbonLedger on Cardano has a CETP wastewater prototype (pH/COD/BOD only, no satellite, no AI, Catalyst Fund 15 — not funded yet). Iyer et al. (2019) published an academic paper on Hyperledger for wastewater. Neither is production, neither has Guardian dMRV, neither has KMS-signed device identity, neither has satellite cross-validation. Zeno is the first *comprehensive* blockchain-OCEMS solution — and the first on Hedera.

**"Does this extend, or establish new, capabilities for the Hedera ecosystem?"**
New capabilities established:
- First Guardian dMRV policy for industrial effluent compliance (new methodology for the 60+ library)
- First use of HCS for IoT sensor data audit trails with AWS KMS device-level signing
- First Agent Kit custom plugin for environmental compliance (CompliancePlugin with 4 domain-specific tools)
- First integration pattern: HCS + HTS + Smart Contracts + Guardian + Agent Kit + Satellite cross-validation in a single system
- Novel: parametric compliance insurance via smart contract + satellite trigger (new financial instrument pattern for Hedera)

### Feasibility (10%)

**"Can the proposed idea be created using Hedera network services?"**
All 7 Hedera services used are production-ready: HCS (GA), HTS (GA), Smart Contracts (GA), Guardian (v3.5 GA), Agent Kit (v3.8.0), Mirror Node (GA), KMS (AWS integration via ECDSA secp256k1).

**"Does this need to be a Web3 solution? Or could it be done on Web2?"**
This is the critical question. The Web2 alternative is CPCB's existing cems.cpcb.gov.in portal. Why Web3 is necessary:
1. **CPCB's own data shows the problem**: 1,686 GPIs operate without OCEMS. Of those with OCEMS, 9 documented tampering methods exist. A centralized database controlled by the same entities being monitored cannot provide trust.
2. **Multi-agency distrust**: CPCB, 28 SPCBs, industries, courts (NGT), and citizens all need to trust the same data. No single centralized authority is trusted by all parties. Blockchain provides neutral ground.
3. **Immutability for legal evidence**: IT Act Section 65B requires provable integrity of electronic records. A centralized DB admin can alter records. HCS messages are immutable — once written, no one (not even CPCB) can alter them.
4. **Citizen access**: cems.cpcb.gov.in is not publicly accessible. Blockchain + public portal gives citizens (Article 21 right to clean environment) direct access to compliance data.

**"Does the team understand the problem space?"**
Demonstrated via: CPCB Schedule-VI standards hardcoded, 9 tampering methods documented, Jajmau-Kanpur case study with real numbers (60,000 tonnes chromium, ₹629Cr CETP), NGT order references, CTO-specific discharge limits, ZLD mandates, SPCB hierarchy.

**"Lean / Business Model Canvas"**
Added to submission materials:

| Block | Zeno |
|-------|------|
| Customer Segments | CPCB (national), 28 SPCBs (state), 4,433 GPIs (industry), NMCG (mission) |
| Value Proposition | Tamper-proof compliance verification that all parties trust — regulators, industry, courts, citizens |
| Channels | B2G: GeM (Government e-Marketplace) procurement + NMCG vendor framework. B2B: direct to GPI compliance officers |
| Revenue Streams | SaaS ₹50K/month/facility + GGCC marketplace transaction fees (2%) + parametric insurance premiums (future) |
| Key Resources | Hedera network, Guardian policy engine, AWS KMS infrastructure, Sentinel-2 satellite data (free) |
| Key Activities | Sensor data ingestion, compliance verification, token minting, satellite cross-validation, dispute resolution |
| Key Partners | CPCB, NMCG, OCEMS device manufacturers (Horiba, ABB, Siemens), SPCB IT departments |
| Cost Structure | Hedera transactions ~$540/day at Ganga scale, AWS EC2 ~$240/month |
| Unfair Advantage | Regulatory mandate guarantees market. CPCB *already requires* digital OCEMS — we add the trust layer. Zero competitors. |

### Execution (20%)

**"Were the team able to create an MVP?"**
Yes — fully functioning MVP with 13 components, all running on real Hedera testnet. Transactions verifiable on HashScan. Not a prototype or mockup.

**"Did the team deliver a PoC with a limited, but important, set of features?"**
MVP feature set and WHY each was chosen:
1. **OCEMS data generator** (not optional — can't demo anything without data)
2. **KMS signing** (core differentiator — AWS bounty + production security)
3. **HCS data logging** (fundamental — immutable audit trail)
4. **ComplianceChecker smart contract** (on-chain trustless verification — the "why blockchain" answer)
5. **Guardian dMRV policy** (sustainability track centerpiece — Daniel's domain)
6. **Dashboard with trust chain explorer** (judges need to SEE it working)
7. **AI compliance agent** (differentiator from every other sustainability project)
8. **Satellite cross-validation** (independent verification — the "wow" factor)

**What was intentionally deferred** (and why):
- Full marketplace UI (GGCC transfers work via HTS, but no marketplace frontend — token economy is proven, UI is polish)
- Parametric insurance smart contract (concept demoed, full product is roadmap)
- Hindi localization (i18n framework installed, translations are content work not engineering)
- CI/CD to production (GitHub Actions works, Vercel auto-deploys, EC2 is manual — acceptable for hackathon)

**"Go-To-Market strategy"**
1. **Pilot**: Partner with UPPCB for 10 Kanpur Jajmau tanneries. UPPCB is overwhelmed (851 GPIs, multiple NGT orders). Zeno reduces their monitoring burden.
2. **Entry**: Approach NMCG via their existing vendor framework (VA Tech WABAG, L&T, Tata Projects are current NMCG vendors — Zeno plugs into their infrastructure)
3. **Scale**: GeM procurement for nationwide SPCB deployment. CPCB circular mandating blockchain-verified OCEMS is the ultimate catalyst.
4. **International**: Fork methodology for Yamuna, Godavari, then export to Mekong (Vietnam), Citarum (Indonesia) — same industrial pollution problem globally.

**"Market feedback cycles"**
- Pre-hackathon: Project spec validated against CPCB's September 2025 directive, NGT orders, and NMCG program documents
- During hackathon: Guardian architecture reviewed against Daniel Swid's workshop framework (trust chains, asset lifecycle, methodology design)
- Post-submission: Plan to share demo with 3 environmental engineers and 1 SPCB official (contacts via IIT Kanpur environmental engineering department) for feedback
- README includes a feedback form link for practitioners

**"Design decisions documentation"**
Added to README — key decisions and rationale:
| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| Data layer | Hedera+Supabase vs Mirror Node only | Mirror Node only | Eliminates external database dependency. Mirror Node 3-5s latency acceptable for hackathon demo. All data lives on Hedera — true Web3 architecture with no Web2 crutches. |
| Guardian vs custom dMRV | Build from scratch vs Guardian | Guardian v3.5 | 60+ proven methodologies, W3C VCs, built-in policy engine, Daniel's mentorship available, Hedera ecosystem alignment |
| Smart contract + Guardian | One or both | Both | Guardian = workflow orchestration (off-chain); Smart contract = trustless verification (on-chain, public). Different purposes, not redundant. |
| Satellite source | Landsat-8 vs Sentinel-2 | Sentinel-2 (S2_SR_HARMONIZED) | 10m resolution vs 30m, 5-day revisit vs 16-day, Se2WaQ water quality formulas validated (R²=0.91 for turbidity) |
| Signing | Software keys vs KMS | AWS KMS (ECC_SECG_P256K1) | Keys never leave HSM, CloudTrail audit, AWS bounty alignment, production-grade security |

**"User experience/accessibility"**
- Three-portal design: Regulator (power-user, data-heavy), Industry (self-service, task-focused), Public (simple, Hindi-first)
- Trust chain explorer: one-click drill-down from token to raw sensor data — designed for NGT judges who need evidence
- Responsive design (mobile for SPCB field inspectors on tablets)
- shadcn/ui components for consistent, accessible UI (WCAG 2.1 AA)
- Color-coded compliance: green/yellow/red — universally understood without technical knowledge

### Integration (15%)

**"To what degree does the project use the Hedera network?"**
Deep integration — not superficial "log to HCS and call it blockchain":

| Service | Depth of Integration |
|---------|---------------------|
| HCS | Per-facility topics, sensor data logging, audit trail, dispute resolution records, satellite validation results. Not just logging — structured message schemas queryable via Mirror Node. |
| HTS | 3 distinct token types (FT + 2 NFTs) with full lifecycle: mint, transfer, retire. Token operations triggered by Guardian policy blocks AND smart contract events. |
| Smart Contracts | 2 contracts (ComplianceChecker + PenaltyCalculator) with HTS precompile integration at 0x167. On-chain compliance verification callable by anyone. |
| Guardian | Full 5-stage dMRV policy with 5 roles, 3 VC schemas, multi-step verification, dispute resolution, post-issuance management. Not a toy policy — production-depth workflow. |
| Agent Kit | Custom CompliancePlugin with 4 domain-specific tools + MCP server for external AI integration. Not just wrapping existing tools — genuinely new capabilities. |
| Mirror Node | REST API powers entire dashboard. Historical queries, token data, transaction history. Primary and only data source — true Web3 architecture. |

**"Is a Hedera service being integrated in a way it hasn't been seen before?"**
- **HCS + KMS device identity**: Each OCEMS device has a KMS-backed Hedera account. Device-level signing of IoT sensor data to HCS — not seen in any existing Hedera project.
- **Guardian + satellite cross-validation**: Policy workflow triggers external satellite API via `Http Request Block`, receives water quality indices, and uses them in compliance routing. First Guardian policy with real-time external data cross-validation.
- **Agent Kit + Guardian + HCS**: AI agent queries HCS data via Mirror Node, analyzes for anomalies, and triggers Guardian actions (ViolationNFT minting). First closed-loop AI → blockchain → dMRV pipeline.
- **Smart contract + HTS precompile + Guardian**: Dual compliance checking — Guardian for workflow, smart contract for on-chain proof. Token minting from both paths with consistent state.

### Success (20%)

**"Does the solution positively impact the Hedera network?"**

Quantified impact at scale (1,072 Ganga GPIs → full 4,433 national deployment):

| Metric | Ganga Pilot (1,072) | National (4,433) |
|--------|--------------------|--------------------|
| Hedera Accounts | 3,216 (facility + device + inspector) | 13,300+ |
| Daily HCS Messages | 617,472 | 2,553,408 |
| Daily Smart Contract Calls | ~11,000 | ~45,000 |
| Monthly Active Accounts | 3,000+ | 10,000+ |
| Daily TPS Contribution | ~7 sustained TPS | ~30 sustained TPS |
| GGCC Tokens Minted/Day | ~800 | ~3,300 |

**For hackathon demo (5 facilities)**: ~50 real testnet transactions visible on HashScan. Small but verifiable.

**"Does the solution give the Hedera network exposure to a greater audience?"**
- **Indian government sector**: CPCB, NMCG, 28 SPCBs — Hedera has zero presence in Indian government IT infrastructure today
- **Industrial compliance market**: 4,433 GPIs are large enterprises (Tata Steel, Reliance, UltraTech) — enterprise awareness
- **Environmental NGO sector**: CSE, Toxics Link, SANDRP — advocacy organizations that would amplify Hedera's sustainability narrative
- **Academic**: IIT environmental engineering departments, NEERI — research publication potential
- **International replication**: If India adopts, every developing country with industrial pollution follows — Hedera becomes the default environmental compliance chain

### Validation (15%)

**"Did the team identify where to gain market feedback?"**
Target feedback sources:
1. **CPCB OCEMS division** — The team that runs cems.cpcb.gov.in. They understand the data pipeline and tampering problems firsthand.
2. **UPPCB (UP Pollution Control Board)** — Most stressed SPCB with 851 GPIs. Would be first pilot customer.
3. **IIT Kanpur Environmental Engineering Dept** — Academic validation. They've published on Ganga pollution extensively.
4. **DOVU team** — Closest Guardian precedent (ELV credits in India). Can validate Guardian architecture approach.
5. **NMCG Program Director** — Controls the ₹42,500Cr budget. Would be the ultimate champion.
6. **Industrial facility compliance officers** — End users who currently manage OCEMS data manually.

**"Did the team establish market feedback cycles?"**
- **Cycle 1 (pre-build)**: Project spec validated against CPCB directives, NGT orders, NMCG documents. Architecture reviewed against Daniel's Guardian framework.
- **Cycle 2 (during build)**: Guardian policy reviewed against DOVU MMCM ELV policy structure. AWS KMS implementation validated against Nadine's workshop pattern.
- **Cycle 3 (post-submission)**: Demo shared with 3 environmental engineers for feedback. Google Form feedback survey embedded in public portal. README includes contribution guidelines.
- **Cycle 4 (post-hackathon)**: Approach UPPCB and IIT Kanpur for pilot validation. Document findings for next hackathon iteration (July 2026 Hello Future).

**"What traction have the team achieved?"**
Honest answer for a hackathon:
- No paying customers yet (it's a hackathon project)
- Market validation: CPCB regulatory mandate guarantees the need exists. NGT enforcement orders prove urgency. ₹2.37 crore penalty on 211 Kanpur tanneries proves willingness to enforce.
- Architecture validation: Guardian pattern proven by DOVU/MMCM (world's first certified ELV credits). Same pattern, different domain.
- Competitive moat: Zero existing blockchain-OCEMS solutions globally. First-mover advantage is real and verifiable.

### Pitch (10%)

**"Are the problem and solution presented clearly?"**
Problem in one sentence: "1,686 Indian factories dump untreated waste into the Ganga because no one can prove their monitoring data is real."
Solution in one sentence: "Zeno makes sensor data tamper-proof with blockchain, cross-checks it with satellites, and lets AI catch cheaters."

**"Is the problem big enough for sustained growth?"**
- India: 4,433 GPIs nationally, ₹42,500Cr government program
- Global: Every country with industrial pollution and environmental monitoring mandates (EU IED, US EPA NPDES, China MEE)
- Regulatory tailwinds: EU CBAM (Carbon Border Adjustment Mechanism) + supply chain due diligence laws driving demand for verifiable environmental data
- Problem is growing, not shrinking: industrial output increases, environmental enforcement tightens

**"Were the team able to convey a significant & exciting opportunity?"**
Hook: "60,000 tonnes of chromium flow into the Ganga from Kanpur's tanneries every year — 840× the legal limit. The monitoring system meant to catch this? Industry runs the sensors and reports its own data. Zeno changes that."

**"Do they clearly state their MVP's features & why they chose those?"**
Yes — 8 core MVP features listed with rationale for each. Deferred features (marketplace UI, full insurance product, Hindi translations) explicitly listed with reasons. Shows disciplined scoping, not kitchen-sink thinking.

**"How was Hedera represented in the pitch?"**
Hedera is not just "the blockchain we used" — it's positioned as THE platform for environmental compliance:
- Guardian: purpose-built for dMRV, 60+ methodologies, W3C VCs
- HCS: lowest-cost immutable data logging ($0.0008/msg vs Ethereum L1 gas)
- HTS: native token service without deploying ERC-20 contracts
- Agent Kit: AI-native blockchain interaction
- Mirror Node: free public API for dashboard data
- Pitch explicitly states: "No other blockchain has Guardian + Agent Kit + HCS + HTS + native KMS support in one ecosystem"

---

## Tech Stack (Verified Latest Versions)

| Component | Package | Version (verified March 9, 2026) | Install |
|-----------|---------|---------|---------|
| Hedera SDK | `@hashgraph/sdk` | 2.80.0 | `npm i @hashgraph/sdk` |
| Agent Kit JS | `hedera-agent-kit` | 3.8.0 | `npm i hedera-agent-kit @langchain/core langchain @langchain/langgraph @langchain/openai` |
| AWS KMS | `@aws-sdk/client-kms` | 3.1004.0 | `npm i @aws-sdk/client-kms` |
| Frontend | Next.js | 16.1.6 | `npx create-next-app@latest` |
| UI Components | shadcn/ui | latest | `npx shadcn@latest init` |
| Maps | react-leaflet | 5.0.0 | `npm i react-leaflet leaflet` |
| Charts | recharts | 3.8.0 | `npm i recharts` |
| i18n | next-intl | 4.8.3 | `npm i next-intl` (Hindi + English localization) |
| Smart Contracts | Hardhat | 3.1.11 | `npm i hardhat` (NOTE: Hedera example uses 2.x — test compat) |
| Satellite | earthengine-api | latest | `pip install earthengine-api` |
| Guardian | v3.5.0 (2026-02-17) | Docker | `git clone https://github.com/hashgraph/guardian.git && git checkout 3.5.0` |
| ASN.1 parsing | asn1js | 3.0.7 | `npm i asn1js` (for DER key/sig parsing) |
| Hashing | js-sha3 | 0.9.3 | `npm i js-sha3` (for keccak256) |
| Elliptic curve | elliptic | 6.6.1 | `npm i elliptic` (for public key compression) |
| Validation | zod | 4.3.6 | `npm i zod` (schema validation) |
| Build orchestration | turbo | 2.8.14 | `npm i turbo -D` (monorepo build/test/lint orchestration) |
| LangChain Core | `@langchain/core` | 1.1.31 | (installed with agent-kit) |
| LangChain OpenAI | `@langchain/openai` | 1.2.12 | (installed with agent-kit) |
| LangChain Graph | `@langchain/langgraph` | 1.2.1 | (installed with agent-kit) |
| LangChain | `langchain` | 1.2.30 | (installed with agent-kit) |

---

## Project Structure

```
Zeno/
├── apps/
│   └── web/                          # Next.js 16 frontend
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx              # Landing/public portal
│       │   ├── dashboard/            # Regulator portal
│       │   │   ├── page.tsx          # Compliance heatmap + stats
│       │   │   ├── facilities/       # Facility list + detail views
│       │   │   ├── violations/       # Violation alerts
│       │   │   └── satellite/        # Satellite overlay maps
│       │   ├── industry/             # Industry self-service portal
│       │   │   ├── page.tsx
│       │   │   └── compliance/
│       │   ├── api/                  # API routes
│       │   │   ├── sensor-data/      # Receive generator data
│       │   │   ├── compliance/       # Compliance check endpoints
│       │   │   ├── satellite/        # GEE proxy endpoints
│       │   │   └── agent/            # AI agent chat endpoint
│       │   └── public-portal/        # Citizen access
│       ├── components/
│       │   ├── ui/                   # shadcn components
│       │   ├── map/                  # React-Leaflet Ganga map
│       │   ├── charts/              # Recharts time-series
│       │   └── agent/               # AI chat interface
│       └── lib/
│           ├── hedera/              # Hedera SDK wrappers + Mirror Node queries
│           └── utils.ts
├── packages/
│   ├── simulator/                   # OCEMS Data Generator (Node.js)
│   │   ├── src/
│   │   │   ├── index.ts             # Main generator entry
│   │   │   ├── facilities.ts        # Facility configs (Kanpur tanneries etc.)
│   │   │   ├── generators.ts        # Sensor data generators with realistic ranges
│   │   │   └── standards.ts         # CPCB Schedule-VI discharge thresholds
│   │   └── package.json
│   ├── blockchain/                  # Hedera integration layer
│   │   ├── src/
│   │   │   ├── hcs.ts              # HCS topic creation + message submission
│   │   │   ├── hts.ts              # HTS token creation + minting
│   │   │   ├── kms-signer.ts       # AWS KMS signing pipeline
│   │   │   ├── mirror.ts           # Mirror Node API queries
│   │   │   └── client.ts           # Hedera client setup
│   │   └── package.json
│   ├── contracts/                   # Solidity smart contracts
│   │   ├── contracts/
│   │   │   ├── ComplianceChecker.sol
│   │   │   └── PenaltyCalculator.sol
│   │   ├── scripts/
│   │   ├── test/
│   │   └── hardhat.config.js
│   ├── agent/                       # AI Compliance Agent
│   │   ├── src/
│   │   │   ├── index.ts            # Agent setup with Agent Kit
│   │   │   ├── compliance-plugin.ts # Custom CompliancePlugin (4 tools)
│   │   │   └── prompts.ts          # System prompts
│   │   └── package.json
│   └── satellite/                   # Sentinel-2 cross-validation (Python)
│       ├── api.py                   # FastAPI endpoint
│       ├── water_quality.py         # Se2WaQ index computation
│       └── requirements.txt
├── guardian/                        # Guardian policy files
│   ├── policies/
│   │   └── zeno-dmrv.policy.json
│   └── schemas/
│       ├── FacilityRegistration.json
│       ├── SensorReading.json
│       └── SatelliteValidation.json
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml                   # GitHub Actions: lint → typecheck → test → build
├── turbo.json                       # Turborepo pipeline config
├── package.json                     # Monorepo root (npm workspaces + turbo)
└── README.md
```

---

## Build Phases (Incremental, Demo-First)

### Phase 0: Account Setup (Before coding)
**Goal**: Get Hedera testnet + AWS accounts ready

0a. **Hedera Testnet Account**
    - Go to portal.hedera.com → Register → Create testnet account
    - Save ACCOUNT_ID (0.0.xxxxx) and PRIVATE_KEY (ECDSA DER format)
    - Use faucet to get testnet HBAR

0b. **AWS Account + KMS Setup** (from Nadine's workshop — exact steps)
    - Create AWS account at aws.amazon.com/console
    - Install AWS CLI: `brew install awscli` (Mac) or official installer
    - Verify: `aws --version`
    - Create IAM user (NOT root): `aws iam create-user --user-name hedera-kms-user`
    - Create policy from `hedera-kms-policy.json`:
      ```json
      {
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Action": ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"],
          "Resource": "*"
        }]
      }
      ```
    - `aws iam create-policy --policy-name hedera-kms-signing-policy --policy-document file://hedera-kms-policy.json`
    - Get account ID: `aws sts get-caller-identity`
    - Attach policy: `aws iam attach-user-policy --user-name hedera-kms-user --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/hedera-kms-signing-policy`
    - Create access keys: `aws iam create-access-key --user-name hedera-kms-user`
    - Configure CLI with new user: `aws configure` → access key, secret key, us-east-1, json
    - Create KMS key: `aws kms create-key --key-spec ECC_SECG_P256K1 --key-usage SIGN_VERIFY --description "OCEMS device signing key"`
    - Create alias: `aws kms create-alias --alias-name alias/hedera-signing-key --target-key-id <keyId>`
    - Verify: `aws kms describe-key --key-id alias/hedera-signing-key`
    - Verify public key accessible: `aws kms get-public-key --key-id alias/hedera-signing-key`
    - Save KMS_KEY_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY to .env

0c. **Google Earth Engine**
    - Sign up at earthengine.google.com
    - Create Google Cloud Project (required since 2025)
    - Enable Earth Engine API
    - Create Service Account with Earth Engine access
    - Download service account JSON key

**Verification**: `aws sts get-caller-identity` returns hedera-kms-user ARN, `aws kms describe-key` shows ECC_SECG_P256K1 key enabled

### Phase 1: Foundation (Day 1)
**Goal**: Project scaffold + Hedera testnet connectivity + OCEMS data generator running

1. **Initialize monorepo** with npm workspaces + Turborepo
   - `turbo.json` defines build pipeline: `packages/blockchain` → `packages/simulator` → `packages/contracts` → `packages/agent` → `apps/web`
   - Dependency graph: `apps/web` depends on `packages/blockchain` and `packages/agent`. When `packages/blockchain` changes, Turbo knows to rebuild `apps/web` automatically.
   - Scripts: `turbo run build`, `turbo run test`, `turbo run lint` — parallel execution with caching
   - `.turbo/` cache for incremental builds (dramatically speeds up CI)
2. **Set up Next.js 16** with TypeScript, Tailwind, shadcn/ui
3. **Create Hedera client** (`packages/blockchain/src/client.ts`)
   - Connect to testnet using `Client.forTestnet().setOperator()`
   - Verify with balance query via Mirror Node REST API
4. **Build OCEMS data generator** (`packages/simulator/`)
   - Generate regulatory-authentic sensor data: pH, BOD, COD, TSS, Cr, DO, flow, temp
   - CRITICAL: Always ensure COD > BOD (fundamental chemistry constraint)
   - 15-minute intervals per facility (96 readings/day × 6 params = 576 HCS msgs/day/facility)
   - Start with 5 Kanpur tannery facilities (Jajmau cluster)
   - Kanpur tanneries should violate COD ~50% of the time (mean 350 mg/L against 250 limit)
   - **ZLD enforcement**: Distilleries and select pharma units are mandated Zero Liquid Discharge — ANY discharge is a violation regardless of parameter quality. The generator should produce ZLD-mandated facilities that occasionally discharge (violation scenario) alongside normal discharge-permitted facilities.
   - **CTO-specific limits**: Each facility config includes optional CTO override limits. When present, compliance checking uses CTO limits instead of Schedule-VI defaults. Demo includes at least one facility with stricter CTO limits (e.g., tannery near drinking water intake with BOD ≤ 20 instead of ≤ 30).
   - CPCB thresholds hardcoded from Schedule-VI standards as defaults
   - Exact generation ranges per parameter:

     | Parameter | Limit | Generator Range |
     |-----------|-------|----------------|
     | pH | 5.5–9.0 | 6.5–8.5 |
     | BOD (3-day, 27°C) | ≤ 30 mg/L | 5–25 |
     | COD | ≤ 250 mg/L | 50–200 (compliant) / 250–400 (violation) |
     | TSS | ≤ 100 mg/L | 20–80 |
     | Temperature | ≤ 5°C above ambient | 25–38 |
     | Total Chromium | ≤ 2.0 mg/L | 0.1–1.5 (tanneries) |
     | Hex. Chromium | ≤ 0.1 mg/L | 0.01–0.08 |
     | Oil & Grease | ≤ 10 mg/L | 2–8 |
     | Ammoniacal N | ≤ 50 mg/L | 5–35 |

   - 17 CPCB mandatory OCEMS industry categories to support:
     Pulp & Paper, Distillery, Sugar, Tanneries, Thermal Power, Cement, Oil Refineries, Fertilizer, Chlor-Alkali, Dye & Dye Intermediates, Pesticides, Pharma, Iron & Steel, Copper Smelting, Zinc Smelting, Aluminium, Petrochemicals

**Verification**: `npm run simulator` outputs JSON sensor readings to console with realistic values, COD always > BOD

### Phase 2: Blockchain Core (Day 2-3)
**Goal**: Sensor data flowing to Hedera testnet, visible on HashScan

5. **HCS Topic Creation** (`packages/blockchain/src/hcs.ts`)
   - Create dedicated HCS topic per facility
   - **Ingestion validation layer** (`packages/blockchain/src/validator.ts`):
     - JSON Schema validation against SensorReading schema before any HCS submission
     - Range checks: reject physically impossible values (pH < 0, pH > 14, negative concentrations, temperature > 100°C)
     - Chemistry constraint enforcement: reject if COD ≤ BOD (violates fundamental chemistry)
     - Timestamp sanity: reject readings with future timestamps or >24hr stale timestamps
     - KMS signature verification: verify the kmsSigHash matches the reading payload before accepting
     - Malformed packet handling: log rejected readings to a separate HCS "audit" topic for investigation
     - **Production note**: Real OCEMS devices output Modbus RTU / HART / 4-20mA analog signals. In production, a protocol adapter (Node-RED or custom gateway) normalizes these to JSON before the validation layer. For hackathon, the data generator outputs the normalized JSON format directly.
   - Submit validated sensor readings as HCS messages (base64 JSON)
   - Query messages back via Mirror Node: `GET /api/v1/topics/{topicId}/messages`
   - Each reading includes: timestamp, facilityDID, all parameters, sensorStatus, kmsKeyId, kmsSigHash

   **Offline/Connectivity Handling** (addresses India's industrial area connectivity reality):
   - KMS signing happens locally (hash computed on device, only 32-byte digest sent to KMS — works on low-bandwidth)
   - When connectivity is lost, readings are KMS-signed and queued locally with original timestamps
   - On reconnection, batch upload: all queued readings submitted to HCS preserving original timestamps
   - `sensorStatus` field tracks: `"online"`, `"offline_queued"`, `"reconnected_batch"`
   - Offline periods >4 hours without prior maintenance notification trigger anomaly flag in AI agent
   - This mirrors real OCEMS behavior — CPCB already handles intermittent connectivity from remote industrial areas

6. **HTS Token Creation** (`packages/blockchain/src/hts.ts`)
   - Create ComplianceCredit fungible token (GGCC)
   - Create ViolationNFT collection
   - Create ComplianceCertificateNFT collection
   - All with metadata linking to VPs on IPFS
   - Mint tokens on compliance/violation events

7. **AWS KMS Signing Pipeline** (`packages/blockchain/src/kms-signer.ts`)
   Based on the official `hedera-dev/aws-kms-workshop` repo (from Nadine's workshop):

   **Step 1: Fetch & Convert Public Key (DER → Compressed 33 bytes)**
   - `GetPublicKeyCommand` returns DER-encoded X.509 SPKI format (88 bytes)
   - Strip DER header bytes: `3056301006072a8648ce3d020106052b8104000a034200`
   - Remaining: raw uncompressed key (65 bytes, starts with 0x04)
   - Compress using elliptic library → 33 bytes
   - Add Hedera DER prefix: `302d300706052b8104000a032200` → Hedera-compatible ECDSA public key
   - Use `PublicKey.fromBytes()` to create Hedera PublicKey object

   **Step 2: Create Hedera Account with KMS Key**
   - `AccountCreateTransaction().setKey(kmsPublicKey).setInitialBalance()`
   - Execute with operator client, get new account ID
   - This account's private key exists ONLY in AWS HSM

   **Step 3: Build Custom Signer**
   ```
   const signer = async (message: Uint8Array) => {
     const hash = keccak256(message);  // 32-byte digest
     const signRes = await kmsClient.send(new SignCommand({
       KeyId: KMS_KEY_ID,
       Message: hash,
       MessageType: "DIGEST",  // CRITICAL: prevents double-hashing
       SigningAlgorithm: "ECDSA_SHA_256"
     }));
     return parseDERSignature(signRes.Signature);  // 64-byte R||S
   };
   ```

   **Batch Signing Strategy** (cost optimization):
   - Each 15-minute reading window produces multiple parameter values per facility
   - These are bundled into a single JSON reading object and signed ONCE per batch (1 KMS call per reading, not per parameter)
   - At scale: 96 readings/day × 1 sign/reading = 96 KMS calls/day/facility (not 576)
   - The signed batch hash (`kmsSigHash`) is included in the HCS message, allowing anyone to verify the entire reading's integrity

   **Step 4: Parse DER Signature → Raw 64-byte R||S**
   - KMS returns DER-encoded signature
   - Parse with asn1js: extract R and S integers
   - Strip leading 0x00 padding bytes
   - Pad each to exactly 32 bytes
   - Concatenate: `Buffer.concat([r, s])` → 64-byte raw signature

   **Step 5: Sign & Execute Transactions**
   - Build transaction → freeze → sign with custom signer → execute
   - Verify on HashScan: account shows KMS public key

   **Key Rotation Demo**
   - Create new KMS key → Get new public key → `CryptoUpdateTransaction` signed by BOTH old and new keys → Schedule deletion of old key after grace period

   **CloudTrail Verification**
   - `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=Sign`
   - Shows every signing operation with timestamp, user ARN, key ID

**Verification**: Transactions visible on hashscan.io/testnet with KMS-signed keys. CloudTrail shows sign events. Account key matches KMS public key (verify via diff checker).

### Phase 3: Smart Contracts (Day 3-4)
**Goal**: On-chain verifiable compliance layer

**Architecture clarification — Guardian vs Smart Contracts (not redundant)**:
- **Guardian `calculateContainerBlock`** = off-chain policy workflow orchestration. Runs inside Guardian's Docker environment. Handles the full dMRV lifecycle: document validation, role-based routing, token minting triggers. NOT publicly verifiable by third parties.
- **ComplianceChecker.sol** = on-chain trustless verification. Deployed on Hedera EVM, callable by ANYONE (regulators, courts, citizens, NGOs). Provides an independent, public, permissionless compliance check that doesn't require trusting Guardian's internal state.
- **Why both**: A regulator can query the smart contract directly on-chain to verify compliance without needing access to Guardian. If Guardian and the smart contract ever disagree, the smart contract (on-chain, immutable) is the arbiter. Guardian handles workflow; smart contract handles trust.

8. **ComplianceChecker.sol** (`packages/contracts/`)
   - Deploy via Hardhat to Hedera testnet using JSON-RPC relay
   - **Two-tier threshold system**:
     - **Default**: CPCB Schedule-VI general standards (hardcoded):
       pH 5.5–9.0, BOD ≤ 30, COD ≤ 250, TSS ≤ 100, Cr ≤ 2.0, Hex Cr ≤ 0.1, O&G ≤ 10, NH₃-N ≤ 50, Temp ≤ 5°C above ambient
     - **CTO-specific overrides**: Per-facility custom limits from their Consent to Operate (stored on-chain during registration). CTO limits are STRICTER than Schedule-VI for sensitive zones. When `ctoCustomLimits` is set, those values override defaults.
   - **ZLD enforcement mode**: For categories mandated Zero Liquid Discharge (distilleries, some pharma), ANY discharge triggers violation regardless of parameter values. Checked via `ctoDischargeMode == "ZLD"` flag.
   - Returns compliance boolean per parameter + overall status
   - Uses HTS precompile at `0x167` for token interactions (mint GGCC on compliance, ViolationNFT on violation)

9. **PenaltyCalculator.sol**
   - Graduated penalty tiers based on violation severity and frequency
   - Integrates with ViolationNFT minting
   - Penalty metadata: facility, parameter, reading value, threshold, timestamp

**Verification**: `npx hardhat test` passes, both contracts deployed on testnet, visible on HashScan

### Phase 4: Dashboard (Day 4-6)
**Goal**: Visual dashboard with live data from Hedera

10. **Ganga River Map** (`apps/web/components/map/`)
    - React-Leaflet with OpenStreetMap tiles
    - GPI facility markers along Ganga (Kanpur Jajmau cluster, Varanasi, Allahabad)
    - Color-coded: green (compliant), red (violation), yellow (warning)
    - Click marker → facility detail panel with all parameters
    - State distribution: UP 851, Uttarakhand 61, West Bengal 43, Bihar 40 GPIs

11. **Time-Series Charts** (`apps/web/components/charts/`)
    - Recharts LineChart for pH, BOD, COD, TSS, Chromium over time
    - ReferenceLines at CPCB thresholds
    - Periodic polling of Mirror Node REST API for updates
    - **River Health Trends panel** (SEEA stock account visualization):
      Satellite-derived water quality over time for Ganga segments near industrial clusters. Shows whether the river is actually getting cleaner — independent of OCEMS self-reporting. Uses NDTI/NDCI time-series from Sentinel-2 archives. This answers the question "Is Namami Gange working?" with data, not bureaucratic reports.

12. **Regulator Dashboard** (`apps/web/app/dashboard/`)
    - Aggregate compliance heatmap
    - Violation alerts feed with severity levels
    - Facility compliance scores
    - Token minting activity (from Mirror Node)
    - Nine tampering method detection alerts (calibration drift, sample dilution, bypass piping, sensor disconnection, software manipulation, strategic timing, capacity gaming, wrong placement, reagent tampering)
    - **Trust Chain Explorer** (`apps/web/components/trust-chain/`):
      Click any ComplianceCertificateNFT or ViolationNFT → expandable trust chain showing ALL underlying data:
      ```
      Token (NFT/FT)
      └── Aggregated Compliance Report (VP)
          ├── Facility Registration VC (identity, CTO, GPS, device serial)
          ├── Sensor Readings VCs (each individual 15-min reading)
          │   ├── Raw values (pH, BOD, COD, TSS, Cr...)
          │   ├── KMS Signature Hash → link to CloudTrail
          │   └── HCS Message ID → link to HashScan
          ├── Satellite Validation VC (NDTI, turbidity, correlation score)
          │   └── Sentinel-2 tile ID + date → link to GEE viewer
          └── VVB Auditor Sign-off VC (if applicable)
      ```
      Inspired by Daniel's metered cooking devices example (3,254 devices → verified monitoring reports → emission reductions). Every token is fully auditable down to individual sensor readings.

13. **Industry Portal** (`apps/web/app/industry/`)
    - Self-service compliance monitoring
    - ComplianceCertificateNFT download
    - Remediation tracking
    - Facility registration form matching FacilityRegistration VC schema

14. **Public Portal** (`apps/web/app/public-portal/`)
    - Citizen access to river health data
    - Satellite overlay maps showing water quality
    - Compliance scores per industrial cluster
    - **Hindi localization** (via next-intl): Public portal fully available in Hindi for Ganga basin citizens. Regulator dashboard bilingual (English primary, Hindi labels). SPCB inspectors in UP/Bihar operate in Hindi — all violation alerts, facility names, and status indicators display in Hindi when locale is set.

15. **Mirror Node Data Layer** (`apps/web/lib/hedera/mirror.ts`)
    - All dashboard data served directly from Mirror Node REST API — true Web3 architecture, no Web2 database dependency

    **Data architecture — Hedera is the ONLY data store**:
    ```
    Write path:  Generator → KMS Sign → HCS Submit → Hedera Ledger (ONLY DATA STORE)

    Read path:   Dashboard → Mirror Node REST API (testnet.mirrornode.hedera.com/api/v1/)
                           → HCS messages for sensor readings
                           → HTS queries for token data
                           → Transaction queries for audit trail
    ```
    - Dashboard polls Mirror Node periodically (every 10s) for new readings
    - Mirror Node latency: 3-5s behind ledger — acceptable for compliance monitoring (not a trading dashboard)
    - Every reading links to HashScan for visual verification
    - Typed wrapper functions in `packages/blockchain/src/mirror.ts` handle pagination, parsing, error handling
    - Client-side caching with React state to avoid redundant API calls

**Verification**: Dashboard displays live data from Mirror Node. Every reading links to HashScan. No external database required.

### Phase 5: AI Compliance Agent (Day 6-7)
**Goal**: Natural language compliance queries

16. **Custom CompliancePlugin** (`packages/agent/src/compliance-plugin.ts`)
    Based on Hedera Agent Kit v3.8.0 plugin architecture:
    ```typescript
    export interface Plugin {
      name: string;        // "ZenoCompliancePlugin"
      version?: string;    // "1.0.0"
      description?: string;
      tools: (context: Context) => Tool[];
    }
    ```
    4 tools using Zod-typed parameters:
    - `check_sensor_compliance`: Query HCS messages via Mirror Node, parse sensor readings, compare against CPCB Schedule-VI thresholds, return compliance status + violations list
    - `detect_anomalies`: Statistical z-score analysis on sliding windows. Flag: sudden pH drops >2 units in <1 hour, suspiciously constant BOD readings (calibration gaming), offline periods >4 hours without prior notification
    - `cross_validate_satellite`: Call GEE Python API for Sentinel-2 water quality at facility GPS coordinates. Compare satellite-derived turbidity (NDTI) with OCEMS TSS readings. Return correlation score.
    - `mint_violation_nft`: Use Core Token Plugin to mint ViolationNFT when non-compliance confirmed. Metadata includes facility, parameter, reading, threshold, timestamp.

17. **Agent Chat Interface** (`apps/web/components/agent/`)
    - Chat UI component in dashboard
    - API route at `/api/agent` using LangChain v1
    - System prompt: "You are a CPCB compliance officer assistant..."
    - Example queries: "Show me all BOD violations in Kanpur this week", "Which facilities had suspiciously constant readings in the last 24 hours?"

18. **MCP Server Integration** (`packages/agent/src/mcp-server.ts`)
    Agent Kit v3.8.0 includes a built-in MCP (Model Context Protocol) server. Zeno exposes compliance-specific tools via MCP:
    - Wrap the 4 CompliancePlugin tools as MCP tool endpoints
    - MCP server runs on port 3001 (configurable), exposing: `check_compliance`, `detect_anomalies`, `cross_validate`, `get_facility_status`
    - This allows ANY MCP-compatible AI client (Claude Desktop, custom LLM apps, government AI assistants) to query Zeno's compliance data without building custom integrations
    - Implementation: Use Agent Kit's `startMCPServer()` method with custom tool registration
    - **Demo**: Show Claude Desktop connecting to Zeno's MCP server and querying facility compliance
    - Config: `packages/agent/mcp-config.json` with tool schemas matching the Zod-typed parameters from CompliancePlugin

**Verification**: Chat interface responds to compliance queries with real data from Hedera. Agent can detect anomalies and trigger NFT minting.

### Phase 6: Satellite Cross-Validation (Day 7-8)
**Goal**: Periodic independent satellite verification of OCEMS readings

19. **GEE Water Quality API** (`packages/satellite/`)
    - FastAPI endpoint accepting GPS coordinates + date range
    - Use `COPERNICUS/S2_SR_HARMONIZED` (harmonized version for consistency)
    - Cloud mask using SCL band (classes 7-10)
    - Se2WaQ formulas (exact from spec):

      | Parameter | Formula | Unit |
      |-----------|---------|------|
      | Turbidity | `8.93 × (B03/B01) − 6.39` | NTU |
      | Chlorophyll-a | `4.26 × (B03/B01)^3.94` | mg/m³ |
      | CDOM | `537 × exp(−2.93 × B03/B04)` | mg/l |
      | DOC | `432 × exp(−2.24 × B03/B04)` | mg/l |

    - Key indices: NDTI = `(B4−B3)/(B4+B3)` for turbidity, NDCI = `(B5−B4)/(B5+B4)` for chlorophyll-a
    - Sentinel-2 revisits every ~5 days
    - Use `reduceRegion` with `ee.Reducer.median()` for point extraction
    - Always set `scale=20` explicitly in reducers
    - Auth: Service Account with Cloud Project (required since 2025)

20. **Cross-Validation Logic**

    **Important: Satellite validation is periodic (every ~5 days), not real-time.**
    Sentinel-2 revisits every ~5 days. OCEMS generates readings every 15 minutes. This means satellite cross-validates ~0.2% of readings directly. The three-tier validation strategy:

    - **Tier 1 (continuous)**: AI agent anomaly detection — z-score analysis, pattern detection, calibration drift flags. Covers 100% of readings in real-time.
    - **Tier 2 (periodic, every ~5 days)**: Satellite cross-validation — compare OCEMS TSS with satellite-derived turbidity at discharge point and downstream. Independent verification that doesn't rely on OCEMS data at all.
    - **Tier 3 (on-demand)**: VVB Auditor manual sampling — triggered by Tier 1 or Tier 2 discrepancies.

    Satellite-specific logic:
    - If OCEMS says compliant but satellite shows turbidity spike → flag as anomalous
    - If satellite turbidity is high but OCEMS TSS reads low → potential sensor manipulation
    - Discrepancies exceeding configurable thresholds trigger ViolationNFT minting + SPCB alert
    - Satellite results are stored as SatelliteValidation VCs with correlation scores against the corresponding OCEMS readings from that time window

    **Data Sources**:
    - Sentinel-2 via GEE: `ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')`
    - Se2WaQ custom script reference: custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/se2waq/
    - SERVIR water quality GEE scripts: github.com/SERVIR/water-quality-gee
    - CPCB NWMP data (112 Ganga locations): cpcb.nic.in/nwmp-data/
    - India-WRIS portal (19,501 water quality stations): indiawris.gov.in
    - ISRO Bhuvan Ganga layers: bhuvan.nrsc.gov.in

**Verification**: `curl http://localhost:8000/water-quality?lat=26.4499&lon=80.3319` returns real Sentinel-2 derived indices for Kanpur

### Phase 7: Guardian dMRV on AWS EC2 (Day 8-10)
**Goal**: Full Guardian policy engine deployed on cloud

21. **Guardian EC2 Setup**
    - Provision EC2: **t3.2xlarge (8 vCPU, 32GB RAM, 100GB gp3 SSD)** — ~$0.33/hr (~$240/month)
      - Guardian runs 15+ containers (MongoDB, NATS, Redis, guardian-service, policy-service, worker, mrv-sender, logger, auth, api-gateway, nginx, AI service, etc.)
      - 16GB (t3.xlarge) is insufficient — MongoDB alone needs 4-6GB, Guardian services need 8-10GB, Redis/NATS need 2-3GB
      - 32GB provides headroom for policy dry-runs and concurrent API requests
    - Install Docker + Docker Compose on Ubuntu 22.04
    - **Production architecture note** (for pitch roadmap, not hackathon scope):
      - Hackathon: single EC2 is acceptable for demo with ~5 facilities
      - Production: ECS Fargate with service-level containers, RDS for MongoDB replacement, ElastiCache for Redis, ALB for load balancing, auto-scaling groups per service
      - The hackathon demo proves the architecture works; the pitch deck shows the production scaling path
    - Clone guardian repo: `git clone https://github.com/hashgraph/guardian.git && cd guardian`
    - Checkout v3.5 tag
    - Copy `.env.template` to `.env`, set `GUARDIAN_ENV="develop"`
    - JWT signing keys required for ALL microservices (v3.2+ requirement):
      Generate RSA 2048 key pairs for each service OR use `SERVICE_JWT_SECRET_KEY_ALL`
    - IPFS via Filebase (`IPFS_PROVIDER="filebase"`, get free API key from filebase.com)
    - Config in `./configs/.env.develop.guardian.system`:
      - `OPERATOR_ID`, `OPERATOR_KEY`, `HEDERA_NET=testnet`
      - `IPFS_STORAGE_API_KEY` from Filebase
    - `docker compose up -d --build` (first build: 15-30 min, 15+ containers: MongoDB, NATS, Redis, Guardian services, nginx proxy, AI service)
    - Access UI at `http://<ec2-ip>:3000`
    - Swagger API at `http://<ec2-ip>:3000/api-docs/v1/`
    - Open security group: ports 3000 (UI), 3002 (API)

22. **dMRV Policy — Five Roles**

    **Standard Registry (CPCB)**
    - Publishes compliance methodology
    - Defines discharge standards per industry category (17 CPCB types)
    - Approves facility registrations

    **Project Proponent (Industrial Facility)**
    - Registers facility profile via `requestVCDocumentBlock` (FacilityRegistration schema)
    - Submits OCEMS data via `externalDataBlock` (sensor_data_intake from generator via REST API)
    - Responds to violations

    **VVB Auditor**
    - Independent cross-validation of OCEMS data against satellite + manual sampling results
    - Reviews SatelliteValidation VCs

    **SPCB Inspector** (multi-tenant, scoped per state)
    - `InterfaceDocumentsSourceBlock` for pending registrations → `InterfaceActionBlock` (Approve/Reject)
    - Monitors compliance within their state jurisdiction only (e.g., UPPCB sees only UP facilities)
    - Multi-state support: 28 SPCBs + 8 UTCCs, each with their own inspector accounts
    - State-level filtering via `state` field in FacilityRegistration VC
    - Ganga basin states for demo: UP (851 GPIs), Uttarakhand (61), West Bengal (43), Bihar (40)
    - Each SPCB can have multiple inspectors — Guardian role supports multiple accounts per role

    **IoT Data Service** (device identity + data integrity)
    - Automated middleware submitting KMS-signed sensor readings via Guardian REST API
    - Uses `externalDataBlock` with schema UUID + policyTag filter
    - **Device Identity Management**:
      - Each OCEMS device gets a unique KMS key (ECC_SECG_P256K1) → unique Hedera account
      - Device identity VC links: KMS key ID ↔ analyzer serial number ↔ facility DID ↔ SPCB registration
      - Any key mismatch (wrong device signing for a facility) is rejected at ingestion
    - **Tamper detection signals** (in SensorReading):
      - `sensorStatus` field: online/offline/maintenance/calibrating/error
      - Heartbeat: device sends empty heartbeat every 5 minutes. Missing heartbeats → offline alert
      - Sudden value cliffs (pH jumps from 7.2 to 4.1 in one reading) → flag for investigation
    - **Production roadmap** (beyond hackathon): hardware attestation via TPM/secure element, secure boot chain verification, physical tamper-evident seals with QR-linked device identity VCs

23. **Three Core VC Schemas**

    **FacilityRegistration:**
    `facilityName, industryCategory (17 CPCB types), state, district, gpsLatitude, gpsLongitude, ocemsSensorModel, analyzerSerialNumber, dischargePipeGPS, ctoCopyIPFS, ctoNumber, ctoValidUntil, ctoDischargeMode (discharge/ZLD), ctoCustomLimits (JSON: per-parameter overrides from CTO, e.g. {"BOD_mgL": 20, "COD_mgL": 150} — when null, defaults to Schedule-VI)`

    **SensorReading (MRV):**
    `timestamp, facilityDID, pH, BOD_mgL, COD_mgL, TSS_mgL, temperature_C, totalChromium_mgL, dissolvedOxygen_mgL, flow_KLD, sensorStatus, kmsKeyId, kmsSigHash`

    **SatelliteValidation:**
    `sentinelTileDate, NDTI_value, NDCI_value, turbidity_NTU, chlorophyll_mgm3, correlationScore`

24. **Policy Block Flow (Multi-Stage with Verification Rounds)**

    Root `InterfaceContainerBlock` → `PolicyRolesBlock` (5 roles) → Per-role `InterfaceStepBlocks`:

    **Stage 1 — Registration & Approval (two-step)**:
    - Industry Operator: `requestVCDocumentBlock` (FacilityRegistration) → `sendToGuardianBlock`
    - SPCB Inspector: `InterfaceDocumentsSourceBlock` (pending) → `InterfaceActionBlock` (Approve/Reject)
    - If rejected: `reassignBlock` back to Industry Operator with revision notes → resubmit cycle
    - If approved: facility enters active monitoring

    **Stage 2 — Continuous Sensor Ingestion**:
    - IoT Data Service: `externalDataBlock` (sensor_data_intake via REST API, schema UUID + policyTag filter)
    - `documentValidatorBlock` — validates SensorReading schema, checks KMS signature present
    - `calculateContainerBlock` with `calculateMathAddOnBlock`:
      - `BOD_compliant = BOD_mgL <= ctoLimit_BOD ? 1 : 0` (uses CTO limit if set, else Schedule-VI default)
      - `COD_compliant = COD_mgL <= ctoLimit_COD ? 1 : 0`
      - `ZLD_violation = (dischargeMode == 'ZLD' && flow_KLD > 0) ? 1 : 0`
      - `overall_compliant = BOD_compliant && COD_compliant && ... && !ZLD_violation`
    - `switchBlock` routing: compliant path vs violation path

    **Stage 3a — Compliant Path**:
    - `aggregateDocumentBlock` (bundle readings for compliance period)
    - `sendToGuardianBlock` (hedera) for HCS logging
    - `mintDocumentBlock` (ComplianceCredit FT — GGCC)

    **Stage 3b — Violation Path (multi-step verification, not just auto-mint)**:
    - `sendToGuardianBlock` (flag for SPCB Inspector)
    - `Http Request Block` (trigger satellite API for cross-validation at facility GPS)
    - `switchBlock`: satellite confirms violation? OR satellite shows no anomaly?
      - **Satellite confirms**: proceed to VVB Auditor review
      - **Satellite contradicts**: park for manual investigation, create `PendingReviewVC`
    - **VVB Auditor human verification step** (critical — not just automated):
      - `InterfaceDocumentsSourceBlock` (flagged violations with satellite data)
      - VVB reviews: sensor readings + satellite imagery + historical patterns + facility maintenance records
      - `InterfaceActionBlock` (Confirm Violation / Request Re-inspection / Dismiss)
      - If confirmed: `mintDocumentBlock` (ViolationNFT) with VVB signature
      - If dismissed: `sendToGuardianBlock` record dismissal reason on HCS, no NFT minted

    **Stage 4 — Dispute Resolution (iterative)**:
    - Industry Operator: `requestVCDocumentBlock` (DisputeEvidence — re-calibration records, third-party lab results on IPFS)
    - `sendToGuardianBlock` → route to SPCB Inspector
    - `InterfaceActionBlock` (Accept/Reject dispute)
    - If accepted: `reassignBlock` to VVB Auditor for independent re-verification
    - Resolution recorded on HCS — ViolationNFT metadata updated (not deleted — audit trail preserved)
    - If still disputed: escalation path to Standard Registry (CPCB) or NGT

    **Stage 5 — Post-Issuance Management** (token lifecycle):
    - GGCC tokens: transferable between facilities. Clean facility can sell/transfer credits to violating facility.
    - GGCC retirement: facility or NMCG retires tokens to prove compliance history. `retireDocumentBlock` records retirement on HCS with reason.
    - ViolationNFT resolution: when remediation is complete and verified by VVB, a `RemediationVC` is issued and linked to the original ViolationNFT.
    - Periodic compliance certification: after sustained compliance (e.g., 90 days), `mintDocumentBlock` issues ComplianceCertificateNFT — the "gold standard" token that insurers and regulators recognize.

    Use Dry-Run mode during development: `PUT /api/v1/policies/{policyId}/dry-run` — no HBAR spent, virtual users for testing. Supports savepoints to restart from arbitrary execution states.

    **Methodology Library Contribution**:
    The Zeno dMRV policy is designed as a reusable, forkable methodology — not a one-off hackathon project:
    - Policy exported as `zeno-industrial-effluent-compliance-v1.policy` — importable by any Guardian instance
    - Parameterized thresholds: other countries can swap CPCB Schedule-VI for their own discharge standards (EU IED limits, US EPA NPDES limits, China GB standards)
    - Parameterized industry categories: the 17 CPCB categories can be replaced with any jurisdiction's GPI classification
    - Parameterized satellite indices: Se2WaQ works globally, not just for Ganga
    - Intended for submission to Guardian's Methodology Library (60+ existing methodologies) as the first industrial effluent compliance methodology
    - README inside `guardian/policies/` documents how to fork and adapt for other river basins (Yamuna, Godavari, Kaveri, Mekong, Ganges-Brahmaputra-Meghna)

    **Key Guardian References**:
    - Policy blocks documentation: docs.hedera.com/guardian/guardian/standard-registry/policies/policy-creation/introduction
    - DOVU MMCM ELV policy (closest precedent): docs.hedera.com/guardian/guardian/demo-guide/carbon-offsets/dovu-mmcm
    - DOVU open-source policies: github.com/dovuofficial/guardian-policies
    - TYMLEZ CET/CRU IoT template: github.com/Tymlez/guardian-policies
    - API automation guide: docs.hedera.com/guardian/methodology-digitization/methodology-digitization-handbook/part-6/chapter-23
    - 60+ methodology implementations in guardian/Methodology Library/

**Verification**: Guardian UI accessible at EC2 IP. Policy published and running in dry-run mode. Facility registration → sensor data ingestion → compliance check → token minting flow works end-to-end through Guardian API.

### Phase 7b: Testing & CI (Day 10-11)
**Goal**: Automated testing and deployment pipeline

25. **Testing Strategy** (`packages/*/test/`)
    - **Unit tests** (per package):
      - `packages/simulator/test/`: Generator produces valid ranges, COD > BOD invariant, ZLD mode triggers correctly
      - `packages/blockchain/test/`: HCS message format validation, HTS token creation, KMS signer mock for CI (real KMS in integration), DER parsing correctness
      - `packages/contracts/test/`: ComplianceChecker threshold logic (all 9 parameters), CTO override behavior, ZLD enforcement, PenaltyCalculator tier logic, HTS precompile interactions
      - `packages/agent/test/`: Plugin tool parameter validation, anomaly detection z-score math
      - `packages/satellite/test/`: Se2WaQ formula outputs for known band values, cloud masking
    - **Integration tests** (`test/integration/`):
      - End-to-end: generator → KMS sign → HCS submit → Mirror Node query → verify data matches
      - Guardian dry-run: facility registration → sensor ingestion → compliance check → token mint
      - Smart contract: deploy → submit reading → check compliance → verify token minted on-chain
    - **GitHub Actions CI** (`.github/workflows/ci.yml`):
      - On push: lint → typecheck → unit tests → build
      - On PR: above + integration tests (using Hedera testnet operator key from GitHub Secrets)
      - Hardhat tests run against local Hardhat Network for speed, deploy scripts test against testnet

26. **Deployment**
    - Frontend: Vercel (auto-deploy from main branch)
    - Guardian: EC2 with docker-compose (manual deploy, SSH script)
    - Satellite API: EC2 or Railway (FastAPI)

### Phase 8: Polish & Submission (Day 11-14)
**Goal**: Demo-ready, all submission materials complete

27. **Three Portal Views finalized**
    - Regulator: compliance heatmap, enforcement dashboard, violation alerts
    - Industry: self-service monitoring, certificate downloads, remediation tracking
    - Public: citizen river health data with satellite overlays, compliance scores per cluster

28. **Demo Video** (YouTube, mandatory — submission without video will NOT be scored)
    - Flow: Facility registration → sensor data flowing → violation detected → NFT minted → satellite confirms → AI agent explains
    - Show HashScan transactions as proof of real Hedera testnet usage
    - Show CloudTrail audit logs as proof of KMS signing

29. **Pitch Deck** (PDF, 10 slides with timing)
    1. Title + Team (15s): "Project Zeno: Blockchain-Verified Industrial Effluent Compliance for India's Rivers"
    2. The Problem (30s): 60,000 tonnes chromium in Kanpur. 1,686 GPIs without OCEMS. Nine tampering methods. Zero blockchain solutions exist.
    3. The Solution (30s): dMRV on Guardian + AWS KMS signing + AI anomaly detection + satellite cross-validation
    4. Architecture (30s): 13-component diagram showing all 7 Hedera services
    5. Live Demo (90s): Facility registration → sensor data flowing → violation detected → NFT minted → satellite overlay confirming → AI agent explaining
    6. Network Impact (30s): 4,433 facilities, 700K+ daily transactions, 10K+ MAU
    7. Business Model (20s): B2G SaaS ₹50K/month/facility × 4,433 = ₹266Cr TAM + GGCC marketplace transaction fees + parametric insurance premiums
    8. Validation (20s): CPCB mandate, DOVU/MMCM precedent, NGT enforcement orders. Methodology designed for Guardian library contribution.
    9. Roadmap (20s): 10 Kanpur tanneries → All Ganga GPIs → National → Southeast Asia. Methodology forkable for any river basin globally.
    10. Ask (15s): Closing statement — "Zeno is DOVU for water: same proven Guardian dMRV architecture, larger problem, regulatory mandate guaranteeing adoption"

30. **Submission Materials** (Section 11.1 checklist)
    - [ ] GitHub repo with README, architecture docs, deployment instructions
    - [ ] README includes: Design Decisions table, Lean Business Model Canvas, GTM strategy, market feedback plan
    - [ ] Project description (max 100 words — use draft from spec Section 11.2)
    - [ ] Selected track: Sustainability
    - [ ] Selected bounty: AWS
    - [ ] Tech stack list
    - [ ] Pitch deck PDF (covering all 7 judging criteria)
    - [ ] Demo video on YouTube (mandatory)
    - [ ] Project demo link (live working URL): deploy on Vercel (projectzeno.vercel.app)
    - [ ] All GitHub commits within Feb 17 – Mar 23 window
    - [ ] Compulsory feedback questions (takes 20-30 min) — submit at least 1 hour before deadline

    **100-Word Project Description (from spec):**
    > Zeno is a blockchain-based industrial effluent compliance platform built on Hedera Guardian, targeting India's 4,433+ Grossly Polluting Industries mandated by CPCB to install OCEMS. It creates tamper-proof compliance verification by anchoring AWS KMS-signed sensor data to Hedera Consensus Service, running automated threshold checks via Guardian's dMRV policy engine, cross-validating with Sentinel-2 satellite imagery, and minting compliance/violation tokens on Hedera Token Service. An AI compliance agent (Hedera Agent Kit) detects anomalies like calibration drift and sensor disconnection—nine documented tampering methods that undermine the ₹42,500 crore Namami Gange Mission. No blockchain-OCEMS solution exists globally. Zeno makes India's rivers auditable.

---

## AWS Bounty Checklist ($4K 1st place)

**Bounty Problem Statement**: "Secure Key Management for Onchain Applications (Intermediate) — Design and implement a secure key management solution using AWS KMS that enables developers to safely manage cryptographic keys while maintaining compliance and auditability."

### Required Deliverables (mapped 1:1 to bounty requirements):

**1. Secure key generation, storage, and rotation via AWS KMS**
- [ ] Key generation: `aws kms create-key --key-spec ECC_SECG_P256K1 --key-usage SIGN_VERIFY` — the ONLY KMS spec compatible with Hedera's ECDSA secp256k1
- [ ] Key storage: Private keys NEVER leave AWS HSM (FIPS 140-2 Level 3 validated). No private key material exists outside KMS at any point.
- [ ] Key rotation demo: Create new KMS key → derive new Hedera public key → `CryptoUpdateTransaction` signed by BOTH old and new keys → schedule old key deletion after grace period. Demonstrates zero-downtime key rotation for device identity.
- [ ] Multi-key management: Each OCEMS device gets its own KMS key, demonstrating scalable key management (not just one key for the whole app)

**2. Submit a transaction on Hedera**
- [ ] `AccountCreateTransaction` — create Hedera account with KMS-derived public key (proves key generation → account creation flow)
- [ ] `TransferTransaction` — HBAR transfer signed entirely by KMS (proves transaction signing without private key exposure)
- [ ] `TopicMessageSubmitTransaction` — submit KMS-signed sensor data to HCS topics (proves real-world data pipeline usage)
- [ ] All transactions verifiable on HashScan with KMS public key matching account key

**3. Proper access controls and audit logging**
- [ ] IAM least-privilege policy: ONLY `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey` — no `kms:Decrypt`, no `kms:Encrypt`, no admin actions
- [ ] Per-device IAM scoping: each device's IAM role can only access its own KMS key (Resource ARN restriction, not `"Resource": "*"`)
- [ ] CloudTrail enabled: every `Sign`, `GetPublicKey`, `DescribeKey` call logged with timestamp, caller ARN, key ID, source IP
- [ ] CloudTrail verification: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=Sign` — demo shows real signing audit trail
- [ ] IAM policy document included in repo as `iam-policies/hedera-kms-device-policy.json`

**4. Secure transaction signing without exposing private keys**
- [ ] `MessageType: "DIGEST"` pattern — hash locally with keccak256, send only 32-byte digest to KMS (private key never leaves HSM, not even the message content leaves the local environment)
- [ ] DER-to-raw signature parsing: KMS returns DER-encoded ECDSA signature → parse with asn1js → extract R and S integers → strip leading 0x00 padding → pad to 32 bytes each → concatenate to 64-byte raw signature
- [ ] DER-to-compressed public key conversion: `GetPublicKeyCommand` returns 88-byte DER X.509 SPKI → strip header `3056301006072a8648ce3d020106052b8104000a034200` → 65-byte uncompressed key → compress with elliptic library → 33 bytes → add Hedera DER prefix `302d300706052b8104000a032200`
- [ ] Custom signer function that plugs into Hedera SDK's `Transaction.sign()` — no Hedera `PrivateKey` object ever created
- [ ] End-to-end proof: transaction on HashScan → account public key → matches KMS `GetPublicKey` output → CloudTrail shows corresponding Sign event

**5. Working prototype with documentation**
- [ ] Working code in `packages/blockchain/src/kms-signer.ts` with full pipeline
- [ ] Standalone demo script: `packages/blockchain/scripts/kms-demo.ts` — runs the complete flow (create key → derive account → sign transaction → submit to Hedera → verify on HashScan → show CloudTrail) as a single executable demo
- [ ] **Documentation deliverables** (in `docs/aws-kms/`):
  - `architecture.md` — Key management architecture diagram showing: KMS HSM ↔ AWS SDK ↔ Custom Signer ↔ Hedera SDK ↔ Hedera Network. Includes data flow for signing (message → keccak256 hash → KMS Sign → DER parse → raw sig → Hedera TX)
  - `security-controls.md` — IAM policy breakdown, CloudTrail configuration, HSM security guarantees (FIPS 140-2 Level 3), threat model (what KMS protects against: key extraction, unauthorized signing, audit gap), key rotation procedure
  - `hedera-integration.md` — How KMS integrates with each Hedera service (AccountCreate, HCS, HTS, Smart Contracts), DER byte sequence reference, troubleshooting guide
  - `cost-analysis.md` — Per-key cost ($1/month), per-sign cost ($0.15/10K requests), projected costs at scale (1,072 Ganga GPIs → 4,433 national)
  - Architecture diagram generated as PNG/SVG (using D2 or Mermaid)

### Implementation Details (from Nadine's workshop):

**Key code pattern**: Create KMS client → `GetPublicKeyCommand` → strip DER header `3056301006072a8648ce3d020106052b8104000a034200` → compress to 33 bytes → add Hedera prefix `302d300706052b8104000a032200` → create Hedera account → build custom signer → keccak256 hash → `SignCommand` with DIGEST → parse DER sig with asn1js → extract R||S → 64-byte raw signature → execute transaction

**Batch signing strategy** (cost optimization unique to Zeno):
- Each 15-minute OCEMS reading window produces multiple parameter values per facility
- Bundle into single JSON object → hash once → 1 KMS Sign call per reading (not per parameter)
- At scale: 96 readings/day × 1 sign/reading = 96 KMS calls/day/facility
- The signed batch hash (`kmsSigHash`) in HCS message allows anyone to verify the entire reading's integrity

**Reference repo**: github.com/hedera-dev → aws-kms-workshop

**Troubleshooting** (from Nadine's workshop):
- "Access denied exception" → missing IAM policy attachment
- "Invalid key spec" → wrong elliptic curve, must be exactly ECC_SECG_P256K1
- "ECDSA signature invalid" → verify KMS key type, check DER parsing
- Private key not found → check .env or shell environment

**Cost**: ~$1/month per key + $0.15/10K signing requests. Total hackathon cost: under $2.

---

## Hedera Services Integration (7 services for 15% Integration score)

| Service | Usage | Daily Volume (at scale) |
|---------|-------|------------------------|
| HCS (Consensus) | Per-facility sensor data topics, compliance event trail, audit records, satellite validation results, alert messages | ~576 msgs/day/facility |
| HTS (Token) | ComplianceCredit fungible token (GGCC), ViolationNFT, ComplianceCertificateNFT. All with metadata linking to VPs on IPFS. | Per compliance event |
| Smart Contracts | ComplianceChecker.sol (threshold evaluation via HTS precompile at 0x167), PenaltyCalculator.sol (graduated penalties). Deployed via Hardhat. | Per reading batch |
| Guardian (dMRV) | Full policy workflow engine: 5 roles, 3 VC schemas, compliance CalculateBlock, conditional routing, MintBlock for tokens/NFTs | Policy lifecycle |
| Agent Kit | Custom CompliancePlugin with 4 tools: compliance checking, anomaly detection, satellite cross-validation, violation minting. LangChain integration. | Per query |
| Mirror Node | REST API (`testnet.mirrornode.hedera.com/api/v1/`) for historical HCS message queries, token data, transaction history. Powers the dashboard. | Continuous |
| AWS KMS | Enterprise key management for OCEMS device signing. ECC_SECG_P256K1 keys. CloudTrail audit logs. Satisfies AWS bounty requirements. | Per signing op |

**Network Impact Projections (Success Criterion — 20%)**:
- Accounts Created: 4,433 facility + 4,433 device + ~500 inspector/auditor + ~100 regulator = 9,466+ Hedera accounts
- Daily Transactions: 576 HCS msgs/day × 1,072 Ganga GPIs = 617,472 daily HCS messages + compliance checks + NFT mints + smart contract calls = ~700K+ daily transactions
- Monthly Active Accounts: 4,433 facilities reporting continuously + inspectors + regulators + public portal users = 10,000+ MAU
- Cost Efficiency (honest full breakdown at 1,072 Ganga GPI scale):
  - HCS: 576 msgs/day × 1,072 facilities × $0.0008 = **$494/day**
  - KMS: Using **batch signing** — 1 KMS sign per 15-min reading batch (not per parameter). 96 batches/day × 1,072 facilities = 102,912 KMS calls/day. At $0.15/10K = **$1.54/day**
  - KMS keys: $1/month × 1,072 keys = **$35.70/day**
  - Guardian EC2 (t3.2xlarge): **$7.92/day**
  - **Total: ~$539/day (~₹13.6 lakh/month)** — still trivial vs ₹42,500 crore Namami Gange budget
  - Hackathon demo (5 facilities): < $0.50/day total

---

## Token Economy & Marketplace

Zeno's tokens are tradeable digital environmental assets, not just compliance badges:

**GGCC (ComplianceCredit FT)**:
- 1 GGCC = 1 facility-day of verified compliant discharge
- **Earned by**: Facilities that pass all threshold checks + satellite validation for a full day
- **Traded to**: Violating facilities that need to demonstrate remediation progress. A tannery with chronic COD violations can purchase GGCC from a compliant tannery to fund shared CETP improvements.
- **Retired by**: NMCG (to prove Namami Gange investment ROI), insurers (to validate risk reduction), facilities (to build compliance history for CTO renewal)
- **Marketplace**: Simple P2P transfer via HTS. Dashboard shows available GGCC for sale with facility compliance history. Future: integrate with carbon credit marketplaces.

**ViolationNFT**:
- Non-fungible, non-transferable (soulbound to facility account)
- Contains: violation parameters, readings, threshold exceeded, satellite confirmation, VVB sign-off
- Resolution pathway: facility completes remediation → VVB verifies → RemediationVC issued → linked to ViolationNFT
- Penalty escalation: repeated ViolationNFTs trigger graduated penalties via PenaltyCalculator.sol

**ComplianceCertificateNFT**:
- Issued after sustained compliance (90+ consecutive compliant days)
- Transferable — can be shown to insurers, regulators, customers, export partners
- Premium token: includes full trust chain (all underlying sensor readings + satellite validations)

**Parametric Compliance Insurance** (inspired by Daniel's Tahoe wildfire insurance example):
- Concept: Facilities purchase parametric insurance. When satellite data independently confirms water quality degradation near their discharge point (beyond a threshold), insurance automatically pays out remediation funds.
- Implementation: Smart contract holds insurance premium pool. `Http Request Block` in Guardian triggers satellite API. If satellite-derived turbidity exceeds parameterized threshold downstream of facility, smart contract releases payout to the facility's remediation escrow.
- This is the "cherry on top" feature that directly maps to Daniel's wildfire mitigation finance framework — replacing fire risk with water pollution risk, prescribed burns with effluent treatment, and insurance premium discounts with GGCC-based compliance history.
- **For hackathon**: Demo the concept with a single parametric trigger. Full insurance product is roadmap.

---

## CPCB Discharge Standards (Hardcode These)

```typescript
const DISCHARGE_LIMITS = {
  pH: { min: 5.5, max: 9.0 },
  BOD_mgL: 30,
  COD_mgL: 250,
  TSS_mgL: 100,
  temperature_C_above_ambient: 5,
  totalChromium_mgL: 2.0,
  hexChromium_mgL: 0.1,
  oilAndGrease_mgL: 10,
  ammoniacalN_mgL: 50,
} as const;
```

---

## Verification & Testing (End-to-End)

1. **Data Generator**: `cd packages/simulator && npm start` → outputs realistic sensor JSON, COD > BOD always
2. **Blockchain**: Check hashscan.io/testnet for HCS messages and HTS tokens — real transactions
3. **AWS KMS**: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=Sign` → shows real signing events
4. **Smart Contracts**: `cd packages/contracts && npx hardhat test` → all pass, deployed on testnet
5. **Dashboard**: `cd apps/web && npm run dev` → http://localhost:3000 → live data from Hedera via Mirror Node
6. **AI Agent**: Chat interface responds to "Show violations in Kanpur" with real data
7. **Satellite**: `curl http://localhost:8000/water-quality?lat=26.4499&lon=80.3319` → returns real Sentinel-2 indices
8. **Guardian**: Policy running on EC2, facility registration → sensor ingestion → compliance check → token mint flow works via Guardian API
9. **End-to-end**: Generator produces violation → KMS signs → HCS logged → Guardian processes → smart contract flags → ViolationNFT minted → satellite cross-validates → dashboard shows alert → AI agent reports it

---

## Competitive Landscape — The Empty Field

| Entity | Chain | Focus | Status |
|--------|-------|-------|--------|
| DOVU/MMCM | Hedera | End-of-Life Vehicle carbon credits in India | Production — world's first certified ELV Credits |
| Streamline/KarbonLedger | Cardano | CETP wastewater dMRV (pH/COD/BOD) | Prototype only, seeking funding via Catalyst Fund 15 |
| Iyer et al. (2019) | Hyperledger | Academic: blockchain + anomaly detection for wastewater reuse | Paper + GitHub demo only (VJTI Mumbai) |
| AlgoAir (Hedera) | Hedera | IoT air quality monitoring with HCS | Hackathon winner — air, not water |
| **Zeno** | **Hedera** | **Full OCEMS compliance dMRV for industrial effluent** | **FIRST GLOBALLY** |

Zeno is effectively "DOVU for water" — applying the same proven Guardian dMRV architecture that delivered certified ELV Credits with Indian government regulatory compliance, but to a larger, more urgent problem space (4,433 industrial facilities vs. vehicle scrappage yards).

---

## Key References

- Hedera Portal (testnet): portal.hedera.com
- Hedera SDK docs: docs.hedera.com
- Guardian docs: docs.hedera.com/guardian
- Guardian repo: github.com/hashgraph/guardian
- DOVU MMCM policy: docs.hedera.com/guardian/guardian/demo-guide/carbon-offsets/dovu-mmcm
- Agent Kit JS: github.com/hashgraph/hedera-agent-kit-js (v3.8.0)
- Agent Kit Python: github.com/hashgraph/hedera-agent-kit-py
- Hardhat template: github.com/hashgraph/hedera-hardhat-example-project
- AWS KMS tutorial: docs.hedera.com/hedera/tutorials/more-tutorials/HSM-signing/aws-kms
- KMS workshop repo: github.com/hedera-dev (aws-kms-workshop)
- KMS workshop video: youtube.com/watch?v=WCZtadWOOBE
- Mirror Node API: testnet.mirrornode.hedera.com/api/v1/
- HashScan explorer: hashscan.io/testnet/
- CPCB discharge standards: cpcb.nic.in/GeneralStandards.pdf
- CPCB OCEMS portal: cems.cpcb.gov.in
- CPCB NWMP data: cpcb.nic.in/nwmp-data/
- Se2WaQ script: custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/se2waq/
- SERVIR GEE scripts: github.com/SERVIR/water-quality-gee
- Hackathon page: hackathon.stackup.dev/web/events/hedera-hello-future-apex-hackathon-2026
