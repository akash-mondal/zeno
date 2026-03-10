# @zeno/blockchain — Hedera Base Layer

The foundational blockchain integration layer for Project Zeno. This package is the single source of truth for all Hedera interactions — every other package and application in the monorepo depends on it.

**This layer is considered stable.** All interfaces, schemas, and on-chain architectures defined here are production-locked.

---

## Architecture

### Multi-Topic HCS Architecture

Zeno uses a purpose-built multi-topic architecture on Hedera Consensus Service that mirrors the real CPCB OCEMS data flow — from device registration through compliance evaluation to token minting.

```mermaid
graph TB
    subgraph "System Topics (created once)"
        REG["ZENO-REGISTRY<br/>Facility registrations, CTO limits,<br/>device identity bindings"]
        COMP["ZENO-COMPLIANCE<br/>Evaluation results with<br/>back-references to readings"]
        CAL["ZENO-CALIBRATION<br/>Device calibration records,<br/>agency certifications"]
        ALERT["ZENO-ALERTS<br/>Violations, anomalies,<br/>uptime breaches"]
    end

    subgraph "Per-Facility Topics (created per facility)"
        FAC1["ZENO-FAC-KNP-TAN-001<br/>Sensor readings + heartbeats<br/>Submit key = device KMS key"]
        FAC2["ZENO-FAC-KNP-TAN-002<br/>..."]
        FACN["ZENO-FAC-KNP-DST-001<br/>ZLD-mandated distillery"]
    end

    subgraph "HTS Tokens"
        GGCC["GGCC<br/>ComplianceCredit FT<br/>1 token = 1 compliant eval"]
        ZVIOL["ZVIOL<br/>ViolationNFT<br/>Immutable violation record"]
        ZCERT["ZCERT<br/>ComplianceCertNFT<br/>90-day sustained compliance"]
    end

    REG -->|"facility registered"| FAC1
    FAC1 -->|"readings submitted"| COMP
    COMP -->|"compliant"| GGCC
    COMP -->|"critical violation"| ZVIOL
    COMP -->|"critical violation"| ALERT
    CAL -->|"calibration status<br/>referenced in evaluation"| COMP
```

### Data Flow — End-to-End Pipeline

```mermaid
sequenceDiagram
    participant Device as OCEMS Device
    participant KMS as AWS KMS
    participant HCS as Hedera HCS
    participant Engine as Compliance Engine
    participant HTS as Hedera HTS
    participant Mirror as Mirror Node
    participant Dashboard as Dashboard

    Note over Device: 1-min averages computed<br/>from raw analyzer signals

    Device->>KMS: Hash reading batch (keccak256)
    KMS-->>Device: ECDSA signature (R||S)

    Device->>HCS: Submit to ZENO-FAC-{id}<br/>envelope: sensor_reading

    Note over Device: Every 15 min = 1 batch<br/>of up to 15 readings

    HCS->>Engine: Reading available via Mirror Node
    Engine->>Engine: Evaluate against Schedule-VI<br/>+ CTO overrides + ZLD check

    alt Compliant
        Engine->>HCS: Submit to ZENO-COMPLIANCE<br/>tokenAction: mint_ggcc
        Engine->>HTS: Mint 1 GGCC
    else Moderate Violation
        Engine->>HCS: Submit to ZENO-COMPLIANCE<br/>tokenAction: pending_review
        Note over Engine: Awaits satellite cross-validation<br/>+ VVB auditor review
    else Critical Violation (>50% over threshold)
        Engine->>HCS: Submit to ZENO-COMPLIANCE<br/>tokenAction: mint_violation_nft
        Engine->>HTS: Mint ViolationNFT
        Engine->>HCS: Submit to ZENO-ALERTS
    end

    Mirror->>Dashboard: All data queryable<br/>via REST API
```

### Trust Chain — Token to Raw Data

Every token minted by Zeno is fully traceable back to the raw sensor reading, device identity, and cryptographic proof. This is what gets presented to the NGT as Section 65B evidence.

```mermaid
graph BT
    TOKEN["Token<br/>(GGCC / ViolationNFT / ComplianceCertNFT)"]

    EVAL["Compliance Evaluation<br/>ZENO-COMPLIANCE topic<br/>Message sequence #N"]

    READING["Sensor Readings<br/>ZENO-FAC-{id} topic<br/>Message sequences #X, #Y, #Z"]

    REG["Facility Registration<br/>ZENO-REGISTRY topic<br/>CTO limits, device binding, GPS"]

    KMS["KMS Cryptographic Proof<br/>Batch signature hash<br/>→ CloudTrail event ID"]

    CAL["Calibration Status<br/>ZENO-CALIBRATION topic<br/>Last calibration date, deviation %"]

    SAT["Satellite Validation<br/>(when available)<br/>Sentinel-2 NDTI, turbidity, correlation"]

    TOKEN --> EVAL
    EVAL --> READING
    EVAL --> REG
    READING --> KMS
    EVAL --> CAL
    EVAL -.-> SAT
```

### Compliance Evaluation Logic

```mermaid
flowchart TD
    START["Sensor Reading Received"] --> ZLD{"ZLD Mandated?"}

    ZLD -->|Yes| FLOW{"Flow > 0?"}
    FLOW -->|Yes| CRITICAL_ZLD["CRITICAL VIOLATION<br/>Any discharge = violation"]
    FLOW -->|No| COMPLIANT_ZLD["ZLD Compliant<br/>No discharge detected"]

    ZLD -->|No| CTO{"CTO Custom<br/>Limits Set?"}
    CTO -->|Yes| EVAL_CTO["Evaluate against<br/>CTO limits"]
    CTO -->|No| EVAL_VI["Evaluate against<br/>Schedule-VI defaults"]

    EVAL_CTO --> CHECK
    EVAL_VI --> CHECK

    CHECK["Check each parameter:<br/>pH, BOD, COD, TSS, Temp,<br/>Cr, Hex-Cr, O&G, NH₃-N"]

    CHECK --> TOLERANCE{"Within calibration<br/>tolerance band?<br/>±10% COD/BOD/TSS<br/>±0.2 pH"}

    TOLERANCE -->|"Over threshold<br/>but within tolerance"| MARGINAL["MARGINAL<br/>Warning, not violation"]
    TOLERANCE -->|"Over threshold<br/>beyond tolerance"| SEVERITY{"Deviation %?"}

    SEVERITY -->|"≤ 50%"| MODERATE["MODERATE VIOLATION<br/>→ pending_review<br/>(awaits satellite + VVB)"]
    SEVERITY -->|"> 50%"| CRITICAL["CRITICAL VIOLATION<br/>→ mint_violation_nft<br/>+ SPCB alert"]

    CHECK -->|"All within limits"| PASS["COMPLIANT<br/>→ mint_ggcc"]

    CRITICAL_ZLD --> NFT["Mint ViolationNFT<br/>+ Alert to ZENO-ALERTS"]
    CRITICAL --> NFT
    PASS --> GGCC["Mint 1 GGCC"]
    MODERATE --> REVIEW["Pending Review<br/>No token until verified"]
```

---

## Module Reference

| Module | Purpose |
|--------|---------|
| `types.ts` | All TypeScript interfaces, schema version, CPCB discharge limits, calibration tolerances |
| `client.ts` | Hedera SDK client factory (`Client.forTestnet().setOperator()`) |
| `topics.ts` | Multi-topic architecture — system topics + per-facility topics with submit keys |
| `hcs.ts` | Envelope-wrapped HCS message submission and typed retrieval |
| `hts.ts` | Token creation (GGCC, ViolationNFT, ComplianceCertNFT) and minting |
| `compliance.ts` | CPCB Schedule-VI compliance engine with two-tier limits, ZLD, tolerance bands |
| `trust-chain.ts` | Evidence package builder for NGT/Section 65B compliance |
| `mirror.ts` | Mirror Node REST API typed wrappers with pagination |
| `kms-signer.ts` | AWS KMS signing pipeline (DER parsing, key conversion, custom signer) |
| `validator.ts` | Sensor reading ingestion validation (schema, ranges, chemistry constraints) |

---

## HCS Message Envelope

Every message submitted to any topic is wrapped in a typed envelope:

```json
{
  "v": "1.0.0",
  "type": "sensor_reading",
  "ts": "2026-03-10T09:05:05.372Z",
  "src": "0.0.7284970",
  "payload": { ... }
}
```

Message types: `facility_registration`, `sensor_reading`, `sensor_reading_batch`, `compliance_evaluation`, `calibration_record`, `device_heartbeat`, `violation_alert`

---

## CPCB Standards (Hardcoded)

### Schedule-VI Discharge Limits

| Parameter | Limit | Tolerance |
|-----------|-------|-----------|
| pH | 5.5 – 9.0 | ±0.2 pH units |
| BOD (3-day, 27°C) | ≤ 30 mg/L | ±10% |
| COD | ≤ 250 mg/L | ±10% |
| TSS | ≤ 100 mg/L | ±10% |
| Temperature | ≤ 5°C above ambient | — |
| Total Chromium | ≤ 2.0 mg/L | — |
| Hexavalent Chromium | ≤ 0.1 mg/L | — |
| Oil & Grease | ≤ 10 mg/L | — |
| Ammoniacal Nitrogen | ≤ 50 mg/L | — |

### Violation Severity

| Severity | Condition | Action |
|----------|-----------|--------|
| **None** | Within limits | Mint GGCC |
| **Marginal** | Over limit but within calibration tolerance | Warning only |
| **Moderate** | 1–50% over threshold | Pending review (satellite + VVB) |
| **Critical** | >50% over threshold | Immediate ViolationNFT + SPCB alert |

---

## Testnet Resources

All resources created on Hedera testnet and verified via HashScan:

| Resource | ID | HashScan |
|----------|----|----------|
| Operator Account | `0.0.7284970` | [View](https://hashscan.io/testnet/account/0.0.7284970) |
| ZENO-REGISTRY | `0.0.8144973` | [View](https://hashscan.io/testnet/topic/0.0.8144973) |
| ZENO-COMPLIANCE | `0.0.8144974` | [View](https://hashscan.io/testnet/topic/0.0.8144974) |
| ZENO-CALIBRATION | `0.0.8144975` | [View](https://hashscan.io/testnet/topic/0.0.8144975) |
| ZENO-ALERTS | `0.0.8144976` | [View](https://hashscan.io/testnet/topic/0.0.8144976) |
| Facility Topic (KNP-TAN-001) | `0.0.8144978` | [View](https://hashscan.io/testnet/topic/0.0.8144978) |
| GGCC Token | `0.0.8144733` | [View](https://hashscan.io/testnet/token/0.0.8144733) |
| ViolationNFT | `0.0.8144734` | [View](https://hashscan.io/testnet/token/0.0.8144734) |
| ComplianceCertNFT | `0.0.8144735` | [View](https://hashscan.io/testnet/token/0.0.8144735) |

---

## Running the Pipeline Test

```bash
cd zeno
npx tsx packages/blockchain/scripts/test-hedera-pipeline.ts
```

This runs the full 8-phase pipeline on real testnet:
1. Create system topics
2. Register facility on ZENO-REGISTRY
3. Device heartbeat + calibration record
4. Submit 3 sensor readings + compliance evaluation
5. Mint tokens (GGCC for compliant, ViolationNFT for critical)
6. Violation alert to ZENO-ALERTS
7. Build trust chain evidence package
8. Mirror Node verification of all data
