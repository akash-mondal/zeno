import type { FacilityConfig } from './facilities';
import {
  IndustryCategory,
  INDUSTRY_PROFILES,
  AMBIENT_TEMP_BASELINE,
  AMBIENT_TEMP_AMPLITUDE,
  PH_DIURNAL_AMPLITUDE,
  type GenerationScenario,
  type ParameterRange,
  type IndustryProfile,
} from './standards';

// -------------------------------------------------------------------
// Output type — matches @zeno/blockchain SensorReading exactly
// -------------------------------------------------------------------
export interface SensorReading {
  timestamp: string;
  facilityId: string;
  facilityDID: string;
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
  sensorStatus: 'online' | 'offline_queued' | 'reconnected_batch' | 'maintenance' | 'calibrating';
  kmsKeyId: string;
  kmsSigHash: string;
}

export interface SensorReadingBatch {
  facilityId: string;
  batchId: string;
  windowStart: string;
  windowEnd: string;
  readingCount: number;
  readings: SensorReading[];
}

export interface GenerationOptions {
  forceViolation?: boolean;
  scenario?: GenerationScenario;
  kmsKeyId?: string;
  timestamp?: Date;             // Override timestamp (for batch generation)
  previousReading?: SensorReading; // For inter-reading correlation
  batchIndex?: number;          // Position within a batch (0-14)
  batchSize?: number;           // Total readings in this batch
}

// -------------------------------------------------------------------
// Utility functions
// -------------------------------------------------------------------

/** Random float in [min, max], rounded to 2 decimals */
function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

/** Random float from a ParameterRange */
function randRange(range: ParameterRange): number {
  return rand(range.min, range.max);
}

/** Gaussian-distributed random (Box-Muller), clamped to [min, max] */
function randGaussian(mean: number, stddev: number, min: number, max: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  // Avoid log(0)
  if (u1 === 0) u1 = 0.0001;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = mean + z * stddev;
  return Math.round(Math.max(min, Math.min(max, value)) * 100) / 100;
}

/** Generate a small delta from previous value for inter-reading variation */
function drift(previous: number, maxDelta: number, min: number, max: number): number {
  const delta = (Math.random() - 0.5) * 2 * maxDelta;
  return Math.round(Math.max(min, Math.min(max, previous + delta)) * 100) / 100;
}

/** Get hour of day (0-23) from timestamp for diurnal patterns */
function getHour(timestamp: Date): number {
  return timestamp.getHours() + timestamp.getMinutes() / 60;
}

/** Diurnal sine wave: peaks at peakHour, amplitude is half peak-to-trough */
function diurnalFactor(timestamp: Date, peakHour: number, amplitude: number): number {
  const hour = getHour(timestamp);
  return amplitude * Math.sin(((hour - peakHour + 6) / 24) * 2 * Math.PI);
}

// -------------------------------------------------------------------
// Core generation: single reading
// -------------------------------------------------------------------

export function generateSensorReading(
  facility: FacilityConfig,
  opts?: GenerationOptions,
): SensorReading {
  const scenario = opts?.scenario ?? 'normal';
  const timestamp = opts?.timestamp ?? new Date();
  const profile = INDUSTRY_PROFILES[facility.category];

  // Determine if this reading is a violation
  const isViolation = scenario === 'chronic_violator'
    || scenario === 'cetp_overload'
    || (scenario === 'zld_breach' && facility.ctoDischargeMode === 'ZLD')
    || (scenario === 'compliant' ? false
      : opts?.forceViolation ?? Math.random() < facility.violationProbability);

  // Select base ranges
  const ranges = isViolation ? profile.violation : profile.compliant;

  // Determine sensor status
  const sensorStatus = pickSensorStatus(scenario, opts?.batchIndex);

  // --- Generate correlated parameters ---

  // 1. Temperature: diurnal cycle (peaks at 14:00, coolest at 02:00)
  const ambientTemp = AMBIENT_TEMP_BASELINE + diurnalFactor(timestamp, 14, AMBIENT_TEMP_AMPLITUDE / 2);
  const processHeat = randRange(ranges.temperature_C) - AMBIENT_TEMP_BASELINE;
  let temperature_C = Math.round((ambientTemp + Math.max(0, processHeat)) * 100) / 100;
  temperature_C = Math.max(ranges.temperature_C.min, Math.min(ranges.temperature_C.max, temperature_C));

  // 2. pH: slight diurnal variation (rises at night due to reduced microbial activity)
  const phBase = randRange(ranges.pH);
  const phDiurnal = diurnalFactor(timestamp, 2, PH_DIURNAL_AMPLITUDE); // peaks at 2am
  let pH = Math.round((phBase + phDiurnal) * 100) / 100;
  pH = Math.max(0, Math.min(14, pH)); // analyzer limit

  // 3. BOD and COD: correlated via BOD/COD ratio
  //    Generate COD first (industry-specific), then derive BOD to maintain ratio
  let cod = randRange(ranges.COD_mgL);
  // Ensure COD is at least 1 to avoid zero-zero edge case
  if (cod < 1) cod = Math.round(rand(1, Math.max(2, ranges.COD_mgL.max)) * 100) / 100;

  const bodCodRatio = randRange(profile.typicalBodCodRatio);
  let bod = Math.round(cod * bodCodRatio * 100) / 100;
  // Clamp BOD to range but ALWAYS ensure COD > BOD
  bod = Math.max(ranges.BOD_mgL.min, Math.min(ranges.BOD_mgL.max, bod));
  if (bod >= cod) {
    bod = Math.round(Math.max(0, cod * 0.5) * 100) / 100; // force ratio ≤ 0.5
  }
  // Final hard clamp
  if (bod >= cod) {
    bod = Math.max(0, Math.round((cod - 0.5) * 100) / 100);
  }

  // 4. TSS: loosely correlated with COD (high organics → high suspended matter)
  const tssBase = randRange(ranges.TSS_mgL);
  const codFactor = cod / ((ranges.COD_mgL.min + ranges.COD_mgL.max) / 2);
  const tssRaw = tssBase * (0.8 + 0.2 * Math.min(codFactor, 1.5)); // damped correlation
  const tss = Math.round(Math.max(0, Math.min(ranges.TSS_mgL.max, tssRaw)) * 100) / 100;

  // 5. Chromium: totalCr first, then hexCr ≤ totalCr (chemistry invariant)
  const totalCr = randRange(ranges.totalChromium_mgL);
  let hexCr = randRange(ranges.hexChromium_mgL);
  // INVARIANT: hexavalent chromium is a subset of total chromium
  if (hexCr > totalCr) {
    hexCr = Math.round(totalCr * rand(0.02, 0.15) * 100) / 100;
  }

  // 6. Dissolved Oxygen: inversely correlated with BOD (high organic load → low DO)
  const doBase = randRange(ranges.dissolvedOxygen_mgL);
  const bodFactor = bod / ((ranges.BOD_mgL.min + ranges.BOD_mgL.max) / 2);
  const dissolvedOxygen = Math.round(Math.max(0, doBase * (1.3 - 0.3 * bodFactor)) * 100) / 100;

  // 7. Flow: ZLD compliant = 0, ZLD violation = non-zero
  let flow: number;
  if (facility.ctoDischargeMode === 'ZLD') {
    flow = isViolation ? randRange(ranges.flow_KLD) : 0;
  } else {
    flow = randRange(ranges.flow_KLD);
  }

  // 8. Oil & Grease and Ammoniacal Nitrogen: independent with mild noise
  const oilAndGrease = randRange(ranges.oilAndGrease_mgL);
  const ammoniacalN = randRange(ranges.ammoniacalN_mgL);

  // --- Apply inter-reading drift if previous reading exists ---
  let reading = buildReading({
    timestamp, facility, pH, bod, cod, tss, temperature_C,
    totalCr, hexCr, oilAndGrease, ammoniacalN, dissolvedOxygen, flow,
    sensorStatus, kmsKeyId: opts?.kmsKeyId,
  });

  if (opts?.previousReading && scenario !== 'sensor_malfunction') {
    reading = applyDrift(reading, opts.previousReading, profile, ranges);
  }

  // --- Apply scenario-specific modifications ---
  reading = applyScenario(reading, scenario, timestamp, opts);

  return reading;
}

// -------------------------------------------------------------------
// Batch generation: 15-min window of readings
// -------------------------------------------------------------------

export function generateBatch(
  facility: FacilityConfig,
  opts?: {
    windowStart?: Date;
    readingCount?: number;
    scenario?: GenerationScenario;
    kmsKeyId?: string;
  },
): SensorReadingBatch {
  const windowStart = opts?.windowStart ?? new Date();
  const readingCount = opts?.readingCount ?? 15; // 1-minute intervals in 15-min window
  const scenario = opts?.scenario ?? 'normal';

  const readings: SensorReading[] = [];
  let previousReading: SensorReading | undefined;

  for (let i = 0; i < readingCount; i++) {
    const readingTime = new Date(windowStart.getTime() + i * 60_000); // 1 minute apart
    const reading = generateSensorReading(facility, {
      scenario,
      timestamp: readingTime,
      previousReading,
      batchIndex: i,
      batchSize: readingCount,
      kmsKeyId: opts?.kmsKeyId,
    });
    readings.push(reading);
    previousReading = reading;
  }

  const windowEnd = new Date(windowStart.getTime() + (readingCount - 1) * 60_000);
  const batchId = `${facility.id}-${windowStart.getTime()}`;

  return {
    facilityId: facility.id,
    batchId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    readingCount,
    readings,
  };
}

// -------------------------------------------------------------------
// Multi-facility time-series generation
// -------------------------------------------------------------------

export function generateTimeSeries(
  facility: FacilityConfig,
  opts: {
    startTime: Date;
    batchCount: number;          // number of 15-min windows
    scenario?: GenerationScenario;
    kmsKeyId?: string;
  },
): SensorReadingBatch[] {
  const batches: SensorReadingBatch[] = [];
  for (let i = 0; i < opts.batchCount; i++) {
    const windowStart = new Date(opts.startTime.getTime() + i * 15 * 60_000);
    batches.push(generateBatch(facility, {
      windowStart,
      scenario: opts.scenario,
      kmsKeyId: opts.kmsKeyId,
    }));
  }
  return batches;
}

// -------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------

function buildReading(p: {
  timestamp: Date;
  facility: FacilityConfig;
  pH: number;
  bod: number;
  cod: number;
  tss: number;
  temperature_C: number;
  totalCr: number;
  hexCr: number;
  oilAndGrease: number;
  ammoniacalN: number;
  dissolvedOxygen: number;
  flow: number;
  sensorStatus: SensorReading['sensorStatus'];
  kmsKeyId?: string;
}): SensorReading {
  return {
    timestamp: p.timestamp.toISOString(),
    facilityId: p.facility.id,
    facilityDID: `did:hedera:testnet:${p.facility.id}`,
    pH: p.pH,
    BOD_mgL: p.bod,
    COD_mgL: p.cod,
    TSS_mgL: p.tss,
    temperature_C: p.temperature_C,
    totalChromium_mgL: p.totalCr,
    hexChromium_mgL: p.hexCr,
    oilAndGrease_mgL: p.oilAndGrease,
    ammoniacalN_mgL: p.ammoniacalN,
    dissolvedOxygen_mgL: p.dissolvedOxygen,
    flow_KLD: p.flow,
    sensorStatus: p.sensorStatus,
    kmsKeyId: p.kmsKeyId || `alias/hedera-signing-key-${p.facility.id}`,
    kmsSigHash: '', // populated after KMS signing
  };
}

/**
 * Apply small drift from previous reading to create realistic inter-reading continuity.
 * Drift magnitudes are kept well within the validator's rate-of-change limits:
 *   pH: 2.0/min, BOD: 50/min, COD: 150/min, TSS: 100/min, temp: 5/min,
 *   totalCr: 1.0/min, hexCr: 0.5/min, O&G: 10/min, NH3-N: 20/min, DO: 5/min
 * We use ~10-30% of the limit as max drift to stay safely within bounds.
 */
function applyDrift(
  current: SensorReading,
  previous: SensorReading,
  profile: IndustryProfile,
  ranges: IndustryProfile['compliant'],
): SensorReading {
  const driftedBod = drift(previous.BOD_mgL, 5, 0, 400);       // max 5/min vs limit 50
  const driftedCod = drift(previous.COD_mgL, 20, 0, 1000);     // max 20/min vs limit 150
  const driftedTotalCr = drift(previous.totalChromium_mgL, 0.08, 0, 50); // max 0.08 vs limit 1.0
  const driftedHexCr = drift(previous.hexChromium_mgL, 0.03, 0, 10);     // max 0.03 vs limit 0.5

  return {
    ...current,
    pH: drift(previous.pH, 0.15, 0, 14),                       // max 0.15 vs limit 2.0
    BOD_mgL: driftedBod,
    COD_mgL: Math.max(driftedBod + 5, driftedCod),             // maintain COD > BOD
    TSS_mgL: drift(previous.TSS_mgL, 8, 0, 1000),             // max 8 vs limit 100
    temperature_C: drift(previous.temperature_C, 0.4, -10, 60), // max 0.4 vs limit 5
    totalChromium_mgL: driftedTotalCr,
    hexChromium_mgL: Math.min(driftedTotalCr, driftedHexCr),   // maintain hexCr ≤ totalCr
    oilAndGrease_mgL: drift(previous.oilAndGrease_mgL, 0.8, 0, 200), // max 0.8 vs limit 10
    ammoniacalN_mgL: drift(previous.ammoniacalN_mgL, 2, 0, 500),     // max 2 vs limit 20
    dissolvedOxygen_mgL: drift(previous.dissolvedOxygen_mgL, 0.4, 0, 20), // max 0.4 vs limit 5
    flow_KLD: current.flow_KLD, // flow doesn't drift — it's a measured volume
  };
}

/** Apply scenario-specific modifications to a reading */
function applyScenario(
  reading: SensorReading,
  scenario: GenerationScenario,
  timestamp: Date,
  opts?: GenerationOptions,
): SensorReading {
  switch (scenario) {
    case 'tampering_flatline':
      return applyFlatline(reading, opts?.previousReading);

    case 'calibration_drift':
      return applyCalibrationDrift(reading, opts?.batchIndex ?? 0, opts?.batchSize ?? 15);

    case 'sensor_malfunction':
      return applySensorMalfunction(reading, opts?.batchIndex ?? 0);

    case 'strategic_timing': {
      const hour = getHour(timestamp);
      // SPCB inspectors visit 10am-4pm. Be compliant during those hours.
      const isDayShift = hour >= 9 && hour <= 17;
      if (isDayShift) {
        // Force compliant values
        return generateSensorReading(
          { ...getFacilityFromReading(reading), violationProbability: 0 } as FacilityConfig,
          { ...opts, scenario: 'compliant', timestamp },
        );
      }
      // Night shift: violate freely
      return reading;
    }

    case 'cetp_overload':
      return applyCetpOverload(reading);

    default:
      return reading;
  }
}

/** Flatline: all parameters locked to near-identical values (±1% variation) */
function applyFlatline(reading: SensorReading, previous?: SensorReading): SensorReading {
  if (!previous) return reading;
  // Lock all non-pH parameters to previous ±1% (CPCB catches <5% variation)
  const jitter = (v: number) => Math.round(v * (1 + (Math.random() - 0.5) * 0.01) * 100) / 100;
  return {
    ...reading,
    // pH excluded from flatline check per CPCB protocol — keep it natural
    BOD_mgL: jitter(previous.BOD_mgL),
    COD_mgL: Math.max(jitter(previous.BOD_mgL) + 5, jitter(previous.COD_mgL)), // maintain COD > BOD
    TSS_mgL: jitter(previous.TSS_mgL),
    temperature_C: jitter(previous.temperature_C),
    totalChromium_mgL: jitter(previous.totalChromium_mgL),
    hexChromium_mgL: Math.min(jitter(previous.totalChromium_mgL), jitter(previous.hexChromium_mgL)),
    oilAndGrease_mgL: jitter(previous.oilAndGrease_mgL),
    ammoniacalN_mgL: jitter(previous.ammoniacalN_mgL),
    dissolvedOxygen_mgL: jitter(previous.dissolvedOxygen_mgL),
    flow_KLD: jitter(previous.flow_KLD),
  };
}

/** Calibration drift: values slowly increase over the batch (sensor losing accuracy) */
function applyCalibrationDrift(reading: SensorReading, index: number, total: number): SensorReading {
  const driftFactor = 1 + (index / total) * 0.15; // up to 15% drift by end of batch
  return {
    ...reading,
    BOD_mgL: Math.round(reading.BOD_mgL * driftFactor * 100) / 100,
    COD_mgL: Math.max(
      Math.round(reading.BOD_mgL * driftFactor * 100) / 100 + 5,
      Math.round(reading.COD_mgL * driftFactor * 100) / 100,
    ),
    TSS_mgL: Math.round(reading.TSS_mgL * driftFactor * 100) / 100,
    totalChromium_mgL: Math.round(reading.totalChromium_mgL * driftFactor * 100) / 100,
  };
}

/** Sensor malfunction: sudden impossible jump at a random point in the batch */
function applySensorMalfunction(reading: SensorReading, index: number): SensorReading {
  // Malfunction happens at index 7 (middle of batch)
  if (index !== 7) return reading;
  return {
    ...reading,
    pH: rand(2.0, 3.0),            // sudden pH crash
    COD_mgL: rand(800, 1000),      // impossibly high COD spike
    BOD_mgL: reading.BOD_mgL,      // BOD doesn't spike instantly (it's a 3-day test proxy)
    sensorStatus: 'online',        // sensor still reports online (silent failure)
  };
}

/** CETP overload: all parameters elevated but not extreme — the CETP is struggling */
function applyCetpOverload(reading: SensorReading): SensorReading {
  const elevate = (v: number, factor: number) => Math.round(v * factor * 100) / 100;
  const elevatedBod = elevate(reading.BOD_mgL, 1.4);
  return {
    ...reading,
    BOD_mgL: elevatedBod,
    COD_mgL: Math.max(elevatedBod + 10, elevate(reading.COD_mgL, 1.3)),
    TSS_mgL: elevate(reading.TSS_mgL, 1.5),
    totalChromium_mgL: elevate(reading.totalChromium_mgL, 1.3),
    dissolvedOxygen_mgL: Math.max(0.3, Math.round(reading.dissolvedOxygen_mgL * 0.6 * 100) / 100),
  };
}

/** Pick sensor status based on scenario and position in batch */
function pickSensorStatus(
  scenario: GenerationScenario,
  batchIndex?: number,
): SensorReading['sensorStatus'] {
  if (scenario === 'sensor_malfunction' && batchIndex === 7) return 'online'; // silent failure

  // Small chance of non-online status in normal operation
  const roll = Math.random();
  if (roll < 0.02) return 'maintenance';
  if (roll < 0.04) return 'calibrating';
  if (roll < 0.06) return 'offline_queued';
  if (roll < 0.07) return 'reconnected_batch';
  return 'online';
}

/** Reconstruct a minimal FacilityConfig from a reading (for scenario recursion) */
function getFacilityFromReading(reading: SensorReading): Partial<FacilityConfig> {
  return {
    id: reading.facilityId,
    category: IndustryCategory.Tanneries, // default for scenario helper
    ctoDischargeMode: 'discharge',
    violationProbability: 0,
    ctoCustomLimits: null,
  };
}
