# Zeno Guardian dMRV — Build Plan

## Architecture Decision

Guardian sits as the **governance/orchestration layer** on top of our existing blockchain pipeline.

```
OUR PIPELINE (already built, 38/38 tests):
  Generator → KMS Sign → Validator → HCS → Mirror Node → Compliance Engine → HTS Mint

GUARDIAN (to build):
  Governance: roles, approvals, VC creation, trust chains, audit trail
  Connected via REST API middleware

THEY RUN IN PARALLEL — Guardian does NOT replace our pipeline.
Guardian adds: W3C Verifiable Credentials, role-based workflow, auditable trust chain.
```

## What We Have (Verified)

| Component | Status | Location |
|-----------|--------|----------|
| OCEMS Generator (11 facilities, 113 tests) | DONE | packages/simulator/ |
| HCS (envelope-wrapped, 4 system topics + per-facility) | DONE | packages/blockchain/src/hcs.ts |
| HTS (GGCC 0.0.8144733, ZVIOL 0.0.8144734, ZCERT 0.0.8144735) | DONE | packages/blockchain/src/hts.ts |
| KMS Signer (account 0.0.8148249, two-layer signing) | DONE | packages/blockchain/src/kms-signer.ts |
| Compliance Engine (Schedule-VI + CTO overrides + ZLD) | DONE | packages/blockchain/src/compliance.ts |
| Validator (3-tier, 738 lines) | DONE | packages/blockchain/src/validator.ts |
| Smart Contracts (ComplianceChecker + PenaltyCalculator deployed) | DONE | packages/contracts/ |
| Satellite API (FastAPI, 5 endpoints, real Sentinel-2) | DONE | packages/satellite/ |
| Trust Chain Builder | DONE | packages/blockchain/src/trust-chain.ts |
| Mirror Node Wrappers | DONE | packages/blockchain/src/mirror.ts |
| E2E Pipeline (38/38 passing) | DONE | scripts/e2e-pipeline.ts |
| Guardian Schemas | EMPTY | guardian/schemas/ |
| Guardian Policy | EMPTY | guardian/policies/ |

## MGS Setup (Verified)

- URL: https://guardianservice.app/
- API: https://guardianservice.app/api/v1/
- Account: 0.0.7231410 (ED25519)
- DID: did:hedera:testnet:4VgrsrHeV4tegS3M7B5N17v795zUEdeHexYtWA8E94Jr_0.0.8155225
- Balance: ~798.97 HBAR
- Profile: "Central Pollution Control Board" (Standard Registry)
- iREC v7 imported as reference (Draft)

---

## PHASE 1: Create Guardian Schemas (via MGS UI)

### Schema 1: FacilityRegistration (entity: VC)

Create on MGS → Manage Schemas → + New → Policy Schemas tab

| Field Key | Title | Type | Required | Notes |
|-----------|-------|------|----------|-------|
| facilityId | Facility ID | String | Required | e.g., KNP-TAN-001 |
| facilityName | Facility Name | String | Required | |
| industryCategory | Industry Category | Enum | Required | tannery, dyes, distillery, dairy, sugar, pulp_paper, thermal_power, cement, oil_refinery, fertilizer, chlor_alkali, pesticides, pharma, iron_steel, copper_smelting, zinc_smelting, aluminium |
| state | State | String | Required | e.g., Uttar Pradesh |
| district | District | String | Required | e.g., Kanpur Nagar |
| gpsLatitude | GPS Latitude | Number | Required | |
| gpsLongitude | GPS Longitude | Number | Required | |
| ocemsSensorModel | OCEMS Sensor Model | String | Required | e.g., Horiba ENDA-600ZG |
| analyzerSerialNumber | Analyzer Serial | String | Required | |
| ctoNumber | CTO Number | String | Required | Consent to Operate ID |
| ctoValidUntil | CTO Valid Until | String (date) | Required | ISO date |
| ctoDischargeMode | Discharge Mode | Enum | Required | discharge, ZLD |
| ctoBODLimit | CTO BOD Limit (mg/L) | Number | None | Custom limit if stricter than Schedule-VI |
| ctoCODLimit | CTO COD Limit (mg/L) | Number | None | |
| ctoTSSLimit | CTO TSS Limit (mg/L) | Number | None | |
| deviceKmsKeyId | Device KMS Key ID | String | Required | AWS KMS key ARN |
| deviceHederaAccountId | Device Hedera Account | Account | Required | KMS-backed account |

### Schema 2: SensorReading (entity: VC, entityType: MRV)

This is the MRV schema — receives data via externalDataBlock.

| Field Key | Title | Type | Required | Notes |
|-----------|-------|------|----------|-------|
| timestamp | Timestamp | String (date-time) | Required | ISO 8601 |
| facilityId | Facility ID | String | Required | Links to FacilityRegistration |
| pH | pH | Number | Required | Range: 0-14 |
| BOD_mgL | BOD (mg/L) | Number | Required | |
| COD_mgL | COD (mg/L) | Number | Required | Must be > BOD |
| TSS_mgL | TSS (mg/L) | Number | Required | |
| temperature_C | Temperature (°C) | Number | Required | |
| totalChromium_mgL | Total Chromium (mg/L) | Number | Required | |
| hexChromium_mgL | Hex Chromium (mg/L) | Number | None | |
| oilAndGrease_mgL | Oil & Grease (mg/L) | Number | None | |
| ammoniacalN_mgL | Ammoniacal N (mg/L) | Number | None | |
| dissolvedOxygen_mgL | Dissolved Oxygen (mg/L) | Number | None | |
| flow_KLD | Flow (KLD) | Number | Required | ZLD: any >0 = violation |
| sensorStatus | Sensor Status | Enum | Required | online, offline_queued, reconnected_batch, maintenance, calibrating |
| kmsKeyId | KMS Key ID | String | Required | |
| kmsSigHash | KMS Signature | String | Required | Hex-encoded 64-byte sig |
| overallCompliant | Compliant | Boolean | None | Auto Calculate: set by customLogicBlock |
| tokenAction | Token Action | Enum | None | mint_ggcc, mint_violation_nft, none |

### Schema 3: ComplianceEvaluation (entity: VC)

| Field Key | Title | Type | Required | Notes |
|-----------|-------|------|----------|-------|
| evaluationId | Evaluation ID | String | Required | |
| facilityId | Facility ID | String | Required | |
| evaluatedAt | Evaluated At | String (date-time) | Required | |
| limitsSource | Limits Source | Enum | Required | schedule_vi, cto_override |
| isZLD | ZLD Mode | Boolean | Required | |
| pH_compliant | pH Compliant | Boolean | Required | |
| pH_value | pH Value | Number | Required | |
| BOD_compliant | BOD Compliant | Boolean | Required | |
| BOD_value | BOD Value | Number | Required | |
| COD_compliant | COD Compliant | Boolean | Required | |
| COD_value | COD Value | Number | Required | |
| TSS_compliant | TSS Compliant | Boolean | Required | |
| TSS_value | TSS Value | Number | Required | |
| temp_compliant | Temp Compliant | Boolean | Required | |
| temp_value | Temp Value | Number | Required | |
| chromium_compliant | Chromium Compliant | Boolean | Required | |
| chromium_value | Chromium Value | Number | Required | |
| overallCompliant | Overall Compliant | Boolean | Required | |
| violationCount | Violation Count | Integer | Required | |
| criticalViolationCount | Critical Violations | Integer | Required | |
| tokenAction | Token Action | Enum | Required | mint_ggcc, mint_violation_nft, pending_review, none |

### Schema 4: SatelliteValidation (entity: VC)

| Field Key | Title | Type | Required | Notes |
|-----------|-------|------|----------|-------|
| facilityId | Facility ID | String | Required | |
| sentinelTileDate | Sentinel Tile Date | String (date) | Required | |
| NDTI_value | NDTI Value | Number | Required | Turbidity index |
| NDCI_value | NDCI Value | Number | Required | Chlorophyll index |
| turbidity_NTU | Turbidity (NTU) | Number | Required | Se2WaQ formula |
| chlorophyll_mgm3 | Chlorophyll (mg/m³) | Number | Required | |
| correlationScore | Correlation Score | Number | Required | OCEMS vs satellite |

---

## PHASE 2: Create Tokens in Guardian

Go to Tokens → Create Token for each:

### Token 1: GGCC (ComplianceCredit)
- Name: Zeno Green Ganga Compliance Credit
- Symbol: GGCC
- Type: Fungible
- Decimals: 0
- Initial Supply: 0
- Enable Admin: Yes (Standard Registry)
- Enable Wipe: Yes

### Token 2: ZVIOL (ViolationNFT)
- Name: Zeno Violation Record
- Symbol: ZVIOL
- Type: Non-Fungible
- Enable Admin: Yes
- Enable Wipe: No (violations are immutable)

### Token 3: ZCERT (ComplianceCertNFT)
- Name: Zeno Compliance Certificate
- Symbol: ZCERT
- Type: Non-Fungible
- Enable Admin: Yes

NOTE: These are NEW Guardian-managed tokens (separate from our existing SDK tokens).
Guardian needs its own tokens to manage within the policy workflow.
Our SDK tokens (0.0.8144733 etc.) remain for the direct pipeline path.

---

## PHASE 3: Build Policy (via MGS UI)

### Policy Metadata
- Name: Zeno Industrial Effluent dMRV
- Description: Blockchain-verified industrial effluent compliance for India's GPIs under CPCB Schedule-VI
- Policy Tag: zeno_dmrv_v1
- Version: 1.0.0

### Roles (PolicyRolesBlock)
1. **Facility** — Industrial plant operator (Project Proponent)
2. **SPCB** — State Pollution Control Board inspector
3. **VVB** — Verification/Validation Body auditor
4. **IoT** — Automated sensor data service

(Standard Registry = CPCB, already configured)

### Block Structure

```
Policy (InterfaceContainerBlock) [root]
│
├── choose_role (PolicyRolesBlock)
│   roles: [Facility, SPCB, VVB, IoT]
│
├── facility_workflow (InterfaceContainerBlock) [permissions: Facility]
│   │
│   ├── facility_steps (InterfaceStepBlock)
│   │   │
│   │   ├── register_facility (requestVCDocumentBlock)
│   │   │   schema: FacilityRegistration
│   │   │   tag: facility_registration_form
│   │   │
│   │   ├── save_registration_hedera (sendToGuardianBlock)
│   │   │   dataSource: auto
│   │   │   documentType: Hedera
│   │   │
│   │   ├── save_registration_db (sendToGuardianBlock)
│   │   │   dataSource: auto
│   │   │   documentType: Database
│   │   │
│   │   └── wait_for_approval (InformationBlock)
│   │       type: text
│   │       description: "Registration submitted. Awaiting SPCB approval."
│   │
│   ├── save_registration_approved (sendToGuardianBlock) [receives from SPCB approve event]
│   │   tag: facility_approved
│   │
│   ├── sign_by_cpcb (reassigningBlock)
│   │   issuer: Standard Registry (CPCB signs approved registrations)
│   │
│   ├── save_signed_registration_hedera (sendToGuardianBlock)
│   │
│   ├── save_signed_registration_db (sendToGuardianBlock)
│   │
│   └── facility_dashboard (InterfaceContainerBlock)
│       │
│       ├── my_compliance_page (InterfaceContainerBlock)
│       │   └── compliance_grid (InterfaceDocumentsSourceBlock)
│       │       └── compliance_source (DocumentsSourceAddOn)
│       │           schema: ComplianceEvaluation
│       │
│       └── my_tokens_page (InterfaceContainerBlock)
│           └── tokens_grid (InterfaceDocumentsSourceBlock)
│               └── tokens_source (DocumentsSourceAddOn)
│
├── iot_workflow (InterfaceContainerBlock) [permissions: IoT]
│   │
│   ├── sensor_data_intake (externalDataBlock) ◄◄◄ KEY BLOCK
│   │   tag: sensor_data_intake
│   │   entityType: MRV
│   │   schema: SensorReading
│   │   permissions: IoT
│   │
│   ├── validate_reading (documentValidatorBlock)
│   │   schema: SensorReading
│   │   conditions: validate KMS signature presence, pH range, COD > BOD
│   │
│   ├── compliance_check (customLogicBlock) ◄◄◄ COMPLIANCE LOGIC
│   │   tag: compliance_check
│   │   outputSchema: ComplianceEvaluation
│   │   JavaScript: (see PHASE 4 below)
│   │
│   ├── save_evaluation_hedera (sendToGuardianBlock)
│   │
│   ├── compliance_router (switchBlock) ◄◄◄ ROUTING
│   │   conditions:
│   │     - if tokenAction == "mint_ggcc" → compliant_path
│   │     - if tokenAction == "mint_violation_nft" → violation_path
│   │     - else → review_path
│   │
│   ├── compliant_path (InterfaceContainerBlock)
│   │   ├── save_compliant (sendToGuardianBlock)
│   │   └── mint_ggcc (mintDocumentBlock)
│   │       tokenId: [GGCC token created in Phase 2]
│   │       rule: "1" (1 GGCC per compliant evaluation)
│   │
│   ├── violation_path (InterfaceContainerBlock)
│   │   ├── save_violation (sendToGuardianBlock)
│   │   │   tag: violation_flagged
│   │   └── mint_violation_nft (mintDocumentBlock)
│   │       tokenId: [ZVIOL token created in Phase 2]
│   │       rule: "1"
│   │
│   └── review_path (InterfaceContainerBlock)
│       └── save_for_review (sendToGuardianBlock)
│           tag: pending_review
│
├── spcb_workflow (InterfaceContainerBlock) [permissions: SPCB]
│   │
│   ├── pending_registrations_page (InterfaceContainerBlock)
│   │   ├── registrations_grid (InterfaceDocumentsSourceBlock)
│   │   │   ├── registrations_need_approve (DocumentsSourceAddOn)
│   │   │   │   schema: FacilityRegistration, status: need_approve
│   │   │   └── registrations_approved (DocumentsSourceAddOn)
│   │   │       schema: FacilityRegistration, status: approved
│   │   └── approve_registration_btn (buttonBlock)
│   │       tag: approve_facility
│   │       → triggers: save_registration_approved
│   │
│   ├── violations_page (InterfaceContainerBlock)
│   │   └── violations_grid (InterfaceDocumentsSourceBlock)
│   │       └── violations_source (DocumentsSourceAddOn)
│   │           schema: ComplianceEvaluation
│   │           filter: overallCompliant = false
│   │
│   └── compliance_monitor_page (InterfaceContainerBlock)
│       └── monitor_grid (InterfaceDocumentsSourceBlock)
│           └── monitor_source (DocumentsSourceAddOn)
│               schema: ComplianceEvaluation
│
├── vvb_workflow (InterfaceContainerBlock) [permissions: VVB]
│   │
│   ├── flagged_violations_page (InterfaceContainerBlock)
│   │   ├── flagged_grid (InterfaceDocumentsSourceBlock)
│   │   │   └── flagged_source (DocumentsSourceAddOn)
│   │   │       schema: ComplianceEvaluation
│   │   │       filter: tokenAction = pending_review
│   │   └── verify_btn (buttonBlock)
│   │       options: [Confirm Violation, Dismiss]
│   │
│   └── satellite_data_page (InterfaceContainerBlock)
│       └── satellite_grid (InterfaceDocumentsSourceBlock)
│           └── satellite_source (DocumentsSourceAddOn)
│               schema: SatelliteValidation
│
├── save_registration_rejected (sendToGuardianBlock) [receives from reject event]
│   └── registration_rejected (InformationBlock)
│
├── VP (InterfaceContainerBlock)
│   └── vp_grid (InterfaceDocumentsSourceBlock)
│       └── vp_source (DocumentsSourceAddOn)
│
└── trust_chain (InterfaceContainerBlock)
    └── trustChainBlock (reportBlock)
        ├── MintTokenItem (reportItemBlock) — token mint record
        ├── evaluation_report (reportItemBlock) — compliance evaluation
        ├── reading_report (reportItemBlock) — sensor reading VC
        ├── facility_report_approved (reportItemBlock) — approved registration
        └── facility_report_submit (reportItemBlock) — submitted registration
```

---

## PHASE 4: customLogicBlock JavaScript (Compliance Check)

This runs INSIDE Guardian's policy engine. Must be self-contained.

```javascript
// Zeno Compliance Check — CPCB Schedule-VI
// Runs in Guardian customLogicBlock
// Input: SensorReading credentialSubject
// Output: ComplianceEvaluation credentialSubject

(function() {
  const cs = Array.isArray(doc?.document?.credentialSubject)
    ? doc.document.credentialSubject[0]
    : doc?.document?.credentialSubject;

  if (!cs) { done(null); return; }

  // CPCB Schedule-VI Default Limits
  const LIMITS = {
    pH: { min: 5.5, max: 9.0, type: 'range' },
    BOD_mgL: { max: 30, type: 'max' },
    COD_mgL: { max: 250, type: 'max' },
    TSS_mgL: { max: 100, type: 'max' },
    temperature_C: { max: 40, type: 'max' },  // ambient + 5
    totalChromium_mgL: { max: 2.0, type: 'max' },
    hexChromium_mgL: { max: 0.1, type: 'max' },
    oilAndGrease_mgL: { max: 10, type: 'max' },
    ammoniacalN_mgL: { max: 50, type: 'max' }
  };

  // TODO: CTO override lookup (from linked FacilityRegistration VC)

  let violationCount = 0;
  let criticalCount = 0;
  const results = {};

  // ZLD check first
  const isZLD = false; // Will be set from facility registration link
  if (isZLD && cs.flow_KLD > 0) {
    violationCount++;
    criticalCount++;
  }

  // Parameter-by-parameter check
  for (const [param, limit] of Object.entries(LIMITS)) {
    const value = cs[param];
    if (value === undefined || value === null) continue;

    let compliant = true;
    if (limit.type === 'range') {
      compliant = value >= limit.min && value <= limit.max;
    } else {
      compliant = value <= limit.max;
    }

    results[param + '_compliant'] = compliant;
    results[param + '_value'] = value;

    if (!compliant) {
      violationCount++;
      const deviation = limit.type === 'range'
        ? (value > limit.max ? (value - limit.max) / limit.max : (limit.min - value) / limit.min)
        : (value - limit.max) / limit.max;
      if (deviation > 0.5) criticalCount++;
    }
  }

  const overallCompliant = violationCount === 0;
  let tokenAction = 'none';
  if (overallCompliant) {
    tokenAction = 'mint_ggcc';
  } else if (criticalCount > 0) {
    tokenAction = 'mint_violation_nft';
  } else {
    tokenAction = 'pending_review';
  }

  // Build ComplianceEvaluation output
  const evaluation = {
    evaluationId: 'EVAL-' + Date.now(),
    facilityId: cs.facilityId,
    evaluatedAt: new Date().toISOString(),
    limitsSource: 'schedule_vi',
    isZLD: isZLD,
    ...results,
    overallCompliant: overallCompliant,
    violationCount: violationCount,
    criticalViolationCount: criticalCount,
    tokenAction: tokenAction
  };

  done(evaluation);
})();
```

---

## PHASE 5: Test with Dry Run

1. On MGS, set policy to Dry Run mode: Draft dropdown → "Dry Run"
2. Create virtual users:
   - Virtual Facility user
   - Virtual SPCB user
   - Virtual IoT user
3. Test flow:
   a. Facility: submit FacilityRegistration
   b. SPCB: approve registration
   c. IoT: submit SensorReading (compliant)
   d. Verify: customLogicBlock produces ComplianceEvaluation
   e. Verify: switchBlock routes to compliant_path
   f. Verify: mintDocumentBlock mints GGCC
   g. IoT: submit SensorReading (violation — COD > 250)
   h. Verify: routes to violation_path, mints ZVIOL
4. Check trust chain: click any minted token → drill down to reading

---

## PHASE 6: Build Middleware (packages/guardian-middleware/)

Node.js service that bridges our pipeline to Guardian:

```
packages/guardian-middleware/
├── src/
│   ├── index.ts           # Express server
│   ├── guardian-auth.ts    # MGS login + token refresh
│   ├── guardian-api.ts     # Submit data to policy blocks by tag
│   ├── pipeline-bridge.ts  # Our generator → Guardian externalDataBlock
│   └── config.ts          # MGS URL, policy ID, tags
├── package.json
└── tsconfig.json
```

### Key API calls:

```typescript
// 1. Login to MGS
POST https://guardianservice.app/api/v1/accounts/login
Body: { "username": "...", "password": "..." }
→ Returns refreshToken

// 2. Get access token
POST https://guardianservice.app/api/v1/accounts/access-token
Body: { "refreshToken": "..." }
→ Returns accessToken

// 3. Submit sensor reading to externalDataBlock
POST https://guardianservice.app/api/v1/policies/{policyId}/tag/sensor_data_intake/blocks
Headers: { Authorization: Bearer <accessToken> }
Body: {
  "document": {
    "timestamp": "2026-03-11T12:00:00Z",
    "facilityId": "KNP-TAN-001",
    "pH": 7.2,
    "BOD_mgL": 22,
    "COD_mgL": 180,
    "TSS_mgL": 65,
    "temperature_C": 32,
    "totalChromium_mgL": 1.2,
    "flow_KLD": 450,
    "sensorStatus": "online",
    "kmsKeyId": "907fbc7e-...",
    "kmsSigHash": "0x3a8f..."
  },
  "ref": null
}

// 4. Query compliance evaluations
GET https://guardianservice.app/api/v1/policies/{policyId}/tag/compliance_check/blocks
```

### Pipeline Bridge Flow:

```
1. Generator produces SensorReading
2. KMS signs it (kms-signer.ts)
3. Validator validates it (validator.ts)
4. PARALLEL:
   a. Submit to HCS (our pipeline — immutable audit trail)
   b. Submit to Guardian externalDataBlock (governance workflow)
5. Guardian processes: validate → compliance check → route → mint
6. Our middleware listens for mint events → records token IDs
```

---

## PHASE 7: Publish Policy + Wire to Dashboard

1. Validate policy (Validation button in MGS)
2. Publish policy (Draft → Publish, set version 1.0.0)
3. Record policy ID and topic IDs in .env
4. Wire dashboard API routes to Guardian:
   - /api/compliance → query Guardian compliance evaluations
   - /api/trust-chain → query Guardian trust chain
   - /api/facilities → query Guardian facility registrations
5. Keep existing Mirror Node routes for HCS/HTS data

---

## PHASE 8: Trust Chain (Daniel's "Wow Factor")

Configure reportBlock with reportItemBlocks so clicking any token shows:

```
GGCC Token #47
└── ComplianceEvaluation VC (evaluationId, overallCompliant, tokenAction)
    ├── SensorReading VC (pH: 7.2, BOD: 22, COD: 180, TSS: 65...)
    │   ├── KMS Signature: 0x3a8f...
    │   └── Facility ID: KNP-TAN-001
    ├── FacilityRegistration VC (approved by SPCB)
    │   ├── CTO Number: UP/2025/TAN/1234
    │   ├── Industry: Tannery
    │   └── GPS: 26.4499, 80.3319
    └── SatelliteValidation VC (optional)
        ├── NDTI: 0.23
        └── Correlation: 0.87
```

This is Daniel's metered cooking device pattern — every token auditable to raw data.

---

## Execution Order & Time Estimates

| Phase | Task | Est. Time |
|-------|------|-----------|
| 1 | Create 4 schemas on MGS UI | 1-2 hours |
| 2 | Create 3 tokens on MGS | 15 min |
| 3 | Build policy blocks on MGS UI | 3-4 hours |
| 4 | Write customLogicBlock JS | 30 min (code ready above) |
| 5 | Dry Run testing | 1-2 hours |
| 6 | Build middleware | 2-3 hours |
| 7 | Publish + wire to dashboard | 1-2 hours |
| 8 | Trust chain configuration | 1 hour |
| **TOTAL** | | **~10-14 hours** |

## Risk Mitigations

1. **If customLogicBlock can't do complex compliance**: Fall back to calculateContainerBlock + calculateMathAddonBlock for threshold checks
2. **If switchBlock routing fails**: Use event-based routing (output events from customLogicBlock to different branches)
3. **If MGS has API limitations**: Use the UI for manual testing, API for automation
4. **If token minting in Guardian fails** (like tokenConfirmationBlock bug from Discord): Mint via SDK in middleware instead (EggoLogic pattern — Guardian for governance, SDK for tokens)
5. **If schemas are too complex**: Flatten ComplianceEvaluation — store per-parameter results as individual boolean fields instead of nested arrays

## What This Proves to Judges

| Judge Criterion | What Guardian Adds |
|---|---|
| **Innovation** | First Guardian dMRV for industrial effluent — new methodology for library |
| **Feasibility** | Production platform (v3.5), MGS free hosting, DOVU precedent |
| **Execution** | Full 5-role policy, 4 schemas, dual token minting, trust chain |
| **Integration** | Guardian = 7th Hedera service (HCS + HTS + Contracts + Guardian + Agent Kit + Mirror + KMS) |
| **Success** | Forkable methodology for other river basins globally |
| **Validation** | Daniel's lifecycle framework applied 1:1 (Nature → Outcome → Unit → Value) |
| **Pitch** | "DOVU for water" — one sentence the judge understands |
