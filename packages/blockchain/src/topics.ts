/**
 * Zeno Multi-Topic HCS Architecture
 *
 * Topic structure mirrors real CPCB OCEMS data flow:
 *
 *   ZENO-REGISTRY       → Facility registrations, CTO limits, device bindings
 *   ZENO-FAC-{id}       → Per-facility sensor readings (submit key = device KMS key)
 *   ZENO-COMPLIANCE     → Compliance evaluation results (submit key = operator)
 *   ZENO-CALIBRATION    → Calibration records per device
 *   ZENO-ALERTS         → Violations, anomalies, uptime breaches
 *
 * Submit keys enforce access control:
 * - Only the device's KMS-backed Hedera account can write to its facility topic
 * - Only the operator can write compliance evaluations
 * - Anyone can read via Mirror Node (transparency by design)
 */

import {
  TopicCreateTransaction,
  TopicUpdateTransaction,
  TopicId,
  PublicKey,
} from '@hashgraph/sdk';
import { getClient } from './client';
import type { ZenoTopicSet, FacilityTopicBinding } from './types';

/**
 * Create all system-level topics (one-time setup).
 * These are shared across all facilities.
 */
export async function createSystemTopics(): Promise<ZenoTopicSet> {
  const client = getClient();

  const registryTopicId = await createTopic(
    'Zeno Registry | Facility registrations, CTO limits, device identity bindings',
    client
  );

  const complianceTopicId = await createTopic(
    'Zeno Compliance | Evaluation results with back-references to facility readings',
    client
  );

  const calibrationTopicId = await createTopic(
    'Zeno Calibration | Device calibration records, agency certifications',
    client
  );

  const alertsTopicId = await createTopic(
    'Zeno Alerts | Violations, anomalies, uptime breaches, tampering flags',
    client
  );

  return {
    registryTopicId,
    complianceTopicId,
    calibrationTopicId,
    alertsTopicId,
  };
}

/**
 * Create a per-facility topic with optional submit key.
 *
 * When a submit key is set, ONLY the holder of the corresponding
 * private key can submit messages. This prevents unauthorized
 * data injection into a facility's sensor stream.
 *
 * In production: submitKey = device's KMS-derived Hedera public key
 * For hackathon demo: submitKey = operator key (until KMS is set up)
 */
export async function createFacilityTopic(
  facilityId: string,
  submitKey?: PublicKey
): Promise<FacilityTopicBinding> {
  const client = getClient();

  const memo = `Zeno OCEMS | Facility: ${facilityId} | 1-min avg, 15-min batch | CPCB Schedule-VI`;

  const tx = new TopicCreateTransaction().setTopicMemo(memo);

  if (submitKey) {
    tx.setSubmitKey(submitKey);
  }

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error(`Failed to create topic for facility ${facilityId}`);
  }

  const topicId = receipt.topicId.toString();

  return {
    facilityId,
    topicId,
    submitKeyAccountId: submitKey ? 'kms-device' : client.operatorAccountId!.toString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Set or update a submit key on an existing facility topic.
 * Used when a device's KMS key is created after the topic.
 */
export async function setFacilityTopicSubmitKey(
  topicId: string,
  submitKey: PublicKey
): Promise<void> {
  const client = getClient();

  const tx = new TopicUpdateTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setSubmitKey(submitKey);

  const response = await tx.execute(client);
  await response.getReceipt(client);
}

// ============================================================
// Internal helper
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTopic(memo: string, client: any): Promise<string> {
  const tx = new TopicCreateTransaction().setTopicMemo(memo);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error(`Failed to create topic: ${memo}`);
  }

  return receipt.topicId.toString();
}
