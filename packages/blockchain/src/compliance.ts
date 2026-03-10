/**
 * Zeno Compliance Evaluation Engine
 *
 * Implements CPCB Schedule-VI two-tier discharge standard checking:
 *
 * Tier 1: Schedule-VI general standards (defaults for all GPIs)
 * Tier 2: CTO-specific limits (stricter, per-facility from Consent to Operate)
 *
 * Special modes:
 * - ZLD (Zero Liquid Discharge): ANY flow > 0 = violation regardless of params
 * - Calibration tolerance: ±10% for COD/BOD/TSS, ±0.2 for pH (CPCB Section 5.4.4)
 *
 * Severity classification:
 * - none:     within limits
 * - marginal: within calibration tolerance band (warning, not violation)
 * - moderate: 1-50% over threshold
 * - critical: >50% over threshold (triggers immediate SPCB notification)
 */

import {
  DISCHARGE_LIMITS,
  CALIBRATION_TOLERANCES,
  type SensorReading,
  type SensorReadingBatch,
  type CTOCustomLimits,
  type ComplianceEvaluation,
  type ParameterComplianceResult,
  type ParameterAverages,
} from './types';
import { randomUUID } from 'crypto';

// ============================================================
// Parameter definitions with units and threshold types
// ============================================================

interface ParameterDef {
  key: keyof ParameterAverages;
  name: string;
  unit: string;
  thresholdType: 'max' | 'range';
  defaultLimit: number | { min: number; max: number };
  ctoKey?: keyof CTOCustomLimits;
  toleranceKey?: keyof typeof CALIBRATION_TOLERANCES;
}

const PARAMETER_DEFS: ParameterDef[] = [
  {
    key: 'pH', name: 'pH', unit: 'pH',
    thresholdType: 'range',
    defaultLimit: DISCHARGE_LIMITS.pH,
    ctoKey: 'pH_min',  // uses both pH_min and pH_max from CTO
    toleranceKey: 'pH',
  },
  {
    key: 'BOD_mgL', name: 'BOD (3-day, 27°C)', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.BOD_mgL,
    ctoKey: 'BOD_mgL',
    toleranceKey: 'BOD_mgL',
  },
  {
    key: 'COD_mgL', name: 'COD', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.COD_mgL,
    ctoKey: 'COD_mgL',
    toleranceKey: 'COD_mgL',
  },
  {
    key: 'TSS_mgL', name: 'Total Suspended Solids', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.TSS_mgL,
    ctoKey: 'TSS_mgL',
    toleranceKey: 'TSS_mgL',
  },
  {
    key: 'temperature_C', name: 'Temperature', unit: '°C above ambient',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.temperature_C_above_ambient,
    ctoKey: 'temperature_C_above_ambient',
  },
  {
    key: 'totalChromium_mgL', name: 'Total Chromium', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.totalChromium_mgL,
    ctoKey: 'totalChromium_mgL',
  },
  {
    key: 'hexChromium_mgL', name: 'Hexavalent Chromium', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.hexChromium_mgL,
    ctoKey: 'hexChromium_mgL',
  },
  {
    key: 'oilAndGrease_mgL', name: 'Oil & Grease', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.oilAndGrease_mgL,
    ctoKey: 'oilAndGrease_mgL',
  },
  {
    key: 'ammoniacalN_mgL', name: 'Ammoniacal Nitrogen', unit: 'mg/L',
    thresholdType: 'max',
    defaultLimit: DISCHARGE_LIMITS.ammoniacalN_mgL,
    ctoKey: 'ammoniacalN_mgL',
  },
];

// ============================================================
// Core evaluation function
// ============================================================

/**
 * Evaluate a set of sensor readings against discharge standards.
 *
 * @param readings - Array of 1-min average readings (typically 15 per batch)
 * @param facilityId - Facility identifier
 * @param facilityTopicId - HCS topic where readings were submitted
 * @param readingMessageSequences - HCS sequence numbers for trust chain
 * @param options - CTO overrides, ZLD mode, ambient temperature
 */
export function evaluateCompliance(
  readings: SensorReading[],
  facilityId: string,
  facilityTopicId: string,
  readingMessageSequences: number[],
  options: {
    ctoLimits?: CTOCustomLimits | null;
    isZLD?: boolean;
    ambientTemperature_C?: number;
  } = {}
): ComplianceEvaluation {
  const { ctoLimits, isZLD = false, ambientTemperature_C = 30 } = options;

  // Compute batch averages
  const averages = computeAverages(readings);
  const limitsSource = ctoLimits ? 'cto_override' : 'schedule_vi';

  // Evaluate each parameter
  const parameterResults: ParameterComplianceResult[] = [];

  // ZLD check first — any flow = violation
  if (isZLD) {
    const zldResult = evaluateZLD(averages.flow_KLD);
    parameterResults.push(zldResult);

    if (!zldResult.compliant) {
      // All other parameters are moot if ZLD is violated
      return buildEvaluation({
        facilityId,
        facilityTopicId,
        readingMessageSequences,
        readings,
        averages,
        limitsSource,
        isZLD: true,
        parameterResults,
      });
    }
  }

  for (const def of PARAMETER_DEFS) {
    const value = averages[def.key];
    const result = evaluateParameter(value, def, ctoLimits, ambientTemperature_C);
    parameterResults.push(result);
  }

  return buildEvaluation({
    facilityId,
    facilityTopicId,
    readingMessageSequences,
    readings,
    averages,
    limitsSource,
    isZLD,
    parameterResults,
  });
}

/**
 * Evaluate a single reading (convenience wrapper).
 */
export function evaluateSingleReading(
  reading: SensorReading,
  facilityTopicId: string,
  readingMessageSequence: number,
  options: {
    ctoLimits?: CTOCustomLimits | null;
    isZLD?: boolean;
    ambientTemperature_C?: number;
  } = {}
): ComplianceEvaluation {
  return evaluateCompliance(
    [reading],
    reading.facilityId,
    facilityTopicId,
    [readingMessageSequence],
    options
  );
}

// ============================================================
// Parameter evaluation
// ============================================================

function evaluateParameter(
  value: number,
  def: ParameterDef,
  ctoLimits?: CTOCustomLimits | null,
  ambientTemp_C: number = 30,
): ParameterComplianceResult {
  // Determine effective threshold
  let threshold: number;
  let thresholdType = def.thresholdType;

  if (def.thresholdType === 'range') {
    // pH — range check
    const defaultRange = def.defaultLimit as { min: number; max: number };
    const pHMin = ctoLimits?.pH_min ?? defaultRange.min;
    const pHMax = ctoLimits?.pH_max ?? defaultRange.max;

    return evaluateRangeParameter(value, pHMin, pHMax, def);
  }

  // Max-type parameter
  const defaultMax = def.defaultLimit as number;

  if (def.key === 'temperature_C') {
    // Temperature threshold is relative to ambient
    threshold = ambientTemp_C + (ctoLimits?.temperature_C_above_ambient ?? defaultMax);
  } else if (def.ctoKey && ctoLimits && ctoLimits[def.ctoKey] !== undefined) {
    threshold = ctoLimits[def.ctoKey]!;
  } else {
    threshold = defaultMax;
  }

  // Calculate deviation
  const deviationPercent = threshold > 0 ? ((value - threshold) / threshold) * 100 : 0;

  // Check calibration tolerance
  const toleranceFraction = def.toleranceKey
    ? CALIBRATION_TOLERANCES[def.toleranceKey]
    : 0;
  const toleranceAbsolute = threshold * toleranceFraction;
  const withinTolerance = value <= threshold + toleranceAbsolute;

  // Compliant if value ≤ threshold
  const compliant = value <= threshold;

  // Severity classification
  const severity = classifySeverity(compliant, deviationPercent, withinTolerance);

  return {
    parameter: def.name,
    value,
    threshold,
    thresholdType: 'max',
    unit: def.unit,
    compliant,
    deviationPercent: Math.round(deviationPercent * 100) / 100,
    toleranceBand: toleranceFraction,
    withinTolerance,
    severity,
  };
}

function evaluateRangeParameter(
  value: number,
  min: number,
  max: number,
  def: ParameterDef
): ParameterComplianceResult {
  const compliant = value >= min && value <= max;

  // Deviation from nearest boundary
  let deviationPercent = 0;
  let threshold = 0;
  if (value < min) {
    deviationPercent = ((min - value) / min) * 100;
    threshold = min;
  } else if (value > max) {
    deviationPercent = ((value - max) / max) * 100;
    threshold = max;
  } else {
    threshold = value <= (min + max) / 2 ? min : max;
  }

  // pH tolerance is absolute ±0.2, not percentage
  const toleranceValue = def.toleranceKey
    ? CALIBRATION_TOLERANCES[def.toleranceKey]
    : 0;
  const withinTolerance = value >= (min - toleranceValue) && value <= (max + toleranceValue);

  const severity = classifySeverity(compliant, deviationPercent, withinTolerance);

  return {
    parameter: def.name,
    value,
    threshold,
    thresholdType: 'range',
    unit: def.unit,
    compliant,
    deviationPercent: Math.round(deviationPercent * 100) / 100,
    toleranceBand: toleranceValue,
    withinTolerance,
    severity,
  };
}

function evaluateZLD(flow_KLD: number): ParameterComplianceResult {
  const compliant = flow_KLD === 0;
  return {
    parameter: 'ZLD Compliance (Zero Liquid Discharge)',
    value: flow_KLD,
    threshold: 0,
    thresholdType: 'max',
    unit: 'KLD',
    compliant,
    deviationPercent: flow_KLD > 0 ? 100 : 0,
    toleranceBand: 0,
    withinTolerance: compliant,
    severity: compliant ? 'none' : 'critical',
  };
}

// ============================================================
// Severity classification
// ============================================================

function classifySeverity(
  compliant: boolean,
  deviationPercent: number,
  withinTolerance: boolean
): 'none' | 'marginal' | 'moderate' | 'critical' {
  if (compliant) return 'none';
  if (withinTolerance) return 'marginal';
  if (deviationPercent <= 50) return 'moderate';
  return 'critical';
}

// ============================================================
// Batch averaging
// ============================================================

export function computeAverages(readings: SensorReading[]): ParameterAverages {
  const n = readings.length;
  if (n === 0) {
    throw new Error('Cannot compute averages of empty readings array');
  }

  const sum = {
    pH: 0, BOD_mgL: 0, COD_mgL: 0, TSS_mgL: 0, temperature_C: 0,
    totalChromium_mgL: 0, hexChromium_mgL: 0, oilAndGrease_mgL: 0,
    ammoniacalN_mgL: 0, dissolvedOxygen_mgL: 0, flow_KLD: 0,
  };

  for (const r of readings) {
    sum.pH += r.pH;
    sum.BOD_mgL += r.BOD_mgL;
    sum.COD_mgL += r.COD_mgL;
    sum.TSS_mgL += r.TSS_mgL;
    sum.temperature_C += r.temperature_C;
    sum.totalChromium_mgL += r.totalChromium_mgL;
    sum.hexChromium_mgL += r.hexChromium_mgL;
    sum.oilAndGrease_mgL += r.oilAndGrease_mgL;
    sum.ammoniacalN_mgL += r.ammoniacalN_mgL;
    sum.dissolvedOxygen_mgL += r.dissolvedOxygen_mgL;
    sum.flow_KLD += r.flow_KLD;
  }

  return {
    pH: round(sum.pH / n),
    BOD_mgL: round(sum.BOD_mgL / n),
    COD_mgL: round(sum.COD_mgL / n),
    TSS_mgL: round(sum.TSS_mgL / n),
    temperature_C: round(sum.temperature_C / n),
    totalChromium_mgL: round(sum.totalChromium_mgL / n),
    hexChromium_mgL: round(sum.hexChromium_mgL / n),
    oilAndGrease_mgL: round(sum.oilAndGrease_mgL / n),
    ammoniacalN_mgL: round(sum.ammoniacalN_mgL / n),
    dissolvedOxygen_mgL: round(sum.dissolvedOxygen_mgL / n),
    flow_KLD: round(sum.flow_KLD / n),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ============================================================
// Build evaluation result
// ============================================================

function buildEvaluation(params: {
  facilityId: string;
  facilityTopicId: string;
  readingMessageSequences: number[];
  readings: SensorReading[];
  averages: ParameterAverages;
  limitsSource: 'schedule_vi' | 'cto_override';
  isZLD: boolean;
  parameterResults: ParameterComplianceResult[];
}): ComplianceEvaluation {
  const violations = params.parameterResults.filter(r => !r.compliant);
  const criticalViolations = params.parameterResults.filter(r => r.severity === 'critical');
  const overallCompliant = violations.length === 0;

  // Determine token action
  let tokenAction: ComplianceEvaluation['tokenAction'] = 'none';
  if (overallCompliant) {
    tokenAction = 'mint_ggcc';
  } else if (criticalViolations.length > 0) {
    tokenAction = 'mint_violation_nft';
  } else {
    // Moderate violations — pending review (satellite cross-validation, VVB audit)
    tokenAction = 'pending_review';
  }

  const timestamps = params.readings.map(r => r.timestamp).sort();

  return {
    evaluationId: randomUUID(),
    facilityId: params.facilityId,
    facilityTopicId: params.facilityTopicId,
    readingBatchId: randomUUID(),
    readingMessageSequences: params.readingMessageSequences,
    readingTimestampRange: {
      from: timestamps[0],
      to: timestamps[timestamps.length - 1],
    },
    evaluatedAt: new Date().toISOString(),
    limitsSource: params.limitsSource,
    isZLD: params.isZLD,
    parameterResults: params.parameterResults,
    overallCompliant,
    violationCount: violations.length,
    criticalViolationCount: criticalViolations.length,
    tokenAction,
  };
}
