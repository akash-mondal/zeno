# @zeno/contracts — On-Chain Compliance Oracle

Smart contracts for Project Zeno deployed on Hedera testnet. Implements CPCB Schedule-VI discharge standard verification with CTO-specific overrides, ZLD enforcement, and graduated penalty calculation.

**Hybrid Architecture**: Contracts handle compliance verification (view functions — free) and on-chain audit trails. Token operations (GGCC minting, ViolationNFT minting) use SDK-based approach in `packages/blockchain/src/hts.ts` for reliability. This matches what DOVU and other Hedera sustainability winners do.

---

## Contracts

| Contract | Purpose | Key Functions |
|----------|---------|--------------|
| `ComplianceChecker.sol` | On-chain compliance oracle + facility registry | `checkCompliance()` (view/free), `recordCompliance()`, `registerFacility()` |
| `PenaltyCalculator.sol` | Graduated penalty scoring with parameter weights | `calculatePenalty()` (view/free), `recordPenalty()` |

### ComplianceChecker

- **Two-tier thresholds**: Schedule-VI defaults (hardcoded) + CTO-specific overrides per facility
- **ZLD enforcement**: Any flow > 0 = violation for ZLD-mandated facilities (distilleries)
- **9 parameters**: pH, BOD, COD, TSS, Temperature, Total Cr, Hex Cr, Oil & Grease, NH₃-N
- **Gas-optimized**: uint16 with implicit 1-decimal precision (pH 5.5 → 55, COD 250 → 2500)
- **Access control**: Owner, Registrar, Submitter roles
- **HTS precompile**: Token creation via 0x167 (shows deep Hedera integration)
- **Events**: Indexed for Mirror Node queries

### PenaltyCalculator

- **Parameter weights** (sum = 1000 basis points): HexCr 20%, TotalCr 15%, COD 15%, BOD 12%, TSS 10%, pH 10%, O&G 8%, NH₃-N 5%, Temp 5%
- **Repeat offender multipliers**: 1× first offense, 1.5× at 3+, 2× at 10+, 3× at 25+ violations
- **Penalty tiers**: NONE → WARNING → MODERATE → SEVERE → CRITICAL
- **Deviation factors**: 0-10% → 1×, 10-25% → 2×, 25-50% → 3×, 50-100% → 4×, >100% → 5×

---

## Quick Start

```bash
# Compile
npx hardhat compile

# Run local tests (41 tests, no HBAR needed)
npx hardhat test

# Deploy to Hedera testnet
npx hardhat run scripts/deploy.ts --network hedera_testnet

# Run E2E on-chain test
npx hardhat run scripts/e2e-test.ts --network hedera_testnet
```

## Architecture

```
Sensor Reading (HCS)
    │
    ▼
TypeScript Compliance Engine (packages/blockchain/src/compliance.ts)
    │  Full 9-parameter evaluation with calibration tolerances,
    │  severity classification, token action routing
    │
    ├──▶ ComplianceChecker.checkCompliance()  ← VIEW (free, on-chain verification)
    │       Anyone can verify: regulators, courts, citizens, NGOs
    │
    ├──▶ ComplianceChecker.recordCompliance()  ← STATE (on-chain audit trail)
    │       Stores evaluation hash + emits indexed events
    │
    ├──▶ PenaltyCalculator.calculatePenalty()  ← VIEW (free, penalty scoring)
    │
    └──▶ SDK: TokenMintTransaction  ← Reliable token operations
            GGCC (compliant) / ZVIOL (violation) / ZCERT (sustained)
```

## Data Encoding

All sensor values use **uint16 with implicit 1-decimal precision**:

| Real Value | Encoded | Parameter |
|-----------|---------|-----------|
| pH 7.2 | 72 | `SensorInput.pH` |
| BOD 25.0 mg/L | 250 | `SensorInput.BOD` |
| COD 180.0 mg/L | 1800 | `SensorInput.COD` |
| Cr 1.5 mg/L | 15 | `SensorInput.totalCr` |

---

## Tests

**41 local tests** covering:
- Deployment and defaults (2)
- Facility registration: standard, ZLD, CTO override, duplicates, access control, events (7)
- Compliance checking: all 9 parameters individually, multiple violations, exact thresholds, unregistered (13)
- CTO override: stricter BOD and COD limits (2)
- ZLD enforcement: flow violation, zero flow, parameter skip (3)
- Compliance recording: stats, events, access control (5)
- Access control: grant/revoke registrar and submitter (3)
- Penalty calculation: zero score, parameter weights, repeat multipliers, deviation escalation, tier classification (5)
- E2E on-chain test covers full flow on Hedera testnet

## References

- CPCB Schedule-VI: General Standards for Discharge of Environmental Pollutants
- CPCB August 2025 Online Automated Alerts Generation Protocol
- Hedera HTS Precompile: [HIP-206](https://hips.hedera.com/hip/hip-206)
- Hedera Smart Contract Service: [docs.hedera.com](https://docs.hedera.com/hedera/core-concepts/smart-contracts)
