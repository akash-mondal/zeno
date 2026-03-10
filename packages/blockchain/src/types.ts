/**
 * Zeno Blockchain Types — Production-Grade Schema
 *
 * Matches real CPCB OCEMS architecture:
 * - 1-minute averages, 15-minute transmission windows
 * - CSIR-NPL certified analyzer metadata
 * - Calibration tolerance bands (±10% COD/BOD/TSS, ±0.2 pH)
 * - 85% monthly uptime enforcement
 * - Multi-topic HCS architecture with submit key access control
 * - Trust chain linking from raw reading → compliance evaluation → token
 */

// ============================================================
// Schema Versioning
// ============================================================

export const SCHEMA_VERSION = '1.0.0';

export type HCSMessageType =
  | 'facility_registration'
  | 'sensor_reading'
  | 'sensor_reading_batch'
  | 'compliance_evaluation'
  | 'calibration_record'
  | 'device_heartbeat'
  | 'violation_alert'
  | 'uptime_report';

/**
 * Every HCS message is wrapped in this envelope.
 * Enables schema evolution and message routing.
 */
export interface HCSMessageEnvelope<T = unknown> {
  v: string;           // schema version
  type: HCSMessageType;
  ts: string;          // ISO 8601 timestamp
  src: string;         // source device/operator account ID
  payload: T;
}

// ============================================================
// Topic Architecture
// ============================================================

/**
 * System-level topics created once during initialization.
 * Per-facility topics are created dynamically.
 */
export interface ZenoTopicSet {
  registryTopicId: string;     // ZENO-REGISTRY: facility registrations
  complianceTopicId: string;   // ZENO-COMPLIANCE: evaluation results
  calibrationTopicId: string;  // ZENO-CALIBRATION: calibration records
  alertsTopicId: string;       // ZENO-ALERTS: violations, anomalies, uptime breaches
}

export interface FacilityTopicBinding {
  facilityId: string;
  topicId: string;
  submitKeyAccountId: string;  // device Hedera account (KMS-backed)
  createdAt: string;
}

// ============================================================
// Facility Registration (→ ZENO-REGISTRY topic)
// ============================================================

export interface FacilityRegistration {
  facilityId: string;
  facilityName: string;
  industryCategory: string;   // one of 17 CPCB categories
  state: string;
  district: string;
  gpsLatitude: number;
  gpsLongitude: number;

  // Consent to Operate
  ctoNumber: string;
  ctoValidUntil: string;
  ctoDischargeMode: 'discharge' | 'ZLD';
  ctoCustomLimits: CTOCustomLimits | null;

  // OCEMS Device Identity
  ocemsSensorModel: string;       // e.g., "Horiba OPSA-150"
  analyzerSerialNumber: string;
  csirNplCertificationId: string; // CSIR-NPL model certification
  dischargePipeGPS: { lat: number; lon: number };

  // Hedera/KMS Identity
  deviceKmsKeyId: string;
  deviceHederaAccountId: string;
  facilityTopicId: string;

  registeredAt: string;
}

export interface CTOCustomLimits {
  pH_min?: number;
  pH_max?: number;
  BOD_mgL?: number;
  COD_mgL?: number;
  TSS_mgL?: number;
  temperature_C_above_ambient?: number;
  totalChromium_mgL?: number;
  hexChromium_mgL?: number;
  oilAndGrease_mgL?: number;
  ammoniacalN_mgL?: number;
}

// ============================================================
// Sensor Reading (→ ZENO-FAC-{id} per-facility topic)
// ============================================================

/**
 * Single sensor reading — represents a 1-minute average
 * as per CPCB OCEMS guidelines (Section 5.4.5).
 */
export interface SensorReading {
  timestamp: string;           // ISO 8601 — when the 1-min avg was computed
  facilityId: string;
  facilityDID: string;

  // CPCB Schedule-VI parameters
  pH: number;
  BOD_mgL: number;
  COD_mgL: number;
  TSS_mgL: number;
  temperature_C: number;
  totalChromium_mgL: number;
  hexChromium_mgL: number;
  oilAndGrease_mgL: number;
  ammoniacalN_mgL: number;
  dissolvedOxygen_mgL: number;
  flow_KLD: number;

  // Device metadata
  sensorStatus: SensorStatus;
  kmsKeyId: string;
  kmsSigHash: string;
}

export type SensorStatus =
  | 'online'
  | 'offline_queued'
  | 'reconnected_batch'
  | 'maintenance'
  | 'calibrating';

/**
 * 15-minute transmission batch — bundles multiple 1-min readings.
 * This is what actually gets submitted to HCS in production.
 * Matches real OCEMS: 15 × 1-min averages per transmission window.
 */
export interface SensorReadingBatch {
  facilityId: string;
  batchId: string;             // unique batch identifier
  windowStart: string;         // start of 15-min window
  windowEnd: string;           // end of 15-min window
  readingCount: number;        // number of 1-min readings in batch (max 15)
  readings: SensorReading[];

  // Batch-level aggregates (for quick compliance screening)
  averages: ParameterAverages;

  // Single KMS signature covers the entire batch
  kmsKeyId: string;
  kmsBatchSigHash: string;

  // Connectivity metadata
  transmissionMode: 'realtime' | 'queued_offline' | 'reconnected_batch';
  queuedSince?: string;       // if offline, when readings started queuing
}

export interface ParameterAverages {
  pH: number;
  BOD_mgL: number;
  COD_mgL: number;
  TSS_mgL: number;
  temperature_C: number;
  totalChromium_mgL: number;
  hexChromium_mgL: number;
  oilAndGrease_mgL: number;
  ammoniacalN_mgL: number;
  dissolvedOxygen_mgL: number;
  flow_KLD: number;
}

// ============================================================
// Compliance Evaluation (→ ZENO-COMPLIANCE topic)
// ============================================================

/**
 * CPCB Schedule-VI discharge limits (general standards).
 * These are the DEFAULTS — CTO-specific limits override when present.
 */
export const DISCHARGE_LIMITS = {
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

/**
 * CPCB calibration tolerance bands (Section 5.4.4 of 2018 guidelines).
 * Values within tolerance are NOT violations even if slightly above threshold.
 */
export const CALIBRATION_TOLERANCES = {
  COD_mgL: 0.10,         // ±10%
  BOD_mgL: 0.10,         // ±10%
  TSS_mgL: 0.10,         // ±10%
  pH: 0.2,               // ±0.2 pH units (absolute, not percentage)
} as const;

export interface ComplianceEvaluation {
  evaluationId: string;
  facilityId: string;
  facilityTopicId: string;

  // Back-references to source data (trust chain)
  readingBatchId: string;
  readingMessageSequences: number[];  // HCS sequence numbers on facility topic
  readingTimestampRange: { from: string; to: string };

  evaluatedAt: string;

  // Which limits were applied
  limitsSource: 'schedule_vi' | 'cto_override';
  isZLD: boolean;

  // Per-parameter results
  parameterResults: ParameterComplianceResult[];

  // Overall
  overallCompliant: boolean;
  violationCount: number;
  criticalViolationCount: number; // >50% over threshold

  // Token action taken
  tokenAction: 'mint_ggcc' | 'mint_violation_nft' | 'none' | 'pending_review';
  tokenId?: string;
  tokenTxId?: string;
  tokenSerial?: number;
}

export interface ParameterComplianceResult {
  parameter: string;
  value: number;
  threshold: number;
  thresholdType: 'max' | 'min' | 'range';
  unit: string;
  compliant: boolean;
  deviationPercent: number;       // how far from threshold (positive = over)
  toleranceBand: number;          // applicable tolerance (0.10 or 0.2)
  withinTolerance: boolean;       // within calibration tolerance even if over
  severity: 'none' | 'marginal' | 'moderate' | 'critical';
}

// ============================================================
// Calibration Record (→ ZENO-CALIBRATION topic)
// ============================================================

export interface CalibrationRecord {
  facilityId: string;
  deviceSerialNumber: string;
  parameter: string;
  calibrationType: 'routine_weekly' | 'quarterly' | 'annual_performance' | 'post_maintenance';
  calibrationAgency: string;       // EPA-recognized lab or NABL-accredited
  agencyAccreditationId: string;

  // Calibration data
  referenceValue: number;
  measuredValue: number;
  deviationPercent: number;
  passed: boolean;

  // Composite sampling details (per CPCB guidelines)
  compositeSampleDuration_hours?: number;  // min 6 hours for continuous process
  sampleIntervalMinutes?: number;          // every 30 min

  calibratedAt: string;
  nextCalibrationDue: string;
  certificateIPFSHash?: string;
}

// ============================================================
// Device Heartbeat (→ ZENO-FAC-{id} topic, interleaved with readings)
// ============================================================

export interface DeviceHeartbeat {
  facilityId: string;
  deviceSerialNumber: string;
  status: SensorStatus;

  // Uptime tracking (CPCB requires 85% monthly minimum)
  uptimePercent30Day: number;
  uptimePercentCurrentMonth: number;
  totalOnlineMinutes30Day: number;
  totalMinutes30Day: number;

  // Diagnostics
  lastReadingTimestamp: string;
  queuedReadings: number;         // readings buffered during offline
  signalStrength_dBm?: number;
  memoryUsagePercent?: number;
  firmwareVersion: string;

  timestamp: string;
}

// ============================================================
// Violation Alert (→ ZENO-ALERTS topic)
// ============================================================

export type AlertSeverity = 'warning' | 'violation' | 'critical' | 'tampering_suspected';

export type AlertCategory =
  | 'parameter_exceedance'
  | 'zld_discharge_detected'
  | 'uptime_below_threshold'
  | 'calibration_overdue'
  | 'suspicious_pattern'        // constant readings, sudden cliffs
  | 'offline_extended'          // >4 hours without maintenance notification
  | 'device_identity_mismatch'
  | 'timestamp_anomaly';

export interface ViolationAlert {
  alertId: string;
  facilityId: string;
  severity: AlertSeverity;
  category: AlertCategory;

  // What triggered it
  description: string;
  parameterName?: string;
  readingValue?: number;
  threshold?: number;

  // Back-references
  facilityTopicId: string;
  readingMessageSequence?: number;
  complianceEvaluationId?: string;

  // Actions
  spcbNotified: boolean;
  violationNftMinted: boolean;
  violationNftTokenId?: string;
  violationNftSerial?: number;

  timestamp: string;
}

// ============================================================
// Trust Chain Evidence Package (for NGT/Section 65B)
// ============================================================

/**
 * Complete evidence package that traces a token back to raw sensor data.
 * Designed for IT Act 2000 Section 65B compliance.
 */
export interface TrustChainEvidence {
  // Token being traced
  tokenId: string;
  tokenSerial?: number;
  tokenType: 'GGCC' | 'ZVIOL' | 'ZCERT';
  tokenMintTxId: string;

  // Facility identity
  facilityId: string;
  facilityRegistration: {
    registryTopicId: string;
    registryMessageSequence: number;
  };

  // Raw sensor data chain
  sensorData: {
    facilityTopicId: string;
    readingMessageSequences: number[];
    batchId: string;
    readingTimestampRange: { from: string; to: string };
    readingCount: number;
  };

  // Compliance evaluation
  complianceEvaluation: {
    complianceTopicId: string;
    evaluationMessageSequence: number;
    evaluationId: string;
    overallCompliant: boolean;
    violationCount: number;
  };

  // KMS cryptographic proof
  kmsProof: {
    kmsKeyId: string;
    deviceHederaAccountId: string;
    batchSignatureHash: string;
    cloudTrailReference?: string;  // AWS CloudTrail event ID
  };

  // Satellite cross-validation (when available)
  satelliteValidation?: {
    sentinelTileId: string;
    tileDate: string;
    ndtiValue: number;
    turbidityNTU: number;
    correlationScore: number;
    alertsTopicMessageSequence?: number;
  };

  // Calibration status at time of reading
  calibrationStatus?: {
    calibrationTopicMessageSequence: number;
    lastCalibrationDate: string;
    deviationPercent: number;
    calibrationPassed: boolean;
  };

  // Evidence generation metadata
  generatedAt: string;
  hashScanLinks: {
    token: string;
    facilityTopic: string;
    complianceTopic: string;
    mintTransaction: string;
    account: string;
  };
}

// ============================================================
// Mirror Node Response Types
// ============================================================

export interface MirrorNodeMessage {
  consensus_timestamp: string;
  message: string;              // base64 encoded
  payer_account_id: string;
  running_hash: string;
  sequence_number: number;
  topic_id: string;
}

export interface MirrorNodeResponse<T> {
  [key: string]: T[] | { next: string | null } | undefined;
  links?: { next: string | null };
}

export interface TokenBalance {
  token_id: string;
  balance: number;
  decimals: number;
}

export interface NFTInfo {
  account_id: string;
  created_timestamp: string;
  metadata: string;
  serial_number: number;
  token_id: string;
}
