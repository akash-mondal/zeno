/**
 * Zeno — Full End-to-End Hedera Pipeline Test
 *
 * Simulates the complete production flow on real testnet:
 *
 * 1. Create system topics (registry, compliance, calibration, alerts)
 * 2. Register a facility on ZENO-REGISTRY
 * 3. Create per-facility topic (ZENO-FAC-KNP-TAN-001)
 * 4. Submit device heartbeat (uptime tracking)
 * 5. Submit calibration record
 * 6. Submit 3 sensor readings (1 compliant, 1 BOD violation, 1 chromium critical)
 * 7. Run compliance engine on each reading
 * 8. Submit compliance evaluations to ZENO-COMPLIANCE
 * 9. Mint tokens based on compliance results (GGCC or ViolationNFT)
 * 10. Submit violation alert to ZENO-ALERTS
 * 11. Build trust chain evidence package
 * 12. Query everything back from Mirror Node
 * 13. Print full trust chain as it would appear in NGT submission
 *
 * Run: cd "Dev Projects/Zeno" && npx tsx packages/blockchain/scripts/test-hedera-pipeline.ts
 */

import 'dotenv/config';

// Topic management
import { createSystemTopics, createFacilityTopic } from '../src/topics';

// HCS messaging
import {
  submitFacilityRegistration,
  submitSensorReading,
  submitComplianceEvaluation,
  submitCalibrationRecord,
  submitDeviceHeartbeat,
  submitViolationAlert,
  getTypedMessages,
} from '../src/hcs';

// Compliance engine
import { evaluateSingleReading } from '../src/compliance';

// HTS tokens
import {
  createComplianceCreditToken,
  createViolationNFTCollection,
  createComplianceCertNFTCollection,
  mintComplianceCredit,
  mintViolationNFT,
} from '../src/hts';

// Mirror Node
import {
  getAccountBalance,
  getAccountTokens,
  getNFTInfo,
} from '../src/mirror';

// Trust chain
import { buildTrustChainEvidence, printTrustChain } from '../src/trust-chain';

// Types
import type {
  ZenoTopicSet,
  FacilityRegistration,
  SensorReading,
  CalibrationRecord,
  DeviceHeartbeat,
  ViolationAlert,
  ComplianceEvaluation,
  FacilityTopicBinding,
} from '../src/types';

const ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID!;
const HASHSCAN = 'https://hashscan.io/testnet';

function log(phase: string, msg: string) {
  console.log(`\n[${phase}] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// PHASE 1: System Topic Infrastructure
// ============================================================

async function phase1_createSystemTopics(): Promise<ZenoTopicSet> {
  log('PHASE 1', '═══ Creating System Topics ═══');

  // Reuse if already in env
  if (process.env.ZENO_REGISTRY_TOPIC_ID) {
    const topics: ZenoTopicSet = {
      registryTopicId: process.env.ZENO_REGISTRY_TOPIC_ID,
      complianceTopicId: process.env.ZENO_COMPLIANCE_TOPIC_ID!,
      calibrationTopicId: process.env.ZENO_CALIBRATION_TOPIC_ID!,
      alertsTopicId: process.env.ZENO_ALERTS_TOPIC_ID!,
    };
    log('PHASE 1', 'Reusing existing system topics');
    log('PHASE 1', `  Registry:    ${topics.registryTopicId}`);
    log('PHASE 1', `  Compliance:  ${topics.complianceTopicId}`);
    log('PHASE 1', `  Calibration: ${topics.calibrationTopicId}`);
    log('PHASE 1', `  Alerts:      ${topics.alertsTopicId}`);
    return topics;
  }

  log('PHASE 1', 'Creating 4 system-level topics...');
  const topics = await createSystemTopics();

  log('PHASE 1', `  ZENO-REGISTRY:    ${topics.registryTopicId}`);
  log('PHASE 1', `  ZENO-COMPLIANCE:  ${topics.complianceTopicId}`);
  log('PHASE 1', `  ZENO-CALIBRATION: ${topics.calibrationTopicId}`);
  log('PHASE 1', `  ZENO-ALERTS:      ${topics.alertsTopicId}`);

  return topics;
}

// ============================================================
// PHASE 2: Facility Registration
// ============================================================

async function phase2_registerFacility(
  topics: ZenoTopicSet
): Promise<{ registration: FacilityRegistration; regSeq: number; facilityBinding: FacilityTopicBinding }> {
  log('PHASE 2', '═══ Facility Registration ═══');

  // Create per-facility topic
  log('PHASE 2', 'Creating facility topic for KNP-TAN-001...');
  const facilityBinding = await createFacilityTopic('KNP-TAN-001');
  log('PHASE 2', `  Topic: ${facilityBinding.topicId}`);
  log('PHASE 2', `  ${HASHSCAN}/topic/${facilityBinding.topicId}`);

  await sleep(5000);

  // Register facility on ZENO-REGISTRY
  const registration: FacilityRegistration = {
    facilityId: 'KNP-TAN-001',
    facilityName: 'Superhouse Leather (Jajmau Unit)',
    industryCategory: 'Tanneries',
    state: 'Uttar Pradesh',
    district: 'Kanpur Nagar',
    gpsLatitude: 26.4196,
    gpsLongitude: 80.3571,
    ctoNumber: 'UPPCB/CTO/2024/KNP/1847',
    ctoValidUntil: '2027-03-31',
    ctoDischargeMode: 'discharge',
    ctoCustomLimits: null, // uses Schedule-VI defaults
    ocemsSensorModel: 'Horiba OPSA-150',
    analyzerSerialNumber: 'OPSA-150-2024-KNP-0847',
    csirNplCertificationId: 'NPL/OCEMS/CERT/2024/0392',
    dischargePipeGPS: { lat: 26.4192, lon: 80.3568 },
    deviceKmsKeyId: 'pending-kms-setup',
    deviceHederaAccountId: ACCOUNT_ID,
    facilityTopicId: facilityBinding.topicId,
    registeredAt: new Date().toISOString(),
  };

  log('PHASE 2', 'Submitting facility registration to ZENO-REGISTRY...');
  const regResult = await submitFacilityRegistration(topics.registryTopicId, registration);
  log('PHASE 2', `  TX: ${regResult.txId} | Seq: ${regResult.sequenceNumber}`);

  return { registration, regSeq: regResult.sequenceNumber, facilityBinding };
}

// ============================================================
// PHASE 3: Device Heartbeat + Calibration
// ============================================================

async function phase3_deviceHealth(
  facilityTopicId: string,
  topics: ZenoTopicSet
): Promise<{ heartbeatSeq: number; calibrationSeq: number }> {
  log('PHASE 3', '═══ Device Health & Calibration ═══');

  // Submit heartbeat
  const heartbeat: DeviceHeartbeat = {
    facilityId: 'KNP-TAN-001',
    deviceSerialNumber: 'OPSA-150-2024-KNP-0847',
    status: 'online',
    uptimePercent30Day: 94.2,
    uptimePercentCurrentMonth: 96.8,
    totalOnlineMinutes30Day: 40694,
    totalMinutes30Day: 43200,
    lastReadingTimestamp: new Date().toISOString(),
    queuedReadings: 0,
    signalStrength_dBm: -62,
    memoryUsagePercent: 34,
    firmwareVersion: '3.2.1',
    timestamp: new Date().toISOString(),
  };

  log('PHASE 3', 'Submitting device heartbeat...');
  const hbResult = await submitDeviceHeartbeat(facilityTopicId, heartbeat);
  log('PHASE 3', `  Uptime 30d: ${heartbeat.uptimePercent30Day}% (CPCB min: 85%)`);
  log('PHASE 3', `  TX: ${hbResult.txId} | Seq: ${hbResult.sequenceNumber}`);

  await sleep(3000);

  // Submit calibration record
  const calibration: CalibrationRecord = {
    facilityId: 'KNP-TAN-001',
    deviceSerialNumber: 'OPSA-150-2024-KNP-0847',
    parameter: 'COD_mgL',
    calibrationType: 'quarterly',
    calibrationAgency: 'NABL Accredited Environmental Lab, Kanpur',
    agencyAccreditationId: 'NABL/TC-1847/2024',
    referenceValue: 250,
    measuredValue: 247,
    deviationPercent: 1.2,
    passed: true,
    compositeSampleDuration_hours: 6,
    sampleIntervalMinutes: 30,
    calibratedAt: '2026-02-15T10:00:00.000Z',
    nextCalibrationDue: '2026-05-15T10:00:00.000Z',
  };

  log('PHASE 3', 'Submitting COD calibration record to ZENO-CALIBRATION...');
  const calResult = await submitCalibrationRecord(topics.calibrationTopicId, calibration);
  log('PHASE 3', `  Deviation: ${calibration.deviationPercent}% (tolerance: ±10%)`);
  log('PHASE 3', `  Passed: ${calibration.passed}`);
  log('PHASE 3', `  TX: ${calResult.txId} | Seq: ${calResult.sequenceNumber}`);

  return { heartbeatSeq: hbResult.sequenceNumber, calibrationSeq: calResult.sequenceNumber };
}

// ============================================================
// PHASE 4: Sensor Readings + Compliance Evaluation
// ============================================================

function makeReading(overrides: Partial<SensorReading>): SensorReading {
  return {
    timestamp: new Date().toISOString(),
    facilityId: 'KNP-TAN-001',
    facilityDID: 'did:hedera:testnet:KNP-TAN-001',
    pH: 7.2,
    BOD_mgL: 18,
    COD_mgL: 120,
    TSS_mgL: 45,
    temperature_C: 30,
    totalChromium_mgL: 0.8,
    hexChromium_mgL: 0.04,
    oilAndGrease_mgL: 5,
    ammoniacalN_mgL: 20,
    dissolvedOxygen_mgL: 6.5,
    flow_KLD: 150,
    sensorStatus: 'online',
    kmsKeyId: 'pending-kms-setup',
    kmsSigHash: 'pending-kms-setup',
    ...overrides,
  };
}

async function phase4_readingsAndCompliance(
  facilityTopicId: string,
  topics: ZenoTopicSet
): Promise<{
  readings: SensorReading[];
  readingSeqs: number[];
  evaluations: ComplianceEvaluation[];
  evalSeqs: number[];
}> {
  log('PHASE 4', '═══ Sensor Readings + Compliance Evaluation ═══');

  const readings: SensorReading[] = [
    // Reading 1: COMPLIANT — all within Schedule-VI limits
    makeReading({
      pH: 7.2, BOD_mgL: 18, COD_mgL: 120, TSS_mgL: 45,
      totalChromium_mgL: 0.8, hexChromium_mgL: 0.04,
    }),
    // Reading 2: MODERATE VIOLATION — BOD exceeds 30, COD exceeds 250
    makeReading({
      pH: 6.8, BOD_mgL: 42, COD_mgL: 310, TSS_mgL: 55,
      totalChromium_mgL: 1.2, hexChromium_mgL: 0.06,
    }),
    // Reading 3: CRITICAL VIOLATION — Chromium way over (Jajmau reality)
    makeReading({
      pH: 5.2, BOD_mgL: 25, COD_mgL: 180, TSS_mgL: 85,
      totalChromium_mgL: 3.5, hexChromium_mgL: 0.15,
    }),
  ];

  const readingSeqs: number[] = [];

  for (let i = 0; i < readings.length; i++) {
    log('PHASE 4', `Submitting reading ${i + 1}/3 to facility topic...`);
    const result = await submitSensorReading(facilityTopicId, readings[i]);
    readingSeqs.push(result.sequenceNumber);
    log('PHASE 4', `  pH: ${readings[i].pH} | BOD: ${readings[i].BOD_mgL} | COD: ${readings[i].COD_mgL} | Cr: ${readings[i].totalChromium_mgL}`);
    log('PHASE 4', `  TX: ${result.txId} | Seq: ${result.sequenceNumber}`);
    if (i < readings.length - 1) await sleep(3000);
  }

  await sleep(3000);

  // Run compliance engine on each reading
  const evaluations: ComplianceEvaluation[] = [];
  const evalSeqs: number[] = [];

  for (let i = 0; i < readings.length; i++) {
    log('PHASE 4', `\nEvaluating reading ${i + 1} against CPCB Schedule-VI...`);
    const evaluation = evaluateSingleReading(
      readings[i],
      facilityTopicId,
      readingSeqs[i],
      { isZLD: false }
    );
    evaluations.push(evaluation);

    // Log results
    const violations = evaluation.parameterResults.filter(r => !r.compliant);
    if (evaluation.overallCompliant) {
      log('PHASE 4', `  ✓ COMPLIANT — all ${evaluation.parameterResults.length} parameters within limits`);
    } else {
      log('PHASE 4', `  ✗ NON-COMPLIANT — ${violations.length} violation(s):`);
      for (const v of violations) {
        log('PHASE 4', `    ${v.parameter}: ${v.value} ${v.unit} (limit: ${v.threshold}, deviation: ${v.deviationPercent}%, severity: ${v.severity})`);
      }
    }
    log('PHASE 4', `  Token action: ${evaluation.tokenAction}`);

    // Submit evaluation to ZENO-COMPLIANCE topic
    log('PHASE 4', `  Submitting evaluation to ZENO-COMPLIANCE...`);
    const evalResult = await submitComplianceEvaluation(topics.complianceTopicId, evaluation);
    evalSeqs.push(evalResult.sequenceNumber);
    log('PHASE 4', `  TX: ${evalResult.txId} | Seq: ${evalResult.sequenceNumber}`);

    if (i < readings.length - 1) await sleep(3000);
  }

  return { readings, readingSeqs, evaluations, evalSeqs };
}

// ============================================================
// PHASE 5: Token Minting Based on Compliance
// ============================================================

async function phase5_mintTokens(
  evaluations: ComplianceEvaluation[]
): Promise<{
  ggccTokenId: string;
  violationTokenId: string;
  certTokenId: string;
  mintedGGCC: boolean;
  mintedViolation: { serial: number; txId: string } | null;
}> {
  log('PHASE 5', '═══ Token Minting ═══');

  // Reuse existing tokens or create new
  let ggccTokenId = process.env.GGCC_TOKEN_ID || '';
  let violationTokenId = process.env.VIOLATION_NFT_TOKEN_ID || '';
  let certTokenId = process.env.COMPLIANCE_CERT_NFT_TOKEN_ID || '';

  if (!ggccTokenId) {
    log('PHASE 5', 'Creating GGCC token...');
    ggccTokenId = await createComplianceCreditToken();
    await sleep(3000);
  }
  if (!violationTokenId) {
    log('PHASE 5', 'Creating ViolationNFT collection...');
    violationTokenId = await createViolationNFTCollection();
    await sleep(3000);
  }
  if (!certTokenId) {
    log('PHASE 5', 'Creating ComplianceCertNFT collection...');
    certTokenId = await createComplianceCertNFTCollection();
    await sleep(3000);
  }

  log('PHASE 5', `  GGCC:  ${ggccTokenId}`);
  log('PHASE 5', `  ZVIOL: ${violationTokenId}`);
  log('PHASE 5', `  ZCERT: ${certTokenId}`);

  let mintedGGCC = false;
  let mintedViolation: { serial: number; txId: string } | null = null;

  // Mint based on evaluation results
  for (const evaluation of evaluations) {
    if (evaluation.tokenAction === 'mint_ggcc') {
      log('PHASE 5', '\nMinting 1 GGCC for compliant reading...');
      const txId = await mintComplianceCredit(ggccTokenId, 1);
      evaluation.tokenId = ggccTokenId;
      evaluation.tokenTxId = txId;
      mintedGGCC = true;
      log('PHASE 5', `  TX: ${txId}`);
      await sleep(3000);
    }

    if (evaluation.tokenAction === 'mint_violation_nft') {
      const criticalParams = evaluation.parameterResults.filter(r => r.severity === 'critical');
      log('PHASE 5', `\nMinting ViolationNFT for critical violation (${criticalParams.map(p => p.parameter).join(', ')})...`);
      const result = await mintViolationNFT(violationTokenId, {
        facilityId: evaluation.facilityId,
        parameter: criticalParams[0]?.parameter || 'multiple',
        readingValue: criticalParams[0]?.value,
        threshold: criticalParams[0]?.threshold,
        timestamp: evaluation.evaluatedAt,
      });
      evaluation.tokenId = violationTokenId;
      evaluation.tokenTxId = result.txId;
      evaluation.tokenSerial = result.serial;
      mintedViolation = result;
      log('PHASE 5', `  Serial: #${result.serial} | TX: ${result.txId}`);
      await sleep(3000);
    }

    if (evaluation.tokenAction === 'pending_review') {
      log('PHASE 5', '\nModerate violation — pending VVB review + satellite cross-validation');
      log('PHASE 5', '  (No token minted until verification completes)');
    }
  }

  return { ggccTokenId, violationTokenId, certTokenId, mintedGGCC, mintedViolation };
}

// ============================================================
// PHASE 6: Violation Alert
// ============================================================

async function phase6_alert(
  topics: ZenoTopicSet,
  facilityTopicId: string,
  evaluation: ComplianceEvaluation,
  readingSeq: number
): Promise<number> {
  log('PHASE 6', '═══ Violation Alert ═══');

  const criticals = evaluation.parameterResults.filter(r => r.severity === 'critical');

  const alert: ViolationAlert = {
    alertId: `ALERT-${Date.now()}`,
    facilityId: evaluation.facilityId,
    severity: 'critical',
    category: 'parameter_exceedance',
    description: `Critical discharge violation: ${criticals.map(c => `${c.parameter} at ${c.value} ${c.unit} (limit: ${c.threshold})`).join('; ')}`,
    parameterName: criticals[0]?.parameter,
    readingValue: criticals[0]?.value,
    threshold: criticals[0]?.threshold,
    facilityTopicId,
    readingMessageSequence: readingSeq,
    complianceEvaluationId: evaluation.evaluationId,
    spcbNotified: true,
    violationNftMinted: evaluation.tokenAction === 'mint_violation_nft',
    violationNftTokenId: evaluation.tokenId,
    violationNftSerial: evaluation.tokenSerial,
    timestamp: new Date().toISOString(),
  };

  log('PHASE 6', 'Submitting violation alert to ZENO-ALERTS...');
  log('PHASE 6', `  Severity: ${alert.severity}`);
  log('PHASE 6', `  ${alert.description}`);
  const result = await submitViolationAlert(topics.alertsTopicId, alert);
  log('PHASE 6', `  TX: ${result.txId} | Seq: ${result.sequenceNumber}`);

  return result.sequenceNumber;
}

// ============================================================
// PHASE 7: Trust Chain Evidence
// ============================================================

async function phase7_trustChain(
  registration: FacilityRegistration,
  regSeq: number,
  readings: SensorReading[],
  readingSeqs: number[],
  evaluation: ComplianceEvaluation,
  evalSeq: number,
  topics: ZenoTopicSet,
  calibrationSeq: number
): Promise<void> {
  log('PHASE 7', '═══ Trust Chain Evidence Package ═══');

  const evidence = buildTrustChainEvidence({
    tokenId: evaluation.tokenId || 'pending',
    tokenSerial: evaluation.tokenSerial,
    tokenType: evaluation.tokenAction === 'mint_ggcc' ? 'GGCC' : 'ZVIOL',
    tokenMintTxId: evaluation.tokenTxId || 'pending',
    facilityRegistration: registration,
    registryMessageSequence: regSeq,
    readings,
    readingMessageSequences: readingSeqs,
    batchId: evaluation.readingBatchId,
    complianceEvaluation: evaluation,
    complianceMessageSequence: evalSeq,
    systemTopics: topics,
    calibrationStatus: {
      calibrationTopicMessageSequence: calibrationSeq,
      lastCalibrationDate: '2026-02-15T10:00:00.000Z',
      deviationPercent: 1.2,
      calibrationPassed: true,
    },
  });

  console.log('\n' + printTrustChain(evidence));
}

// ============================================================
// PHASE 8: Mirror Node Verification
// ============================================================

async function phase8_mirrorVerification(
  topics: ZenoTopicSet,
  facilityTopicId: string,
  ggccTokenId: string,
  violationTokenId: string,
  mintedViolation: { serial: number; txId: string } | null
): Promise<void> {
  log('PHASE 8', '═══ Mirror Node Verification ═══');

  log('PHASE 8', 'Waiting 12s for Mirror Node indexing...');
  await sleep(12000);

  // Account balance
  const balance = await getAccountBalance(ACCOUNT_ID);
  log('PHASE 8', `Account HBAR: ${balance.hbar}`);

  // Token balances
  const tokens = await getAccountTokens(ACCOUNT_ID);
  log('PHASE 8', `Token associations: ${tokens.length}`);
  for (const t of tokens) {
    log('PHASE 8', `  ${t.token_id}: balance=${t.balance}`);
  }

  // Read back from ZENO-REGISTRY
  const regMessages = await getTypedMessages(topics.registryTopicId, 'facility_registration');
  log('PHASE 8', `ZENO-REGISTRY messages: ${regMessages.length}`);

  // Read back from facility topic
  const facMessages = await getTypedMessages(facilityTopicId);
  log('PHASE 8', `Facility topic messages: ${facMessages.length} (heartbeat + readings)`);
  for (const m of facMessages) {
    log('PHASE 8', `  Seq ${m.sequence}: type=${m.envelope.type} at ${m.envelope.ts}`);
  }

  // Read back from ZENO-COMPLIANCE
  const compMessages = await getTypedMessages(topics.complianceTopicId, 'compliance_evaluation');
  log('PHASE 8', `ZENO-COMPLIANCE messages: ${compMessages.length}`);

  // Read back from ZENO-CALIBRATION
  const calMessages = await getTypedMessages(topics.calibrationTopicId, 'calibration_record');
  log('PHASE 8', `ZENO-CALIBRATION messages: ${calMessages.length}`);

  // Read back from ZENO-ALERTS
  const alertMessages = await getTypedMessages(topics.alertsTopicId, 'violation_alert');
  log('PHASE 8', `ZENO-ALERTS messages: ${alertMessages.length}`);

  // NFT info
  if (mintedViolation) {
    try {
      const nft = await getNFTInfo(violationTokenId, mintedViolation.serial);
      log('PHASE 8', `ViolationNFT #${mintedViolation.serial} owner: ${nft.account_id}`);
      if (nft.metadata) {
        const decoded = Buffer.from(nft.metadata, 'base64').toString('utf-8');
        log('PHASE 8', `  Metadata: ${decoded}`);
      }
    } catch (e) {
      log('PHASE 8', `NFT query: ${e}`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═'.repeat(64));
  console.log('  ZENO — Full End-to-End Hedera Pipeline Test');
  console.log('  Simulating real CPCB OCEMS compliance flow');
  console.log(`  Account: ${ACCOUNT_ID} | Network: testnet`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(64));

  // Phase 1: System topics
  const topics = await phase1_createSystemTopics();

  await sleep(5000);

  // Phase 2: Facility registration
  const { registration, regSeq, facilityBinding } = await phase2_registerFacility(topics);
  const facilityTopicId = facilityBinding.topicId;

  await sleep(5000);

  // Phase 3: Device health
  const { calibrationSeq } = await phase3_deviceHealth(facilityTopicId, topics);

  await sleep(3000);

  // Phase 4: Sensor readings + compliance
  const { readings, readingSeqs, evaluations, evalSeqs } = await phase4_readingsAndCompliance(facilityTopicId, topics);

  await sleep(3000);

  // Phase 5: Token minting
  const { ggccTokenId, violationTokenId, certTokenId, mintedViolation } = await phase5_mintTokens(evaluations);

  await sleep(3000);

  // Phase 6: Alert for critical violation
  const criticalEval = evaluations.find(e => e.criticalViolationCount > 0);
  if (criticalEval) {
    const criticalReadingSeq = readingSeqs[evaluations.indexOf(criticalEval)];
    await phase6_alert(topics, facilityTopicId, criticalEval, criticalReadingSeq);
  }

  await sleep(3000);

  // Phase 7: Trust chain for the critical violation
  if (criticalEval) {
    const criticalIdx = evaluations.indexOf(criticalEval);
    await phase7_trustChain(
      registration, regSeq,
      [readings[criticalIdx]], [readingSeqs[criticalIdx]],
      criticalEval, evalSeqs[criticalIdx],
      topics, calibrationSeq
    );
  }

  // Phase 8: Mirror Node verification
  await phase8_mirrorVerification(topics, facilityTopicId, ggccTokenId, violationTokenId, mintedViolation);

  // Final summary
  console.log('\n' + '═'.repeat(64));
  console.log('  PIPELINE TEST COMPLETE — ALL PHASES PASSED');
  console.log('═'.repeat(64));
  console.log(`
  System Topics:
    ZENO-REGISTRY:    ${topics.registryTopicId}
    ZENO-COMPLIANCE:  ${topics.complianceTopicId}
    ZENO-CALIBRATION: ${topics.calibrationTopicId}
    ZENO-ALERTS:      ${topics.alertsTopicId}

  Facility:
    Topic: ${facilityTopicId}
    Registration Seq: #${regSeq}

  Tokens:
    GGCC:  ${ggccTokenId}
    ZVIOL: ${violationTokenId}
    ZCERT: ${certTokenId}

  Add to .env:
    ZENO_REGISTRY_TOPIC_ID=${topics.registryTopicId}
    ZENO_COMPLIANCE_TOPIC_ID=${topics.complianceTopicId}
    ZENO_CALIBRATION_TOPIC_ID=${topics.calibrationTopicId}
    ZENO_ALERTS_TOPIC_ID=${topics.alertsTopicId}
    HCS_FACILITY_TOPIC_IDS=${facilityTopicId}
    GGCC_TOKEN_ID=${ggccTokenId}
    VIOLATION_NFT_TOKEN_ID=${violationTokenId}
    COMPLIANCE_CERT_NFT_TOKEN_ID=${certTokenId}

  HashScan:
    ${HASHSCAN}/account/${ACCOUNT_ID}
`);
}

main().catch(err => {
  console.error('\nPIPELINE FAILED:', err);
  process.exit(1);
});
