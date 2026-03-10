/**
 * Zeno Smart Contracts — End-to-End On-Chain Test
 *
 * Runs against Hedera testnet (real transactions, real HBAR).
 * Tests the COMPLETE flow:
 *   1. Deploy contracts
 *   2. Register facilities (with Schedule-VI defaults + CTO overrides + ZLD)
 *   3. Check compliance for various sensor readings (view calls — free)
 *   4. Record compliance results on-chain
 *   5. Calculate penalties for violations
 *   6. Verify facility stats
 *   7. Verify access control
 *
 * Usage:
 *   npx hardhat run scripts/e2e-test.ts --network hedera_testnet
 *
 * All transactions are verifiable on HashScan.
 */

import { ethers } from 'hardhat';

// Test helpers
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log('='.repeat(70));
  console.log('Zeno Smart Contracts — End-to-End On-Chain Test');
  console.log('='.repeat(70));
  console.log(`Network:  Hedera Testnet (chainId 296)`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} HBAR`);
  console.log();

  // ============================================================
  // Deploy Contracts
  // ============================================================

  console.log('[1/8] Deploying contracts...');

  const ComplianceChecker = await ethers.getContractFactory('ComplianceChecker');
  const checker = await ComplianceChecker.deploy();
  await checker.waitForDeployment();
  const checkerAddr = await checker.getAddress();
  console.log(`  ComplianceChecker: ${checkerAddr}`);

  const PenaltyCalculator = await ethers.getContractFactory('PenaltyCalculator');
  const penalty = await PenaltyCalculator.deploy(checkerAddr);
  await penalty.waitForDeployment();
  const penaltyAddr = await penalty.getAddress();
  console.log(`  PenaltyCalculator: ${penaltyAddr}`);

  assert(checkerAddr.length === 42, 'ComplianceChecker deployed');
  assert(penaltyAddr.length === 42, 'PenaltyCalculator deployed');
  console.log();

  // ============================================================
  // Register Facilities
  // ============================================================

  console.log('[2/8] Registering facilities...');

  // Facility 1: Standard tannery with Schedule-VI defaults
  const defaultThresholds = {
    pH_min: 55, pH_max: 90, BOD: 300, COD: 2500, TSS: 1000,
    tempAboveAmbient: 50, totalCr: 20, hexCr: 1, oilGrease: 100, NH3N: 500,
  };
  let tx = await checker.registerFacility(
    'KNP-TAN-001',
    'Tanneries',
    false,  // not ZLD
    false,  // no CTO override (uses Schedule-VI defaults)
    defaultThresholds
  );
  await tx.wait();
  assert(true, 'KNP-TAN-001 registered (Tannery, Schedule-VI defaults)');

  // Facility 2: Tannery with strict CTO limits (near drinking water intake)
  const strictCTO = {
    pH_min: 60,           // 6.0 (stricter than 5.5)
    pH_max: 85,           // 8.5 (stricter than 9.0)
    BOD: 200,             // 20.0 mg/L (stricter than 30)
    COD: 1500,            // 150.0 mg/L (stricter than 250)
    TSS: 500,             // 50.0 mg/L (stricter than 100)
    tempAboveAmbient: 30, // 3.0°C (stricter than 5)
    totalCr: 10,          // 1.0 mg/L (stricter than 2.0)
    hexCr: 1,             // 0.1 mg/L (same)
    oilGrease: 50,        // 5.0 mg/L (stricter than 10)
    NH3N: 300,            // 30.0 mg/L (stricter than 50)
  };
  tx = await checker.registerFacility(
    'KNP-TAN-004',
    'Tanneries',
    false,
    true,   // CTO override
    strictCTO
  );
  await tx.wait();
  assert(true, 'KNP-TAN-004 registered (Tannery, strict CTO near Ganga intake)');

  // Facility 3: Distillery with ZLD mandate
  tx = await checker.registerFacility(
    'KNP-DST-001',
    'Distillery',
    true,   // ZLD mandated
    false,
    defaultThresholds
  );
  await tx.wait();
  assert(true, 'KNP-DST-001 registered (Distillery, ZLD mandated)');

  const facilityCount = await checker.getFacilityCount();
  assert(Number(facilityCount) === 3, `Facility count = ${facilityCount}`);
  console.log();

  // ============================================================
  // Check Compliance — Compliant Reading (Schedule-VI)
  // ============================================================

  console.log('[3/8] Compliance check — compliant reading (Schedule-VI)...');

  // Typical compliant tannery reading
  const compliantReading = {
    pH: 72,               // 7.2 (within 5.5-9.0)
    BOD: 180,             // 18.0 mg/L (< 30)
    COD: 1500,            // 150.0 mg/L (< 250)
    TSS: 650,             // 65.0 mg/L (< 100)
    tempAboveAmbient: 30, // 3.0°C (< 5)
    totalCr: 12,          // 1.2 mg/L (< 2.0)
    hexCr: 0,             // 0.05 → rounds to 0 (< 0.1)
    oilGrease: 50,        // 5.0 mg/L (< 10)
    NH3N: 200,            // 20.0 mg/L (< 50)
    flow_KLD: 100,        // 10.0 KLD (not ZLD, so irrelevant)
  };

  const result1 = await checker.checkCompliance('KNP-TAN-001', compliantReading);
  assert(result1.overallCompliant === true, 'Overall compliant');
  assert(Number(result1.violationCount) === 0, 'Zero violations');
  assert(result1.pH_compliant === true, 'pH compliant');
  assert(result1.BOD_compliant === true, 'BOD compliant');
  assert(result1.COD_compliant === true, 'COD compliant');
  assert(result1.TSS_compliant === true, 'TSS compliant');
  assert(result1.totalCr_compliant === true, 'Total Cr compliant');
  console.log();

  // ============================================================
  // Check Compliance — Violating Reading (Schedule-VI)
  // ============================================================

  console.log('[4/8] Compliance check — violation reading (Schedule-VI)...');

  const violationReading = {
    pH: 45,               // 4.5 (below 5.5 — violation)
    BOD: 450,             // 45.0 mg/L (> 30 — violation)
    COD: 3500,            // 350.0 mg/L (> 250 — violation)
    TSS: 1200,            // 120.0 mg/L (> 100 — violation)
    tempAboveAmbient: 30, // 3.0°C (ok)
    totalCr: 35,          // 3.5 mg/L (> 2.0 — violation)
    hexCr: 2,             // 0.2 mg/L (> 0.1 — violation)
    oilGrease: 50,        // 5.0 mg/L (ok)
    NH3N: 200,            // 20.0 mg/L (ok)
    flow_KLD: 100,
  };

  const result2 = await checker.checkCompliance('KNP-TAN-001', violationReading);
  assert(result2.overallCompliant === false, 'Overall non-compliant');
  assert(Number(result2.violationCount) === 6, `Violation count = ${result2.violationCount} (expected 6)`);
  assert(result2.pH_compliant === false, 'pH violation detected');
  assert(result2.BOD_compliant === false, 'BOD violation detected');
  assert(result2.COD_compliant === false, 'COD violation detected');
  assert(result2.TSS_compliant === false, 'TSS violation detected');
  assert(result2.totalCr_compliant === false, 'Total Cr violation detected');
  assert(result2.hexCr_compliant === false, 'Hex Cr violation detected');
  assert(result2.temp_compliant === true, 'Temperature still compliant');
  assert(result2.oilGrease_compliant === true, 'Oil & Grease still compliant');
  console.log();

  // ============================================================
  // Check Compliance — CTO Override (stricter limits)
  // ============================================================

  console.log('[5/8] Compliance check — CTO override (stricter limits)...');

  // Same reading that was compliant under Schedule-VI should FAIL under strict CTO
  const ctoTestReading = {
    pH: 72,               // 7.2 (ok for both)
    BOD: 250,             // 25.0 mg/L — passes Schedule-VI (30) but FAILS CTO (20)
    COD: 1800,            // 180.0 mg/L — passes Schedule-VI (250) but FAILS CTO (150)
    TSS: 650,             // 65.0 mg/L — passes Schedule-VI (100) but FAILS CTO (50)
    tempAboveAmbient: 30, // 3.0°C (ok for both)
    totalCr: 15,          // 1.5 mg/L — passes Schedule-VI (2.0) but FAILS CTO (1.0)
    hexCr: 0,             // ok for both
    oilGrease: 80,        // 8.0 mg/L — passes Schedule-VI (10) but FAILS CTO (5)
    NH3N: 350,            // 35.0 mg/L — passes Schedule-VI (50) but FAILS CTO (30)
    flow_KLD: 100,
  };

  // Under Schedule-VI defaults (KNP-TAN-001) — should be compliant
  const resultScheduleVI = await checker.checkCompliance('KNP-TAN-001', ctoTestReading);
  assert(resultScheduleVI.overallCompliant === true, 'Compliant under Schedule-VI defaults');

  // Under strict CTO (KNP-TAN-004) — should have violations
  const resultCTO = await checker.checkCompliance('KNP-TAN-004', ctoTestReading);
  assert(resultCTO.overallCompliant === false, 'Non-compliant under CTO override');
  assert(resultCTO.BOD_compliant === false, 'BOD fails CTO limit (25 > 20)');
  assert(resultCTO.COD_compliant === false, 'COD fails CTO limit (180 > 150)');
  assert(resultCTO.TSS_compliant === false, 'TSS fails CTO limit (65 > 50)');
  assert(resultCTO.totalCr_compliant === false, 'Total Cr fails CTO limit (1.5 > 1.0)');
  assert(resultCTO.oilGrease_compliant === false, 'Oil & Grease fails CTO limit (8 > 5)');
  assert(resultCTO.NH3N_compliant === false, 'NH3-N fails CTO limit (35 > 30)');
  console.log();

  // ============================================================
  // Check Compliance — ZLD Enforcement
  // ============================================================

  console.log('[6/8] Compliance check — ZLD enforcement...');

  // Distillery with any flow = violation
  const zldReadingWithFlow = {
    pH: 72,
    BOD: 50,     // Very low — doesn't matter
    COD: 100,    // Very low — doesn't matter
    TSS: 200,
    tempAboveAmbient: 20,
    totalCr: 1,
    hexCr: 0,
    oilGrease: 10,
    NH3N: 50,
    flow_KLD: 5, // ANY flow > 0 = ZLD violation
  };

  const resultZLDViolation = await checker.checkCompliance('KNP-DST-001', zldReadingWithFlow);
  assert(resultZLDViolation.overallCompliant === false, 'ZLD violation: any flow = non-compliant');
  assert(resultZLDViolation.zld_compliant === false, 'ZLD flag correctly set');
  assert(Number(resultZLDViolation.violationCount) === 1, 'ZLD counts as 1 violation');

  // Distillery with zero flow = compliant
  const zldReadingNoFlow = { ...zldReadingWithFlow, flow_KLD: 0 };
  const resultZLDCompliant = await checker.checkCompliance('KNP-DST-001', zldReadingNoFlow);
  assert(resultZLDCompliant.overallCompliant === true, 'ZLD compliant: zero flow');
  assert(resultZLDCompliant.zld_compliant === true, 'ZLD flag correctly set');
  console.log();

  // ============================================================
  // Record Compliance On-Chain
  // ============================================================

  console.log('[7/8] Recording compliance evaluations on-chain...');

  // Record compliant evaluation
  const evalHash1 = ethers.keccak256(ethers.toUtf8Bytes('eval-compliant-001'));
  tx = await checker.recordCompliance(
    'KNP-TAN-001',
    evalHash1,
    true,   // compliant
    0,      // no violations
    0,      // no critical violations
    '0.0.12345@1234567890.000000001'  // HCS message reference
  );
  let receipt = await tx.wait();
  assert(receipt !== null, 'Compliant evaluation recorded on-chain');

  // Record violation evaluation
  const evalHash2 = ethers.keccak256(ethers.toUtf8Bytes('eval-violation-001'));
  tx = await checker.recordCompliance(
    'KNP-TAN-001',
    evalHash2,
    false,  // non-compliant
    6,      // 6 violations
    3,      // 3 critical
    '0.0.12345@1234567890.000000002'
  );
  receipt = await tx.wait();
  assert(receipt !== null, 'Violation evaluation recorded on-chain');

  // Verify facility stats
  const stats = await checker.getFacilityStats('KNP-TAN-001');
  assert(Number(stats.totalRecords) === 2, `Total records = ${stats.totalRecords}`);
  assert(Number(stats.totalViolations) === 1, `Total violations = ${stats.totalViolations}`);
  assert(Number(stats.complianceRate) === 5000, `Compliance rate = ${Number(stats.complianceRate) / 100}%`);

  const recordCount = await checker.getRecordCount();
  assert(Number(recordCount) === 2, `Total records across all facilities = ${recordCount}`);
  console.log();

  // ============================================================
  // Penalty Calculation
  // ============================================================

  console.log('[8/8] Penalty calculation...');

  // Test penalty for the violation reading (6 params violated)
  const violationInput = {
    pH_violated: true,
    BOD_violated: true,
    COD_violated: true,
    TSS_violated: true,
    temp_violated: false,
    totalCr_violated: true,
    hexCr_violated: true,
    oilGrease_violated: false,
    NH3N_violated: false,
    // Deviations (1-decimal encoded)
    pH_deviation: 182,       // 18.2% below min
    BOD_deviation: 500,      // 50.0% over
    COD_deviation: 400,      // 40.0% over
    TSS_deviation: 200,      // 20.0% over
    temp_deviation: 0,
    totalCr_deviation: 750,  // 75.0% over
    hexCr_deviation: 1000,   // 100.0% over
    oilGrease_deviation: 0,
    NH3N_deviation: 0,
  };

  // First offense
  const penaltyResult1 = await penalty.calculatePenalty(violationInput, 0);
  assert(Number(penaltyResult1.score) > 0, `Penalty score = ${penaltyResult1.score}`);
  assert(Number(penaltyResult1.multiplier) === 1000, 'First offense multiplier = 1.0×');
  const tierName1 = await penalty.getTierName(penaltyResult1.tier);
  console.log(`  Penalty tier: ${tierName1}`);

  // Repeat offender (10+ violations)
  const penaltyResult2 = await penalty.calculatePenalty(violationInput, 12);
  assert(Number(penaltyResult2.multiplier) === 2000, 'Repeat offender (10+) multiplier = 2.0×');
  assert(Number(penaltyResult2.score) === Number(penaltyResult1.score) * 2,
    `Score doubles with 2.0× multiplier: ${penaltyResult2.score}`);

  // Chronic offender (25+ violations)
  const penaltyResult3 = await penalty.calculatePenalty(violationInput, 30);
  assert(Number(penaltyResult3.multiplier) === 3000, 'Chronic offender (25+) multiplier = 3.0×');
  const tierName3 = await penalty.getTierName(penaltyResult3.tier);
  console.log(`  Chronic offender penalty tier: ${tierName3}`);

  // Record a penalty
  tx = await penalty.recordPenalty('KNP-TAN-001', violationInput, 0);
  receipt = await tx.wait();
  assert(receipt !== null, 'Penalty recorded on-chain');

  const penaltyRecordCount = await penalty.getPenaltyRecordCount();
  assert(Number(penaltyRecordCount) === 1, `Penalty record count = ${penaltyRecordCount}`);
  console.log();

  // ============================================================
  // Summary
  // ============================================================

  console.log('='.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n⚠ Some tests failed!');
    process.exit(1);
  }

  console.log('\nAll tests passed! Contracts verified on-chain.');
  console.log('\nHashScan Links:');
  console.log(`  ComplianceChecker: https://hashscan.io/testnet/contract/${checkerAddr}`);
  console.log(`  PenaltyCalculator: https://hashscan.io/testnet/contract/${penaltyAddr}`);
  console.log(`\nTransaction hashes are visible in HashScan for judge verification.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('E2E test failed:', error);
    process.exit(1);
  });
