/**
 * Zeno HCS Message Submission & Retrieval
 *
 * All messages are wrapped in HCSMessageEnvelope for:
 * - Schema version tracking (forward compatibility)
 * - Message type routing (registry, reading, compliance, calibration, alert)
 * - Source attribution (which device/operator submitted)
 *
 * Reading flow matches real CPCB OCEMS:
 * 1. Device computes 1-min averages from raw analyzer signals
 * 2. Every 15 minutes, batch of 1-min readings is KMS-signed and submitted
 * 3. If offline, readings queue locally with original timestamps
 * 4. On reconnect, queued batches submitted with transmissionMode='reconnected_batch'
 */

import {
  TopicMessageSubmitTransaction,
  TopicId,
  Client,
} from '@hashgraph/sdk';
import { getClient } from './client';
import { getTopicMessages } from './mirror';
import type {
  HCSMessageEnvelope,
  HCSMessageType,
  SensorReading,
  SensorReadingBatch,
  FacilityRegistration,
  ComplianceEvaluation,
  CalibrationRecord,
  DeviceHeartbeat,
  ViolationAlert,
  SCHEMA_VERSION,
} from './types';

const CURRENT_SCHEMA_VERSION = '1.0.0';

// ============================================================
// Generic envelope submission
// ============================================================

/**
 * Submit any typed message to an HCS topic wrapped in an envelope.
 * Optionally accepts a KMS-signed client for device-authenticated submissions.
 */
export async function submitMessage<T>(
  topicId: string,
  type: HCSMessageType,
  payload: T,
  kmsSignedClient?: Client,
): Promise<{ txId: string; sequenceNumber: number }> {
  const client = kmsSignedClient || getClient();

  const envelope: HCSMessageEnvelope<T> = {
    v: CURRENT_SCHEMA_VERSION,
    type,
    ts: new Date().toISOString(),
    src: client.operatorAccountId!.toString(),
    payload,
  };

  const message = JSON.stringify(envelope);

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber),
  };
}

// ============================================================
// Typed submission helpers
// ============================================================

/** Submit facility registration to ZENO-REGISTRY topic */
export async function submitFacilityRegistration(
  registryTopicId: string,
  registration: FacilityRegistration
) {
  return submitMessage(registryTopicId, 'facility_registration', registration);
}

/** Submit single sensor reading to facility topic.
 *  Pass kmsSignedClient to submit as the device identity (KMS-backed account). */
export async function submitSensorReading(
  facilityTopicId: string,
  reading: SensorReading,
  kmsSignedClient?: Client,
) {
  return submitMessage(facilityTopicId, 'sensor_reading', reading, kmsSignedClient);
}

/** Submit 15-min reading batch to facility topic.
 *  Pass kmsSignedClient to submit as the device identity (KMS-backed account). */
export async function submitSensorReadingBatch(
  facilityTopicId: string,
  batch: SensorReadingBatch,
  kmsSignedClient?: Client,
) {
  return submitMessage(facilityTopicId, 'sensor_reading_batch', batch, kmsSignedClient);
}

/** Submit compliance evaluation to ZENO-COMPLIANCE topic */
export async function submitComplianceEvaluation(
  complianceTopicId: string,
  evaluation: ComplianceEvaluation
) {
  return submitMessage(complianceTopicId, 'compliance_evaluation', evaluation);
}

/** Submit calibration record to ZENO-CALIBRATION topic */
export async function submitCalibrationRecord(
  calibrationTopicId: string,
  record: CalibrationRecord
) {
  return submitMessage(calibrationTopicId, 'calibration_record', record);
}

/** Submit device heartbeat to facility topic */
export async function submitDeviceHeartbeat(
  facilityTopicId: string,
  heartbeat: DeviceHeartbeat
) {
  return submitMessage(facilityTopicId, 'device_heartbeat', heartbeat);
}

/** Submit violation alert to ZENO-ALERTS topic */
export async function submitViolationAlert(
  alertsTopicId: string,
  alert: ViolationAlert
) {
  return submitMessage(alertsTopicId, 'violation_alert', alert);
}

// ============================================================
// Query & Parse
// ============================================================

/**
 * Retrieve and parse typed messages from a topic.
 * Handles envelope unwrapping and optional type filtering.
 */
export async function getTypedMessages<T>(
  topicId: string,
  messageType?: HCSMessageType,
  fromTimestamp?: string
): Promise<Array<{ envelope: HCSMessageEnvelope<T>; sequence: number; consensusTimestamp: string }>> {
  const raw = await getTopicMessages(topicId, { timestampGte: fromTimestamp });

  const results: Array<{ envelope: HCSMessageEnvelope<T>; sequence: number; consensusTimestamp: string }> = [];

  for (const msg of raw) {
    try {
      const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
      const envelope = JSON.parse(decoded) as HCSMessageEnvelope<T>;

      if (messageType && envelope.type !== messageType) continue;

      results.push({
        envelope,
        sequence: msg.sequence_number,
        consensusTimestamp: msg.consensus_timestamp,
      });
    } catch {
      // Skip malformed messages — log to alerts in production
    }
  }

  return results;
}

/** Get sensor readings from a facility topic */
export async function getSensorReadings(
  facilityTopicId: string,
  fromTimestamp?: string
): Promise<SensorReading[]> {
  const messages = await getTypedMessages<SensorReading>(
    facilityTopicId,
    'sensor_reading',
    fromTimestamp
  );
  return messages.map(m => m.envelope.payload);
}

/** Get sensor reading batches from a facility topic */
export async function getSensorReadingBatches(
  facilityTopicId: string,
  fromTimestamp?: string
): Promise<SensorReadingBatch[]> {
  const messages = await getTypedMessages<SensorReadingBatch>(
    facilityTopicId,
    'sensor_reading_batch',
    fromTimestamp
  );
  return messages.map(m => m.envelope.payload);
}

/** Get compliance evaluations from ZENO-COMPLIANCE topic */
export async function getComplianceEvaluations(
  complianceTopicId: string,
  facilityId?: string,
  fromTimestamp?: string
): Promise<ComplianceEvaluation[]> {
  const messages = await getTypedMessages<ComplianceEvaluation>(
    complianceTopicId,
    'compliance_evaluation',
    fromTimestamp
  );

  const evaluations = messages.map(m => m.envelope.payload);
  if (facilityId) {
    return evaluations.filter(e => e.facilityId === facilityId);
  }
  return evaluations;
}

/** Get facility registrations from ZENO-REGISTRY topic */
export async function getFacilityRegistrations(
  registryTopicId: string,
  fromTimestamp?: string
): Promise<FacilityRegistration[]> {
  const messages = await getTypedMessages<FacilityRegistration>(
    registryTopicId,
    'facility_registration',
    fromTimestamp
  );
  return messages.map(m => m.envelope.payload);
}

/** Get violation alerts from ZENO-ALERTS topic */
export async function getViolationAlerts(
  alertsTopicId: string,
  facilityId?: string,
  fromTimestamp?: string
): Promise<ViolationAlert[]> {
  const messages = await getTypedMessages<ViolationAlert>(
    alertsTopicId,
    'violation_alert',
    fromTimestamp
  );

  const alerts = messages.map(m => m.envelope.payload);
  if (facilityId) {
    return alerts.filter(a => a.facilityId === facilityId);
  }
  return alerts;
}

// ============================================================
// Legacy compatibility — createFacilityTopic re-exported from topics.ts
// ============================================================

export { createFacilityTopic } from './topics';
