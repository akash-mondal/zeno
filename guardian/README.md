# Guardian dMRV Policy Engine

Zeno's Guardian component provides the governance and orchestration layer for industrial effluent compliance verification. It runs on **Managed Guardian Service (MGS)** — Hedera's free hosted Guardian instance — and manages the full digital MRV (Measurement, Reporting, Verification) lifecycle.

## Architecture

Guardian sits as a **parallel governance layer** alongside Zeno's existing blockchain pipeline:

```
EXISTING PIPELINE (packages/blockchain/):
  Generator → KMS Sign → Validator → HCS → Mirror Node → Compliance Engine → HTS Mint

GUARDIAN (this directory):
  Governance: roles, approvals, VC creation, trust chains, audit trail
  Connected via REST API middleware

They run in parallel — Guardian does NOT replace the pipeline.
Guardian adds: W3C Verifiable Credentials, role-based workflow, auditable trust chain.
```

## MGS Instance

| Property | Value |
|----------|-------|
| URL | https://guardianservice.app/ |
| API Base | https://guardianservice.app/api/v1/ |
| Hedera Account | 0.0.7231410 (ED25519) |
| DID | did:hedera:testnet:4VgrsrHeV4tegS3M7B5N17v795zUEdeHexYtWA8E94Jr_0.0.8155225 |
| Standard Registry | Central Pollution Control Board (CPCB) |
| Network | Hedera Testnet |

## Schemas (Deployed on MGS)

All schemas are deployed as Draft on MGS. JSON source files in `schemas/` match the Guardian internal format (with `_mgs` metadata for tracking).

| Schema | Topic ID | Entity | Fields | Purpose |
|--------|----------|--------|--------|---------|
| [FacilityRegistration](schemas/FacilityRegistration.json) | 0.0.8162024 | VC | 17 | Industrial facility identity, CTO details, OCEMS device info, KMS key binding |
| [SensorReading](schemas/SensorReading.json) | 0.0.8162042 | VC | 16 | OCEMS sensor data with CPCB Schedule-VI parameters, KMS signature |
| [ComplianceEvaluation](schemas/ComplianceEvaluation.json) | 0.0.8162309 | VC | 21 | Per-parameter compliance results, violation counts, token action |
| [SatelliteValidation](schemas/SatelliteValidation.json) | 0.0.8162313 | VC | 7 | Sentinel-2 Se2WaQ water quality indices for cross-validation |

### Schema Field Summary

**FacilityRegistration** — Facility identity + Consent to Operate
- facilityId, facilityName, industryCategory (18 CPCB categories)
- state, district, gpsLatitude, gpsLongitude
- ocemsSensorModel, analyzerSerialNumber
- ctoNumber, ctoValidUntil, ctoDischargeMode (discharge/ZLD)
- ctoBODLimit, ctoCODLimit, ctoTSSLimit (optional CTO overrides)
- deviceKmsKeyId, deviceHederaAccountId

**SensorReading** — MRV data from OCEMS devices
- timestamp, facilityId
- pH, BOD_mgL, COD_mgL, TSS_mgL, temperature_C, totalChromium_mgL
- hexChromium_mgL, oilAndGrease_mgL, ammoniacalN_mgL, dissolvedOxygen_mgL (optional)
- flow_KLD, sensorStatus
- kmsKeyId, kmsSigHash (cryptographic proof)

**ComplianceEvaluation** — Output of compliance check
- evaluationId, facilityId, evaluatedAt, limitsSource, isZLD
- Per-parameter: pH/BOD/COD/TSS/temp/chromium _compliant + _value
- overallCompliant, violationCount, criticalViolationCount, tokenAction

**SatelliteValidation** — Independent satellite cross-check
- facilityId, sentinelTileDate
- NDTI_value, NDCI_value, turbidity_NTU, chlorophyll_mgm3
- correlationScore (OCEMS vs satellite agreement)

## Policy Design

### Roles
1. **Standard Registry (CPCB)** — Publishes methodology, overall governance
2. **Facility** — Industrial plant operator, submits registration
3. **SPCB** — State Pollution Control Board inspector, approves/monitors
4. **VVB** — Verification/Validation Body auditor
5. **IoT** — Automated sensor data service (externalDataBlock)

### Workflow Stages
1. **Registration**: Facility submits FacilityRegistration VC → SPCB approves
2. **Sensor Ingestion**: IoT submits SensorReading via externalDataBlock → compliance check
3. **Compliant Path**: Aggregate → HCS log → mint GGCC token
4. **Violation Path**: Flag for SPCB → satellite cross-validation → VVB review → mint ViolationNFT
5. **Post-Issuance**: Token transfer, retirement, 90-day ComplianceCertNFT

### Key Policy Blocks
- `externalDataBlock` — Receives KMS-signed sensor data via REST API
- `customLogicBlock` — CPCB Schedule-VI compliance check (JavaScript)
- `switchBlock` — Routes compliant vs violation vs pending review
- `mintDocumentBlock` — Mints GGCC (compliant) or ViolationNFT (violation)
- `reportBlock` + `reportItemBlock` — Trust chain drill-down

## Directory Structure

```
guardian/
├── README.md                        # This file
├── GUARDIAN-BUILD-PLAN.md           # Detailed 8-phase implementation plan
├── schemas/
│   ├── FacilityRegistration.json    # 17 fields, facility identity + CTO
│   ├── SensorReading.json           # 16 fields, OCEMS MRV data
│   ├── ComplianceEvaluation.json    # 21 fields, compliance results
│   └── SatelliteValidation.json     # 7 fields, satellite cross-check
└── policies/
    └── (policy JSON exported after build)
```

## MGS Schema Format Notes

The MGS UI JSON editor uses a simplified internal format:

```json
{
  "name": "SchemaName",
  "description": "...",
  "entity": "VC",          // Must be: NONE, VC, or EVC
  "fields": [
    {
      "key": "fieldKey",   // Required — internal identifier
      "name": "fieldKey",  // Required — matches key
      "title": "Display Label",
      "description": "...",
      "type": "string",    // string, number, integer, boolean
      "required": true,
      "isArray": false
    }
  ],
  "conditions": []
}
```

Key learnings:
- `entity` must be one of `NONE`, `VC`, `EVC` — NOT "MRV" (MRV is set on the externalDataBlock)
- `enum` arrays are NOT supported in the simplified JSON editor — use Simplified tab or policy-level validation
- Each field requires both `key` and `name` properties
