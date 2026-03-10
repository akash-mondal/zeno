/**
 * ComplianceChecker Unit Tests
 *
 * Tests run on local Hardhat network (fast, no HBAR needed).
 * HTS precompile tests are skipped locally — tested in e2e-test.ts on testnet.
 *
 * Run: npx hardhat test
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ComplianceChecker, PenaltyCalculator } from '../typechain-types';

describe('ComplianceChecker', function () {
  let checker: ComplianceChecker;
  let penalty: PenaltyCalculator;
  let owner: any;
  let other: any;

  // Default thresholds (Schedule-VI)
  const defaultThresholds = {
    pH_min: 55,
    pH_max: 90,
    BOD: 300,
    COD: 2500,
    TSS: 1000,
    tempAboveAmbient: 50,
    totalCr: 20,
    hexCr: 1,
    oilGrease: 100,
    NH3N: 500,
  };

  // Compliant reading
  const compliantReading = {
    pH: 72,             // 7.2
    BOD: 180,           // 18.0
    COD: 1500,          // 150.0
    TSS: 650,           // 65.0
    tempAboveAmbient: 30,
    totalCr: 12,
    hexCr: 0,
    oilGrease: 50,
    NH3N: 200,
    flow_KLD: 100,
  };

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const CheckerFactory = await ethers.getContractFactory('ComplianceChecker');
    checker = await CheckerFactory.deploy();
    await checker.waitForDeployment();

    const PenaltyFactory = await ethers.getContractFactory('PenaltyCalculator');
    penalty = await PenaltyFactory.deploy(await checker.getAddress());
    await penalty.waitForDeployment();
  });

  // ============================================================
  // Deployment
  // ============================================================

  describe('Deployment', function () {
    it('should set deployer as owner', async function () {
      expect(await checker.owner()).to.equal(owner.address);
    });

    it('should set correct Schedule-VI defaults', async function () {
      const defaults = await checker.getDefaultThresholds();
      expect(defaults.pH_min).to.equal(55);
      expect(defaults.pH_max).to.equal(90);
      expect(defaults.BOD).to.equal(300);
      expect(defaults.COD).to.equal(2500);
      expect(defaults.TSS).to.equal(1000);
      expect(defaults.totalCr).to.equal(20);
      expect(defaults.hexCr).to.equal(1);
    });
  });

  // ============================================================
  // Facility Registration
  // ============================================================

  describe('Facility Registration', function () {
    it('should register a facility with Schedule-VI defaults', async function () {
      await checker.registerFacility('KNP-TAN-001', 'Tanneries', false, false, defaultThresholds);
      const fac = await checker.getFacility('KNP-TAN-001');
      expect(fac.registered).to.be.true;
      expect(fac.facilityId).to.equal('KNP-TAN-001');
      expect(fac.industryCategory).to.equal('Tanneries');
      expect(fac.isZLD).to.be.false;
    });

    it('should register a ZLD facility', async function () {
      await checker.registerFacility('KNP-DST-001', 'Distillery', true, false, defaultThresholds);
      const fac = await checker.getFacility('KNP-DST-001');
      expect(fac.isZLD).to.be.true;
    });

    it('should register with CTO override limits', async function () {
      const strictCTO = { ...defaultThresholds, BOD: 200, COD: 1500 };
      await checker.registerFacility('KNP-TAN-004', 'Tanneries', false, true, strictCTO);
      const fac = await checker.getFacility('KNP-TAN-004');
      expect(fac.hasCTOOverride).to.be.true;
      expect(fac.thresholds.BOD).to.equal(200);
      expect(fac.thresholds.COD).to.equal(1500);
    });

    it('should reject duplicate registration', async function () {
      await checker.registerFacility('KNP-TAN-001', 'Tanneries', false, false, defaultThresholds);
      await expect(
        checker.registerFacility('KNP-TAN-001', 'Tanneries', false, false, defaultThresholds)
      ).to.be.revertedWith('Already registered');
    });

    it('should reject registration from non-registrar', async function () {
      await expect(
        checker.connect(other).registerFacility('TEST-001', 'Tanneries', false, false, defaultThresholds)
      ).to.be.revertedWith('Not registrar');
    });

    it('should track facility count', async function () {
      expect(await checker.getFacilityCount()).to.equal(0);
      await checker.registerFacility('FAC-001', 'Tanneries', false, false, defaultThresholds);
      await checker.registerFacility('FAC-002', 'Pharma', false, false, defaultThresholds);
      expect(await checker.getFacilityCount()).to.equal(2);
    });

    it('should emit FacilityRegistered event', async function () {
      const key = ethers.keccak256(ethers.toUtf8Bytes('KNP-TAN-001'));
      await expect(checker.registerFacility('KNP-TAN-001', 'Tanneries', false, false, defaultThresholds))
        .to.emit(checker, 'FacilityRegistered')
        .withArgs(key, 'KNP-TAN-001', 'Tanneries', false, false);
    });
  });

  // ============================================================
  // Compliance Checking
  // ============================================================

  describe('Compliance Checking', function () {
    beforeEach(async function () {
      await checker.registerFacility('KNP-TAN-001', 'Tanneries', false, false, defaultThresholds);
    });

    it('should pass a fully compliant reading', async function () {
      const result = await checker.checkCompliance('KNP-TAN-001', compliantReading);
      expect(result.overallCompliant).to.be.true;
      expect(result.violationCount).to.equal(0);
    });

    it('should detect pH below minimum', async function () {
      const reading = { ...compliantReading, pH: 45 }; // 4.5 < 5.5
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.pH_compliant).to.be.false;
      expect(result.overallCompliant).to.be.false;
    });

    it('should detect pH above maximum', async function () {
      const reading = { ...compliantReading, pH: 95 }; // 9.5 > 9.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.pH_compliant).to.be.false;
    });

    it('should detect BOD exceedance', async function () {
      const reading = { ...compliantReading, BOD: 450 }; // 45.0 > 30.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.BOD_compliant).to.be.false;
    });

    it('should detect COD exceedance', async function () {
      const reading = { ...compliantReading, COD: 3500 }; // 350.0 > 250.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.COD_compliant).to.be.false;
    });

    it('should detect TSS exceedance', async function () {
      const reading = { ...compliantReading, TSS: 1200 }; // 120.0 > 100.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.TSS_compliant).to.be.false;
    });

    it('should detect temperature exceedance', async function () {
      const reading = { ...compliantReading, tempAboveAmbient: 60 }; // 6.0 > 5.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.temp_compliant).to.be.false;
    });

    it('should detect Total Chromium exceedance', async function () {
      const reading = { ...compliantReading, totalCr: 35 }; // 3.5 > 2.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.totalCr_compliant).to.be.false;
    });

    it('should detect Hexavalent Chromium exceedance', async function () {
      const reading = { ...compliantReading, hexCr: 2 }; // 0.2 > 0.1
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.hexCr_compliant).to.be.false;
    });

    it('should detect Oil & Grease exceedance', async function () {
      const reading = { ...compliantReading, oilGrease: 150 }; // 15.0 > 10.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.oilGrease_compliant).to.be.false;
    });

    it('should detect Ammoniacal Nitrogen exceedance', async function () {
      const reading = { ...compliantReading, NH3N: 600 }; // 60.0 > 50.0
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.NH3N_compliant).to.be.false;
    });

    it('should count multiple violations correctly', async function () {
      const reading = {
        ...compliantReading,
        pH: 45,       // violation
        BOD: 450,     // violation
        COD: 3500,    // violation
        totalCr: 35,  // violation
      };
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.violationCount).to.equal(4);
      expect(result.overallCompliant).to.be.false;
    });

    it('should pass reading at exact threshold', async function () {
      const reading = {
        ...compliantReading,
        pH: 55,       // exactly 5.5 (min)
        BOD: 300,     // exactly 30.0
        COD: 2500,    // exactly 250.0
        TSS: 1000,    // exactly 100.0
      };
      const result = await checker.checkCompliance('KNP-TAN-001', reading);
      expect(result.overallCompliant).to.be.true;
    });

    it('should reject unregistered facility', async function () {
      await expect(
        checker.checkCompliance('UNKNOWN-001', compliantReading)
      ).to.be.revertedWith('Facility not registered');
    });
  });

  // ============================================================
  // CTO Override
  // ============================================================

  describe('CTO Override', function () {
    beforeEach(async function () {
      // Standard facility
      await checker.registerFacility('STD-001', 'Tanneries', false, false, defaultThresholds);
      // Strict CTO facility
      const strictCTO = { ...defaultThresholds, BOD: 200, COD: 1500, totalCr: 10 };
      await checker.registerFacility('CTO-001', 'Tanneries', false, true, strictCTO);
    });

    it('should apply stricter CTO limits', async function () {
      const reading = { ...compliantReading, BOD: 250 }; // 25.0 — passes default (30) but fails CTO (20)

      const resultStd = await checker.checkCompliance('STD-001', reading);
      expect(resultStd.BOD_compliant).to.be.true;

      const resultCTO = await checker.checkCompliance('CTO-001', reading);
      expect(resultCTO.BOD_compliant).to.be.false;
    });

    it('should apply CTO COD limit', async function () {
      const reading = { ...compliantReading, COD: 1800 }; // 180.0 — passes default (250) but fails CTO (150)

      const resultStd = await checker.checkCompliance('STD-001', reading);
      expect(resultStd.COD_compliant).to.be.true;

      const resultCTO = await checker.checkCompliance('CTO-001', reading);
      expect(resultCTO.COD_compliant).to.be.false;
    });
  });

  // ============================================================
  // ZLD Enforcement
  // ============================================================

  describe('ZLD Enforcement', function () {
    beforeEach(async function () {
      await checker.registerFacility('ZLD-001', 'Distillery', true, false, defaultThresholds);
    });

    it('should fail ZLD facility with any flow', async function () {
      const reading = { ...compliantReading, flow_KLD: 5 };
      const result = await checker.checkCompliance('ZLD-001', reading);
      expect(result.overallCompliant).to.be.false;
      expect(result.zld_compliant).to.be.false;
      expect(result.violationCount).to.equal(1);
    });

    it('should pass ZLD facility with zero flow', async function () {
      const reading = { ...compliantReading, flow_KLD: 0 };
      const result = await checker.checkCompliance('ZLD-001', reading);
      expect(result.overallCompliant).to.be.true;
      expect(result.zld_compliant).to.be.true;
    });

    it('should skip parameter checks when ZLD is violated', async function () {
      // Even with terrible parameters, ZLD violation takes precedence
      const reading = {
        pH: 20, BOD: 9000, COD: 9000, TSS: 9000,
        tempAboveAmbient: 100, totalCr: 100, hexCr: 100,
        oilGrease: 500, NH3N: 1000, flow_KLD: 10,
      };
      const result = await checker.checkCompliance('ZLD-001', reading);
      expect(result.violationCount).to.equal(1); // Only ZLD counted
      expect(result.pH_compliant).to.be.true; // Skipped — set to true
    });
  });

  // ============================================================
  // Compliance Recording
  // ============================================================

  describe('Compliance Recording', function () {
    beforeEach(async function () {
      await checker.registerFacility('REC-001', 'Tanneries', false, false, defaultThresholds);
    });

    it('should record compliant evaluation', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      await checker.recordCompliance('REC-001', hash, true, 0, 0, 'hcs-msg-001');

      const stats = await checker.getFacilityStats('REC-001');
      expect(stats.totalRecords).to.equal(1);
      expect(stats.totalViolations).to.equal(0);
      expect(stats.complianceRate).to.equal(10000); // 100.00%
    });

    it('should record violation and update stats', async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes('eval-002'));

      await checker.recordCompliance('REC-001', hash1, true, 0, 0, 'msg-001');
      await checker.recordCompliance('REC-001', hash2, false, 3, 1, 'msg-002');

      const stats = await checker.getFacilityStats('REC-001');
      expect(stats.totalRecords).to.equal(2);
      expect(stats.totalViolations).to.equal(1);
      expect(stats.complianceRate).to.equal(5000); // 50.00%
    });

    it('should emit ComplianceEvaluated event', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      const key = ethers.keccak256(ethers.toUtf8Bytes('REC-001'));

      await expect(checker.recordCompliance('REC-001', hash, false, 2, 1, 'msg-001'))
        .to.emit(checker, 'ComplianceEvaluated')
        .withArgs(key, false, 2, 1, hash, 0);
    });

    it('should reject from non-submitter', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      await expect(
        checker.connect(other).recordCompliance('REC-001', hash, true, 0, 0, 'msg-001')
      ).to.be.revertedWith('Not submitter');
    });

    it('should reject for unregistered facility', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      await expect(
        checker.recordCompliance('UNKNOWN-001', hash, true, 0, 0, 'msg-001')
      ).to.be.revertedWith('Facility not registered');
    });
  });

  // ============================================================
  // Access Control
  // ============================================================

  describe('Access Control', function () {
    it('should grant and revoke registrar role', async function () {
      await checker.grantRegistrar(other.address);

      // Other can now register
      await checker.connect(other).registerFacility('FAC-001', 'Pharma', false, false, defaultThresholds);
      const fac = await checker.getFacility('FAC-001');
      expect(fac.registered).to.be.true;

      // Revoke
      await checker.revokeRegistrar(other.address);
      await expect(
        checker.connect(other).registerFacility('FAC-002', 'Pharma', false, false, defaultThresholds)
      ).to.be.revertedWith('Not registrar');
    });

    it('should grant and revoke submitter role', async function () {
      await checker.registerFacility('FAC-001', 'Pharma', false, false, defaultThresholds);

      await checker.grantSubmitter(other.address);
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eval-001'));
      await checker.connect(other).recordCompliance('FAC-001', hash, true, 0, 0, 'msg-001');

      await checker.revokeSubmitter(other.address);
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes('eval-002'));
      await expect(
        checker.connect(other).recordCompliance('FAC-001', hash2, true, 0, 0, 'msg-002')
      ).to.be.revertedWith('Not submitter');
    });

    it('should only allow owner to manage roles', async function () {
      await expect(
        checker.connect(other).grantRegistrar(other.address)
      ).to.be.revertedWith('Not owner');
    });
  });
});

// ============================================================
// PenaltyCalculator Tests
// ============================================================

describe('PenaltyCalculator', function () {
  let checker: ComplianceChecker;
  let penalty: PenaltyCalculator;

  const noViolation = {
    pH_violated: false, BOD_violated: false, COD_violated: false,
    TSS_violated: false, temp_violated: false, totalCr_violated: false,
    hexCr_violated: false, oilGrease_violated: false, NH3N_violated: false,
    pH_deviation: 0, BOD_deviation: 0, COD_deviation: 0,
    TSS_deviation: 0, temp_deviation: 0, totalCr_deviation: 0,
    hexCr_deviation: 0, oilGrease_deviation: 0, NH3N_deviation: 0,
  };

  beforeEach(async function () {
    const CheckerFactory = await ethers.getContractFactory('ComplianceChecker');
    checker = await CheckerFactory.deploy();
    await checker.waitForDeployment();

    const PenaltyFactory = await ethers.getContractFactory('PenaltyCalculator');
    penalty = await PenaltyFactory.deploy(await checker.getAddress());
    await penalty.waitForDeployment();
  });

  it('should return zero score for no violations', async function () {
    const result = await penalty.calculatePenalty(noViolation, 0);
    expect(result.score).to.equal(0);
    expect(result.tier).to.equal(0); // NONE
  });

  it('should weight Hex Cr highest (200/1000)', async function () {
    const hexCrOnly = { ...noViolation, hexCr_violated: true, hexCr_deviation: 150 };
    const codOnly = { ...noViolation, COD_violated: true, COD_deviation: 150 };

    const hexResult = await penalty.calculatePenalty(hexCrOnly, 0);
    const codResult = await penalty.calculatePenalty(codOnly, 0);

    expect(hexResult.score).to.be.greaterThan(codResult.score);
  });

  it('should apply repeat offender multipliers', async function () {
    const input = { ...noViolation, COD_violated: true, COD_deviation: 500 };

    const first = await penalty.calculatePenalty(input, 0);
    const repeat3 = await penalty.calculatePenalty(input, 5);
    const repeat10 = await penalty.calculatePenalty(input, 12);
    const repeat25 = await penalty.calculatePenalty(input, 30);

    expect(first.multiplier).to.equal(1000);    // 1.0×
    expect(repeat3.multiplier).to.equal(1500);   // 1.5×
    expect(repeat10.multiplier).to.equal(2000);  // 2.0×
    expect(repeat25.multiplier).to.equal(3000);  // 3.0×
  });

  it('should escalate severity with deviation', async function () {
    // Small deviation
    const small = { ...noViolation, COD_violated: true, COD_deviation: 50 };
    const resultSmall = await penalty.calculatePenalty(small, 0);

    // Large deviation
    const large = { ...noViolation, COD_violated: true, COD_deviation: 1200 };
    const resultLarge = await penalty.calculatePenalty(large, 0);

    expect(resultLarge.score).to.be.greaterThan(resultSmall.score);
  });

  it('should classify penalty tiers correctly', async function () {
    // No violations
    expect(await penalty.getTierName(0)).to.equal('NONE');

    // Small score
    const small = { ...noViolation, temp_violated: true, temp_deviation: 50 };
    const r1 = await penalty.calculatePenalty(small, 0);
    expect(await penalty.getTierName(r1.tier)).to.equal('WARNING');

    // Multi-parameter chronic
    const severe = {
      ...noViolation,
      pH_violated: true, pH_deviation: 500,
      BOD_violated: true, BOD_deviation: 800,
      COD_violated: true, COD_deviation: 600,
      TSS_violated: true, TSS_deviation: 400,
      totalCr_violated: true, totalCr_deviation: 1000,
      hexCr_violated: true, hexCr_deviation: 1200,
    };
    const r3 = await penalty.calculatePenalty(severe, 30); // 3.0× multiplier
    expect(await penalty.getTierName(r3.tier)).to.equal('CRITICAL');
  });
});
