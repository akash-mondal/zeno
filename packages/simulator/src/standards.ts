// CPCB Schedule-VI General Discharge Standards (Environment Protection Rules, 1986)
// These are the DEFAULT thresholds — CTO-specific limits override these per facility.
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

// CPCB 17 Mandatory OCEMS Industry Categories
// Source: CPCB Directions under Water/Air Acts for 17 GPI categories
export enum IndustryCategory {
  PulpAndPaper = 'Pulp & Paper',
  Distillery = 'Distillery',
  Sugar = 'Sugar',
  Tanneries = 'Tanneries',
  ThermalPower = 'Thermal Power',
  Cement = 'Cement',
  OilRefineries = 'Oil Refineries',
  Fertilizer = 'Fertilizer',
  ChlorAlkali = 'Chlor-Alkali',
  DyeAndDyeIntermediates = 'Dye & Dye Intermediates',
  Pesticides = 'Pesticides',
  Pharma = 'Pharma',
  IronAndSteel = 'Iron & Steel',
  CopperSmelting = 'Copper Smelting',
  ZincSmelting = 'Zinc Smelting',
  Aluminium = 'Aluminium',
  Petrochemicals = 'Petrochemicals',
}

export type DischargeMode = 'discharge' | 'ZLD';

export interface CTOCustomLimits {
  BOD_mgL?: number;
  COD_mgL?: number;
  TSS_mgL?: number;
  totalChromium_mgL?: number;
  hexChromium_mgL?: number;
  oilAndGrease_mgL?: number;
  ammoniacalN_mgL?: number;
}

// -------------------------------------------------------------------
// Industry-Specific Effluent Profiles
// -------------------------------------------------------------------
// These represent TREATED effluent ranges (post-ETP/CETP output).
// Sources: CPCB CETP performance reports, NGT Kanpur tannery orders,
// CPCB GPI monitoring data, published research on Indian ETP output.
//
// Each profile defines:
//   - compliant range: typical values when ETP is working properly
//   - violation range: values when ETP is overloaded or poorly maintained
//   - problemParameters: parameters most likely to exceed limits
//   - typicalBodCodRatio: industry-characteristic BOD/COD ratio
//   - typicalFlow: discharge volume in KLD
// -------------------------------------------------------------------

export interface ParameterRange {
  min: number;
  max: number;
}

export interface IndustryProfile {
  category: IndustryCategory;
  compliant: {
    pH: ParameterRange;
    BOD_mgL: ParameterRange;
    COD_mgL: ParameterRange;
    TSS_mgL: ParameterRange;
    temperature_C: ParameterRange;
    totalChromium_mgL: ParameterRange;
    hexChromium_mgL: ParameterRange;
    oilAndGrease_mgL: ParameterRange;
    ammoniacalN_mgL: ParameterRange;
    dissolvedOxygen_mgL: ParameterRange;
    flow_KLD: ParameterRange;
  };
  violation: {
    pH: ParameterRange;
    BOD_mgL: ParameterRange;
    COD_mgL: ParameterRange;
    TSS_mgL: ParameterRange;
    temperature_C: ParameterRange;
    totalChromium_mgL: ParameterRange;
    hexChromium_mgL: ParameterRange;
    oilAndGrease_mgL: ParameterRange;
    ammoniacalN_mgL: ParameterRange;
    dissolvedOxygen_mgL: ParameterRange;
    flow_KLD: ParameterRange;
  };
  typicalBodCodRatio: ParameterRange; // min–max ratio
  problemParameters: string[];        // parameters most likely to violate
  typicalFlow: ParameterRange;        // KLD range for the industry
  zldMandated: boolean;
}

// Kanpur Jajmau CETP data (2023-2025):
//   Raw inlet: BOD 3600, COD 7200, Cr 270, TSS 3600 mg/L
//   CETP outlet: BOD 180-280, COD 300-500, Cr 2-7.2, TSS 80-200 mg/L
//   CETP designed for 9 MLD, operating >12 MLD (overloaded)
//   TDS consistently 5x above norms
const TANNERY_PROFILE: IndustryProfile = {
  category: IndustryCategory.Tanneries,
  compliant: {
    pH:                    { min: 7.0, max: 8.5 },    // Chrome tanning effluent is alkaline
    BOD_mgL:               { min: 15,  max: 28 },     // CETP output — rarely below 15
    COD_mgL:               { min: 80,  max: 230 },    // Even good CETP output is 80+
    TSS_mgL:               { min: 30,  max: 90 },     // Suspended solids from tanning
    temperature_C:         { min: 28,  max: 38 },     // Chrome processes are exothermic
    totalChromium_mgL:     { min: 0.3, max: 1.8 },    // Chrome recovery reduces but doesn't eliminate
    hexChromium_mgL:       { min: 0.01, max: 0.08 },  // Should be near zero after reduction
    oilAndGrease_mgL:      { min: 2,   max: 8 },      // Fat liquoring residues
    ammoniacalN_mgL:       { min: 10,  max: 40 },     // Protein decomposition
    dissolvedOxygen_mgL:   { min: 2,   max: 5 },      // Low DO typical of high-BOD effluent
    flow_KLD:              { min: 100, max: 500 },
  },
  violation: {
    pH:                    { min: 5.0, max: 6.0 },    // Acid wash discharge without neutralization
    BOD_mgL:               { min: 35,  max: 120 },    // CETP overload — Jajmau sees 280 mg/L
    COD_mgL:               { min: 280, max: 500 },    // Jajmau CETP outlet: 409 mg/L documented
    TSS_mgL:               { min: 110, max: 250 },    // Settling tank bypass
    temperature_C:         { min: 38,  max: 48 },     // Direct hot effluent discharge
    totalChromium_mgL:     { min: 2.5, max: 8.0 },    // Chrome recovery skipped
    hexChromium_mgL:       { min: 0.12, max: 0.4 },   // Incomplete Cr(VI) reduction
    oilAndGrease_mgL:      { min: 12,  max: 25 },     // Fat liquoring tank overflow
    ammoniacalN_mgL:       { min: 55,  max: 120 },    // Untreated protein waste
    dissolvedOxygen_mgL:   { min: 0.5, max: 2.0 },    // Near-anoxic from high organic load
    flow_KLD:              { min: 200, max: 800 },     // Over-capacity discharge
  },
  typicalBodCodRatio: { min: 0.08, max: 0.18 },  // Very low — recalcitrant chrome tanning waste (Jajmau data: BOD 17 / COD 240 = 0.07)
  problemParameters: ['COD_mgL', 'totalChromium_mgL', 'BOD_mgL', 'TSS_mgL'],
  typicalFlow: { min: 100, max: 500 },
  zldMandated: false,
};

// Distillery effluent — spent wash is among the most polluting industrial waste
// BOD 40,000-50,000 mg/L raw, COD 80,000-100,000 mg/L raw
// ZLD mandated by CPCB since 2014 for all distilleries
// When "treated" via incineration + MEE: should be zero discharge
// Violations = any liquid discharge whatsoever
const DISTILLERY_PROFILE: IndustryProfile = {
  category: IndustryCategory.Distillery,
  compliant: {
    pH:                    { min: 6.5, max: 7.5 },
    BOD_mgL:               { min: 0,   max: 5 },      // ZLD = no discharge ideally
    COD_mgL:               { min: 0,   max: 10 },
    TSS_mgL:               { min: 0,   max: 5 },
    temperature_C:         { min: 25,  max: 35 },
    totalChromium_mgL:     { min: 0,   max: 0.01 },
    hexChromium_mgL:       { min: 0,   max: 0.001 },
    oilAndGrease_mgL:      { min: 0,   max: 1 },
    ammoniacalN_mgL:       { min: 0,   max: 5 },
    dissolvedOxygen_mgL:   { min: 4,   max: 7 },
    flow_KLD:              { min: 0,   max: 0 },       // ZLD = zero flow
  },
  violation: {
    pH:                    { min: 3.5, max: 5.0 },     // Spent wash is highly acidic
    BOD_mgL:               { min: 200, max: 390 },     // Partially treated spent wash (capped at analyzer 400)
    COD_mgL:               { min: 500, max: 950 },     // Extreme organic load (capped at analyzer 1000)
    TSS_mgL:               { min: 100, max: 400 },
    temperature_C:         { min: 40,  max: 55 },      // Hot process water
    totalChromium_mgL:     { min: 0,   max: 0.05 },
    hexChromium_mgL:       { min: 0,   max: 0.005 },
    oilAndGrease_mgL:      { min: 5,   max: 15 },
    ammoniacalN_mgL:       { min: 60,  max: 200 },     // High nitrogen from molasses
    dissolvedOxygen_mgL:   { min: 0.2, max: 1.5 },
    flow_KLD:              { min: 50,  max: 300 },     // Any discharge = ZLD violation
  },
  typicalBodCodRatio: { min: 0.20, max: 0.35 },  // Post-biomethanation, melanoidins reduce ratio
  problemParameters: ['flow_KLD', 'BOD_mgL', 'COD_mgL', 'pH'],
  typicalFlow: { min: 0, max: 0 },  // ZLD target
  zldMandated: true,
};

// Pharma ETP output — moderate pollutant levels, API residues are the concern
// CPCB limits for pharma: BOD 100, COD 250 (same as general)
// Problem: high-strength API wash waters cause periodic spikes
const PHARMA_PROFILE: IndustryProfile = {
  category: IndustryCategory.Pharma,
  compliant: {
    pH:                    { min: 6.5, max: 8.0 },
    BOD_mgL:               { min: 10,  max: 25 },
    COD_mgL:               { min: 60,  max: 200 },
    TSS_mgL:               { min: 15,  max: 70 },
    temperature_C:         { min: 25,  max: 35 },
    totalChromium_mgL:     { min: 0,   max: 0.05 },    // Not a pharma issue
    hexChromium_mgL:       { min: 0,   max: 0.005 },
    oilAndGrease_mgL:      { min: 1,   max: 6 },
    ammoniacalN_mgL:       { min: 5,   max: 30 },
    dissolvedOxygen_mgL:   { min: 3,   max: 6 },
    flow_KLD:              { min: 50,  max: 200 },
  },
  violation: {
    pH:                    { min: 4.0, max: 5.5 },     // Acid API wash discharge
    BOD_mgL:               { min: 35,  max: 80 },
    COD_mgL:               { min: 280, max: 600 },     // API batch discharge spike
    TSS_mgL:               { min: 110, max: 200 },
    temperature_C:         { min: 35,  max: 45 },
    totalChromium_mgL:     { min: 0,   max: 0.1 },
    hexChromium_mgL:       { min: 0,   max: 0.01 },
    oilAndGrease_mgL:      { min: 12,  max: 20 },
    ammoniacalN_mgL:       { min: 55,  max: 100 },
    dissolvedOxygen_mgL:   { min: 1,   max: 3 },
    flow_KLD:              { min: 100, max: 400 },
  },
  typicalBodCodRatio: { min: 0.15, max: 0.25 },  // Low biodegradability due to API residues and solvents
  problemParameters: ['COD_mgL', 'pH', 'ammoniacalN_mgL'],
  typicalFlow: { min: 50, max: 200 },
  zldMandated: false,
};

// Pulp & Paper — high BOD/COD from lignin and cellulose, dark colored effluent
// Black liquor is the primary pollutant (raw COD 10,000-40,000 mg/L)
const PULP_AND_PAPER_PROFILE: IndustryProfile = {
  category: IndustryCategory.PulpAndPaper,
  compliant: {
    pH:                    { min: 7.0, max: 8.5 },     // Alkaline from pulping process
    BOD_mgL:               { min: 12,  max: 27 },
    COD_mgL:               { min: 60,  max: 220 },
    TSS_mgL:               { min: 20,  max: 80 },
    temperature_C:         { min: 30,  max: 40 },      // Hot process water
    totalChromium_mgL:     { min: 0,   max: 0.02 },
    hexChromium_mgL:       { min: 0,   max: 0.002 },
    oilAndGrease_mgL:      { min: 1,   max: 5 },
    ammoniacalN_mgL:       { min: 3,   max: 20 },
    dissolvedOxygen_mgL:   { min: 2.5, max: 5 },
    flow_KLD:              { min: 500, max: 5000 },    // Paper mills use massive water volumes
  },
  violation: {
    pH:                    { min: 9.5, max: 11.0 },    // Black liquor leakage — highly alkaline
    BOD_mgL:               { min: 35,  max: 150 },
    COD_mgL:               { min: 280, max: 700 },     // Lignin carryover
    TSS_mgL:               { min: 120, max: 300 },     // Fiber carryover
    temperature_C:         { min: 40,  max: 50 },
    totalChromium_mgL:     { min: 0,   max: 0.05 },
    hexChromium_mgL:       { min: 0,   max: 0.005 },
    oilAndGrease_mgL:      { min: 12,  max: 25 },
    ammoniacalN_mgL:       { min: 55,  max: 80 },
    dissolvedOxygen_mgL:   { min: 0.5, max: 2 },
    flow_KLD:              { min: 3000, max: 10000 },
  },
  typicalBodCodRatio: { min: 0.15, max: 0.22 },   // Low — lignin and chloro-organics are recalcitrant
  problemParameters: ['COD_mgL', 'BOD_mgL', 'TSS_mgL', 'pH'],
  typicalFlow: { min: 500, max: 5000 },
  zldMandated: false,
};

// Dye & Dye Intermediates — high color, complex organics, heavy metals
// Raw effluent: COD 5,000-20,000 mg/L, highly colored, pH variable
const DYE_PROFILE: IndustryProfile = {
  category: IndustryCategory.DyeAndDyeIntermediates,
  compliant: {
    pH:                    { min: 6.5, max: 8.5 },
    BOD_mgL:               { min: 10,  max: 25 },
    COD_mgL:               { min: 80,  max: 230 },
    TSS_mgL:               { min: 20,  max: 80 },
    temperature_C:         { min: 28,  max: 38 },
    totalChromium_mgL:     { min: 0.1, max: 1.5 },     // Chrome dyes
    hexChromium_mgL:       { min: 0.01, max: 0.07 },
    oilAndGrease_mgL:      { min: 2,   max: 8 },
    ammoniacalN_mgL:       { min: 8,   max: 35 },
    dissolvedOxygen_mgL:   { min: 2,   max: 5 },
    flow_KLD:              { min: 50,  max: 300 },
  },
  violation: {
    pH:                    { min: 2.5, max: 4.5 },     // Acid dye bath discharge
    BOD_mgL:               { min: 35,  max: 100 },
    COD_mgL:               { min: 300, max: 800 },     // Recalcitrant organics
    TSS_mgL:               { min: 120, max: 250 },
    temperature_C:         { min: 38,  max: 50 },
    totalChromium_mgL:     { min: 2.5, max: 6.0 },     // Chrome dye discharge
    hexChromium_mgL:       { min: 0.12, max: 0.3 },
    oilAndGrease_mgL:      { min: 12,  max: 20 },
    ammoniacalN_mgL:       { min: 55,  max: 100 },
    dissolvedOxygen_mgL:   { min: 0.5, max: 2 },
    flow_KLD:              { min: 200, max: 600 },
  },
  typicalBodCodRatio: { min: 0.1, max: 0.25 },   // Very low — recalcitrant organics
  problemParameters: ['COD_mgL', 'pH', 'totalChromium_mgL'],
  typicalFlow: { min: 50, max: 300 },
  zldMandated: false,
};

// Sugar — seasonal operation, moderate pollution, molasses-based BOD
const SUGAR_PROFILE: IndustryProfile = {
  category: IndustryCategory.Sugar,
  compliant: {
    pH:                    { min: 6.5, max: 7.5 },
    BOD_mgL:               { min: 10,  max: 25 },
    COD_mgL:               { min: 40,  max: 180 },
    TSS_mgL:               { min: 15,  max: 70 },
    temperature_C:         { min: 28,  max: 38 },
    totalChromium_mgL:     { min: 0,   max: 0.01 },
    hexChromium_mgL:       { min: 0,   max: 0.001 },
    oilAndGrease_mgL:      { min: 1,   max: 5 },
    ammoniacalN_mgL:       { min: 5,   max: 25 },
    dissolvedOxygen_mgL:   { min: 3,   max: 6 },
    flow_KLD:              { min: 200, max: 1000 },
  },
  violation: {
    pH:                    { min: 4.5, max: 5.5 },     // Molasses fermentation
    BOD_mgL:               { min: 40,  max: 200 },     // Molasses spillover
    COD_mgL:               { min: 280, max: 600 },
    TSS_mgL:               { min: 110, max: 250 },
    temperature_C:         { min: 38,  max: 48 },
    totalChromium_mgL:     { min: 0,   max: 0.02 },
    hexChromium_mgL:       { min: 0,   max: 0.002 },
    oilAndGrease_mgL:      { min: 12,  max: 20 },
    ammoniacalN_mgL:       { min: 55,  max: 100 },
    dissolvedOxygen_mgL:   { min: 1,   max: 3 },
    flow_KLD:              { min: 800, max: 3000 },
  },
  typicalBodCodRatio: { min: 0.25, max: 0.40 },   // Relatively biodegradable (sugars/molasses)
  problemParameters: ['BOD_mgL', 'COD_mgL'],
  typicalFlow: { min: 200, max: 1000 },
  zldMandated: false,
};

// Default profile for industries without specific data
const DEFAULT_PROFILE: IndustryProfile = {
  category: IndustryCategory.ThermalPower, // placeholder
  compliant: {
    pH:                    { min: 6.5, max: 8.5 },
    BOD_mgL:               { min: 8,   max: 25 },
    COD_mgL:               { min: 50,  max: 200 },
    TSS_mgL:               { min: 20,  max: 80 },
    temperature_C:         { min: 25,  max: 35 },
    totalChromium_mgL:     { min: 0,   max: 0.05 },
    hexChromium_mgL:       { min: 0,   max: 0.005 },
    oilAndGrease_mgL:      { min: 1,   max: 6 },
    ammoniacalN_mgL:       { min: 5,   max: 30 },
    dissolvedOxygen_mgL:   { min: 3,   max: 6 },
    flow_KLD:              { min: 100, max: 500 },
  },
  violation: {
    pH:                    { min: 4.5, max: 5.5 },
    BOD_mgL:               { min: 35,  max: 80 },
    COD_mgL:               { min: 280, max: 500 },
    TSS_mgL:               { min: 110, max: 200 },
    temperature_C:         { min: 38,  max: 48 },
    totalChromium_mgL:     { min: 0,   max: 0.1 },
    hexChromium_mgL:       { min: 0,   max: 0.01 },
    oilAndGrease_mgL:      { min: 12,  max: 20 },
    ammoniacalN_mgL:       { min: 55,  max: 100 },
    dissolvedOxygen_mgL:   { min: 1,   max: 3 },
    flow_KLD:              { min: 300, max: 800 },
  },
  typicalBodCodRatio: { min: 0.25, max: 0.5 },
  problemParameters: ['COD_mgL', 'BOD_mgL'],
  typicalFlow: { min: 100, max: 500 },
  zldMandated: false,
};

// Lookup table: IndustryCategory → IndustryProfile
export const INDUSTRY_PROFILES: Record<IndustryCategory, IndustryProfile> = {
  [IndustryCategory.Tanneries]:              TANNERY_PROFILE,
  [IndustryCategory.Distillery]:             DISTILLERY_PROFILE,
  [IndustryCategory.Pharma]:                 PHARMA_PROFILE,
  [IndustryCategory.PulpAndPaper]:           PULP_AND_PAPER_PROFILE,
  [IndustryCategory.DyeAndDyeIntermediates]: DYE_PROFILE,
  [IndustryCategory.Sugar]:                  SUGAR_PROFILE,
  // All others use default profile
  [IndustryCategory.ThermalPower]:           { ...DEFAULT_PROFILE, category: IndustryCategory.ThermalPower },
  [IndustryCategory.Cement]:                 { ...DEFAULT_PROFILE, category: IndustryCategory.Cement },
  [IndustryCategory.OilRefineries]:          { ...DEFAULT_PROFILE, category: IndustryCategory.OilRefineries },
  [IndustryCategory.Fertilizer]:             { ...DEFAULT_PROFILE, category: IndustryCategory.Fertilizer },
  [IndustryCategory.ChlorAlkali]:            { ...DEFAULT_PROFILE, category: IndustryCategory.ChlorAlkali },
  [IndustryCategory.Pesticides]:             { ...DEFAULT_PROFILE, category: IndustryCategory.Pesticides },
  [IndustryCategory.IronAndSteel]:           { ...DEFAULT_PROFILE, category: IndustryCategory.IronAndSteel },
  [IndustryCategory.CopperSmelting]:         { ...DEFAULT_PROFILE, category: IndustryCategory.CopperSmelting },
  [IndustryCategory.ZincSmelting]:           { ...DEFAULT_PROFILE, category: IndustryCategory.ZincSmelting },
  [IndustryCategory.Aluminium]:              { ...DEFAULT_PROFILE, category: IndustryCategory.Aluminium },
  [IndustryCategory.Petrochemicals]:         { ...DEFAULT_PROFILE, category: IndustryCategory.Petrochemicals },
};

// -------------------------------------------------------------------
// Generation Scenarios
// -------------------------------------------------------------------
// Named scenarios for demo purposes. Each produces a specific pattern
// that regulators, judges, and the AI agent can identify.

export type GenerationScenario =
  | 'normal'               // Mixed compliant/violation based on facility probability
  | 'compliant'            // All readings within limits
  | 'chronic_violator'     // Consistently exceeding 2-3 parameters
  | 'tampering_flatline'   // Suspiciously constant values (CPCB auto-rejects)
  | 'calibration_drift'    // Values slowly drifting over hours
  | 'zld_breach'           // ZLD facility with non-zero discharge
  | 'sensor_malfunction'   // Sudden impossible jumps between readings
  | 'strategic_timing'     // Compliant during day, violating at night
  | 'cetp_overload';       // CETP overloaded — all parameters elevated

// Ambient temperature baseline for diurnal cycle (Kanpur, March)
export const AMBIENT_TEMP_BASELINE = 28; // degrees C
export const AMBIENT_TEMP_AMPLITUDE = 8; // peak-to-trough swing

// Diurnal pH variation amplitude (pH rises slightly at night due to reduced microbial activity)
export const PH_DIURNAL_AMPLITUDE = 0.3;
