// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title PenaltyCalculator — Graduated Penalty Engine
 * @notice Calculates penalty scores based on violation severity, parameter weights,
 *         and repeat offender multipliers.
 *
 * Based on CPCB August 2025 Online Automated Alerts Generation Protocol:
 *   - Parameter weights reflect environmental impact severity
 *   - Repeat offenders face escalating multipliers
 *   - Penalty tiers map to SPCB enforcement actions
 *
 * Parameter Weight Rationale (from CPCB environmental impact assessment):
 *   - Hexavalent Chromium (20%): Carcinogenic, most toxic parameter
 *   - Total Chromium (15%): Heavy metal bioaccumulation
 *   - COD (15%): Primary organic load indicator
 *   - BOD (12%): Biodegradable organic load
 *   - TSS (10%): Sediment and particulate pollution
 *   - pH (10%): Aquatic ecosystem pH sensitivity
 *   - Oil & Grease (8%): Surface film, oxygen transfer barrier
 *   - Ammoniacal N (5%): Nutrient loading, eutrophication
 *   - Temperature (5%): Thermal pollution impact
 */
contract PenaltyCalculator {

    // ============================================================
    // Access Control
    // ============================================================

    address public owner;
    address public complianceChecker;  // authorized caller

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || msg.sender == complianceChecker,
            "Not authorized"
        );
        _;
    }

    // ============================================================
    // Parameter Weights (sum = 1000, i.e., basis points)
    // ============================================================

    uint16 public constant WEIGHT_PH = 100;          // 10%
    uint16 public constant WEIGHT_BOD = 120;          // 12%
    uint16 public constant WEIGHT_COD = 150;          // 15%
    uint16 public constant WEIGHT_TSS = 100;          // 10%
    uint16 public constant WEIGHT_TEMP = 50;          // 5%
    uint16 public constant WEIGHT_TOTAL_CR = 150;     // 15%
    uint16 public constant WEIGHT_HEX_CR = 200;       // 20%
    uint16 public constant WEIGHT_OIL_GREASE = 80;    // 8%
    uint16 public constant WEIGHT_NH3N = 50;          // 5%
    // Total: 1000 basis points = 100%

    // ============================================================
    // Repeat Offender Multipliers
    // ============================================================

    // Violations in last 30 days → multiplier (basis points)
    uint16 public constant MULTIPLIER_FIRST = 1000;     // 1.0× (first offense)
    uint16 public constant MULTIPLIER_REPEAT_3 = 1500;  // 1.5× (3+ violations)
    uint16 public constant MULTIPLIER_REPEAT_10 = 2000; // 2.0× (10+ violations)
    uint16 public constant MULTIPLIER_REPEAT_25 = 3000; // 3.0× (25+ violations)

    // ============================================================
    // Penalty Tiers
    // ============================================================

    enum PenaltyTier {
        NONE,       // No violation
        WARNING,    // < 500 points — SPCB warning notice
        MODERATE,   // 500-1500 — Show cause notice + remediation timeline
        SEVERE,     // 1500-3000 — Closure direction + NGT referral
        CRITICAL    // > 3000 — Immediate closure + criminal prosecution referral
    }

    // ============================================================
    // Penalty Records
    // ============================================================

    struct PenaltyRecord {
        bytes32 facilityKey;
        uint256 penaltyScore;
        PenaltyTier tier;
        uint16 repeatMultiplier;
        uint40 timestamp;
        uint8 violatingParameterCount;
    }

    PenaltyRecord[] public penaltyRecords;
    mapping(bytes32 => uint256) public facilityPenaltyCount;

    // ============================================================
    // Events
    // ============================================================

    event PenaltyCalculated(
        bytes32 indexed facilityKey,
        uint256 penaltyScore,
        PenaltyTier tier,
        uint16 repeatMultiplier,
        uint256 recordIndex
    );

    // ============================================================
    // Constructor
    // ============================================================

    constructor(address _complianceChecker) {
        owner = msg.sender;
        complianceChecker = _complianceChecker;
    }

    function setComplianceChecker(address _complianceChecker) external onlyOwner {
        complianceChecker = _complianceChecker;
    }

    // ============================================================
    // Penalty Calculation (view — free to call)
    // ============================================================

    struct ViolationInput {
        bool pH_violated;
        bool BOD_violated;
        bool COD_violated;
        bool TSS_violated;
        bool temp_violated;
        bool totalCr_violated;
        bool hexCr_violated;
        bool oilGrease_violated;
        bool NH3N_violated;
        // Deviation percentages (1-decimal: 150 = 15.0%)
        uint16 pH_deviation;
        uint16 BOD_deviation;
        uint16 COD_deviation;
        uint16 TSS_deviation;
        uint16 temp_deviation;
        uint16 totalCr_deviation;
        uint16 hexCr_deviation;
        uint16 oilGrease_deviation;
        uint16 NH3N_deviation;
    }

    /**
     * @notice Calculate penalty score for a set of violations.
     *         Score = Σ (weight × deviation_factor) × repeat_multiplier
     *         Pure function — no gas cost when called externally.
     *
     * @param input Per-parameter violation flags and deviation percentages
     * @param recentViolationCount Number of violations in last 30 days
     * @return score Penalty score (higher = worse)
     * @return tier Penalty tier (NONE, WARNING, MODERATE, SEVERE, CRITICAL)
     * @return multiplier Applied repeat offender multiplier
     */
    function calculatePenalty(
        ViolationInput calldata input,
        uint256 recentViolationCount
    ) external pure returns (
        uint256 score,
        PenaltyTier tier,
        uint16 multiplier
    ) {
        // Base score: sum of (weight × deviation_factor) for violated parameters
        uint256 baseScore = 0;

        if (input.pH_violated)
            baseScore += uint256(WEIGHT_PH) * _deviationFactor(input.pH_deviation);
        if (input.BOD_violated)
            baseScore += uint256(WEIGHT_BOD) * _deviationFactor(input.BOD_deviation);
        if (input.COD_violated)
            baseScore += uint256(WEIGHT_COD) * _deviationFactor(input.COD_deviation);
        if (input.TSS_violated)
            baseScore += uint256(WEIGHT_TSS) * _deviationFactor(input.TSS_deviation);
        if (input.temp_violated)
            baseScore += uint256(WEIGHT_TEMP) * _deviationFactor(input.temp_deviation);
        if (input.totalCr_violated)
            baseScore += uint256(WEIGHT_TOTAL_CR) * _deviationFactor(input.totalCr_deviation);
        if (input.hexCr_violated)
            baseScore += uint256(WEIGHT_HEX_CR) * _deviationFactor(input.hexCr_deviation);
        if (input.oilGrease_violated)
            baseScore += uint256(WEIGHT_OIL_GREASE) * _deviationFactor(input.oilGrease_deviation);
        if (input.NH3N_violated)
            baseScore += uint256(WEIGHT_NH3N) * _deviationFactor(input.NH3N_deviation);

        // Apply repeat offender multiplier
        multiplier = _getMultiplier(recentViolationCount);
        score = (baseScore * uint256(multiplier)) / 1000;

        // Classify tier
        tier = _classifyTier(score);

        return (score, tier, multiplier);
    }

    // ============================================================
    // Record Penalty (state-modifying)
    // ============================================================

    function recordPenalty(
        string calldata facilityId,
        ViolationInput calldata input,
        uint256 recentViolationCount
    ) external onlyAuthorized returns (uint256 recordIndex) {
        bytes32 key = keccak256(abi.encodePacked(facilityId));

        // Calculate
        uint256 baseScore = 0;
        uint8 violatingCount = 0;

        if (input.pH_violated) { baseScore += uint256(WEIGHT_PH) * _deviationFactor(input.pH_deviation); violatingCount++; }
        if (input.BOD_violated) { baseScore += uint256(WEIGHT_BOD) * _deviationFactor(input.BOD_deviation); violatingCount++; }
        if (input.COD_violated) { baseScore += uint256(WEIGHT_COD) * _deviationFactor(input.COD_deviation); violatingCount++; }
        if (input.TSS_violated) { baseScore += uint256(WEIGHT_TSS) * _deviationFactor(input.TSS_deviation); violatingCount++; }
        if (input.temp_violated) { baseScore += uint256(WEIGHT_TEMP) * _deviationFactor(input.temp_deviation); violatingCount++; }
        if (input.totalCr_violated) { baseScore += uint256(WEIGHT_TOTAL_CR) * _deviationFactor(input.totalCr_deviation); violatingCount++; }
        if (input.hexCr_violated) { baseScore += uint256(WEIGHT_HEX_CR) * _deviationFactor(input.hexCr_deviation); violatingCount++; }
        if (input.oilGrease_violated) { baseScore += uint256(WEIGHT_OIL_GREASE) * _deviationFactor(input.oilGrease_deviation); violatingCount++; }
        if (input.NH3N_violated) { baseScore += uint256(WEIGHT_NH3N) * _deviationFactor(input.NH3N_deviation); violatingCount++; }

        uint16 multiplier = _getMultiplier(recentViolationCount);
        uint256 score = (baseScore * uint256(multiplier)) / 1000;
        PenaltyTier tier = _classifyTier(score);

        recordIndex = penaltyRecords.length;
        penaltyRecords.push(PenaltyRecord({
            facilityKey: key,
            penaltyScore: score,
            tier: tier,
            repeatMultiplier: multiplier,
            timestamp: uint40(block.timestamp),
            violatingParameterCount: violatingCount
        }));

        facilityPenaltyCount[key]++;

        emit PenaltyCalculated(key, score, tier, multiplier, recordIndex);
        return recordIndex;
    }

    // ============================================================
    // View Helpers
    // ============================================================

    function getPenaltyRecordCount() external view returns (uint256) {
        return penaltyRecords.length;
    }

    function getTierName(PenaltyTier tier) external pure returns (string memory) {
        if (tier == PenaltyTier.NONE) return "NONE";
        if (tier == PenaltyTier.WARNING) return "WARNING";
        if (tier == PenaltyTier.MODERATE) return "MODERATE";
        if (tier == PenaltyTier.SEVERE) return "SEVERE";
        return "CRITICAL";
    }

    // ============================================================
    // Internal Helpers
    // ============================================================

    /**
     * @dev Convert deviation percentage to a severity factor.
     *      0-10% → 1, 10-25% → 2, 25-50% → 3, 50-100% → 4, >100% → 5
     *      Input is 1-decimal encoded (150 = 15.0%)
     */
    function _deviationFactor(uint16 deviation) internal pure returns (uint256) {
        if (deviation <= 100) return 1;   // ≤ 10%
        if (deviation <= 250) return 2;   // 10-25%
        if (deviation <= 500) return 3;   // 25-50%
        if (deviation <= 1000) return 4;  // 50-100%
        return 5;                          // > 100%
    }

    function _getMultiplier(uint256 recentViolations) internal pure returns (uint16) {
        if (recentViolations >= 25) return MULTIPLIER_REPEAT_25;
        if (recentViolations >= 10) return MULTIPLIER_REPEAT_10;
        if (recentViolations >= 3) return MULTIPLIER_REPEAT_3;
        return MULTIPLIER_FIRST;
    }

    function _classifyTier(uint256 score) internal pure returns (PenaltyTier) {
        if (score == 0) return PenaltyTier.NONE;
        if (score < 500) return PenaltyTier.WARNING;
        if (score < 1500) return PenaltyTier.MODERATE;
        if (score < 3000) return PenaltyTier.SEVERE;
        return PenaltyTier.CRITICAL;
    }
}
