// Types
export type {
  SensorReading, SensorReadingBatch, ParameterAverages,
  MirrorNodeMessage, TokenBalance, NFTInfo,
  HCSMessageEnvelope, HCSMessageType,
  ZenoTopicSet, FacilityTopicBinding,
  FacilityRegistration, CTOCustomLimits,
  ComplianceEvaluation, ParameterComplianceResult,
  CalibrationRecord, DeviceHeartbeat,
  ViolationAlert, AlertSeverity, AlertCategory,
  TrustChainEvidence, SensorStatus,
} from './types';
export { SCHEMA_VERSION, DISCHARGE_LIMITS, CALIBRATION_TOLERANCES } from './types';

// Client
export { getClient } from './client';

// Topic management
export { createSystemTopics, createFacilityTopic, setFacilityTopicSubmitKey } from './topics';

// HCS messaging
export {
  submitMessage,
  submitFacilityRegistration,
  submitSensorReading,
  submitSensorReadingBatch,
  submitComplianceEvaluation,
  submitCalibrationRecord,
  submitDeviceHeartbeat,
  submitViolationAlert,
  getTypedMessages,
  getSensorReadings,
  getSensorReadingBatches,
  getComplianceEvaluations,
  getFacilityRegistrations,
  getViolationAlerts,
} from './hcs';

// HTS tokens
export {
  createComplianceCreditToken,
  createViolationNFTCollection,
  createComplianceCertNFTCollection,
  mintComplianceCredit,
  mintViolationNFT,
  mintComplianceCertNFT,
} from './hts';

// KMS signing
export {
  getHederaPublicKeyFromKMS,
  createKMSAccount,
  buildKMSSigner,
  signAndExecute,
  parseDERSignature,
} from './kms-signer';

// Mirror Node
export {
  getTopicMessages,
  getAccountTokens,
  getTransactionDetails,
  getNFTInfo,
  getAccountBalance,
} from './mirror';

// Compliance engine
export {
  evaluateCompliance,
  evaluateSingleReading,
  computeAverages,
} from './compliance';

// Trust chain
export { buildTrustChainEvidence, printTrustChain } from './trust-chain';

// Validator
export { validateSensorReading } from './validator';
