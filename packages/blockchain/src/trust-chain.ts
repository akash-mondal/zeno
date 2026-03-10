/**
 * Zeno Trust Chain Builder
 *
 * Builds a complete evidence package tracing any token back to:
 * 1. Facility registration (identity, CTO, device binding)
 * 2. Raw sensor readings (HCS messages with sequence numbers)
 * 3. Compliance evaluation (parameter-by-parameter results)
 * 4. KMS cryptographic proof (signature hash → CloudTrail)
 * 5. Satellite cross-validation (when available)
 * 6. Calibration status (at time of reading)
 *
 * Designed for:
 * - NGT evidence submissions (IT Act 2000, Section 65B)
 * - Dashboard "Trust Chain Explorer" drill-down
 * - Public portal transparency
 * - Dispute resolution
 */

import type {
  TrustChainEvidence,
  ComplianceEvaluation,
  FacilityRegistration,
  SensorReading,
  ZenoTopicSet,
} from './types';
import { getTypedMessages } from './hcs';

const HASHSCAN_BASE = 'https://hashscan.io/testnet';

/**
 * Build a complete trust chain evidence package for a token.
 *
 * This is what gets shown in the Trust Chain Explorer and
 * what would be submitted to NGT as Section 65B evidence.
 */
export function buildTrustChainEvidence(params: {
  tokenId: string;
  tokenSerial?: number;
  tokenType: 'GGCC' | 'ZVIOL' | 'ZCERT';
  tokenMintTxId: string;
  facilityRegistration: FacilityRegistration;
  registryMessageSequence: number;
  readings: SensorReading[];
  readingMessageSequences: number[];
  batchId: string;
  complianceEvaluation: ComplianceEvaluation;
  complianceMessageSequence: number;
  systemTopics: ZenoTopicSet;
  satelliteValidation?: TrustChainEvidence['satelliteValidation'];
  calibrationStatus?: TrustChainEvidence['calibrationStatus'];
}): TrustChainEvidence {
  const {
    tokenId, tokenSerial, tokenType, tokenMintTxId,
    facilityRegistration, registryMessageSequence,
    readings, readingMessageSequences, batchId,
    complianceEvaluation, complianceMessageSequence,
    systemTopics, satelliteValidation, calibrationStatus,
  } = params;

  const timestamps = readings.map(r => r.timestamp).sort();

  return {
    tokenId,
    tokenSerial,
    tokenType,
    tokenMintTxId,

    facilityId: facilityRegistration.facilityId,
    facilityRegistration: {
      registryTopicId: systemTopics.registryTopicId,
      registryMessageSequence,
    },

    sensorData: {
      facilityTopicId: facilityRegistration.facilityTopicId,
      readingMessageSequences,
      batchId,
      readingTimestampRange: {
        from: timestamps[0],
        to: timestamps[timestamps.length - 1],
      },
      readingCount: readings.length,
    },

    complianceEvaluation: {
      complianceTopicId: systemTopics.complianceTopicId,
      evaluationMessageSequence: complianceMessageSequence,
      evaluationId: complianceEvaluation.evaluationId,
      overallCompliant: complianceEvaluation.overallCompliant,
      violationCount: complianceEvaluation.violationCount,
    },

    kmsProof: {
      kmsKeyId: readings[0]?.kmsKeyId || 'not-configured',
      deviceHederaAccountId: facilityRegistration.deviceHederaAccountId,
      batchSignatureHash: readings[0]?.kmsSigHash || 'not-configured',
      cloudTrailReference: readings[0]?.kmsSigHash && readings[0].kmsSigHash !== 'not-configured'
        ? `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=Sign --max-results 5`
        : undefined,
    },

    satelliteValidation,
    calibrationStatus,

    generatedAt: new Date().toISOString(),
    hashScanLinks: {
      token: `${HASHSCAN_BASE}/token/${tokenId}`,
      facilityTopic: `${HASHSCAN_BASE}/topic/${facilityRegistration.facilityTopicId}`,
      complianceTopic: `${HASHSCAN_BASE}/topic/${systemTopics.complianceTopicId}`,
      mintTransaction: `${HASHSCAN_BASE}/transaction/${tokenMintTxId}`,
      account: `${HASHSCAN_BASE}/account/${facilityRegistration.deviceHederaAccountId}`,
    },
  };
}

/**
 * Print a human-readable trust chain for console/demo output.
 */
export function printTrustChain(evidence: TrustChainEvidence): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║              ZENO TRUST CHAIN EVIDENCE PACKAGE              ║',
    '║         IT Act 2000, Section 65B Compliant Record           ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `  Token: ${evidence.tokenType} (${evidence.tokenId}${evidence.tokenSerial ? ` #${evidence.tokenSerial}` : ''})`,
    `  Mint TX: ${evidence.tokenMintTxId}`,
    '',
    '  ┌─ LAYER 1: Facility Identity',
    `  │  Facility: ${evidence.facilityId}`,
    `  │  Registry Topic: ${evidence.facilityRegistration.registryTopicId}`,
    `  │  Registration Msg #${evidence.facilityRegistration.registryMessageSequence}`,
    '  │',
    '  ├─ LAYER 2: Raw Sensor Data',
    `  │  Facility Topic: ${evidence.sensorData.facilityTopicId}`,
    `  │  Reading Messages: #${evidence.sensorData.readingMessageSequences.join(', #')}`,
    `  │  Batch ID: ${evidence.sensorData.batchId}`,
    `  │  Time Range: ${evidence.sensorData.readingTimestampRange.from}`,
    `  │           to ${evidence.sensorData.readingTimestampRange.to}`,
    `  │  Reading Count: ${evidence.sensorData.readingCount}`,
    '  │',
    '  ├─ LAYER 3: Compliance Evaluation',
    `  │  Compliance Topic: ${evidence.complianceEvaluation.complianceTopicId}`,
    `  │  Evaluation Msg #${evidence.complianceEvaluation.evaluationMessageSequence}`,
    `  │  Evaluation ID: ${evidence.complianceEvaluation.evaluationId}`,
    `  │  Overall Compliant: ${evidence.complianceEvaluation.overallCompliant ? 'YES' : 'NO'}`,
    `  │  Violations: ${evidence.complianceEvaluation.violationCount}`,
    '  │',
    '  ├─ LAYER 4: Cryptographic Proof',
    `  │  KMS Key ID: ${evidence.kmsProof.kmsKeyId}`,
    `  │  Device Account: ${evidence.kmsProof.deviceHederaAccountId}`,
    `  │  Batch Signature: ${evidence.kmsProof.batchSignatureHash}`,
    evidence.kmsProof.cloudTrailReference
      ? `  │  CloudTrail: ${evidence.kmsProof.cloudTrailReference}`
      : '  │  CloudTrail: (pending AWS KMS setup)',
  ];

  if (evidence.satelliteValidation) {
    lines.push(
      '  │',
      '  ├─ LAYER 5: Satellite Cross-Validation',
      `  │  Sentinel-2 Tile: ${evidence.satelliteValidation.sentinelTileId}`,
      `  │  Tile Date: ${evidence.satelliteValidation.tileDate}`,
      `  │  NDTI: ${evidence.satelliteValidation.ndtiValue}`,
      `  │  Turbidity: ${evidence.satelliteValidation.turbidityNTU} NTU`,
      `  │  Correlation Score: ${evidence.satelliteValidation.correlationScore}`,
    );
  }

  if (evidence.calibrationStatus) {
    lines.push(
      '  │',
      '  ├─ LAYER 6: Calibration Status',
      `  │  Last Calibration: ${evidence.calibrationStatus.lastCalibrationDate}`,
      `  │  Deviation: ${evidence.calibrationStatus.deviationPercent}%`,
      `  │  Passed: ${evidence.calibrationStatus.calibrationPassed ? 'YES' : 'NO'}`,
    );
  }

  lines.push(
    '  │',
    '  └─ HashScan Verification Links',
    `     Token:      ${evidence.hashScanLinks.token}`,
    `     Fac. Topic: ${evidence.hashScanLinks.facilityTopic}`,
    `     Compliance: ${evidence.hashScanLinks.complianceTopic}`,
    `     Mint TX:    ${evidence.hashScanLinks.mintTransaction}`,
    `     Account:    ${evidence.hashScanLinks.account}`,
    '',
    `  Generated: ${evidence.generatedAt}`,
    '  ─────────────────────────────────────────────────────────────',
  );

  return lines.join('\n');
}
