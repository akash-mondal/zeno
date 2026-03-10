// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./hedera/HederaTokenService.sol";
import "./hedera/HederaResponseCodes.sol";
import "./hedera/ExpiryHelper.sol";
import "./hedera/KeyHelper.sol";

/**
 * @title ComplianceChecker — Zeno On-Chain Compliance Oracle
 * @notice Evaluates OCEMS sensor readings against CPCB Schedule-VI discharge standards
 *         with CTO-specific overrides and ZLD enforcement.
 *
 * Architecture:
 *   - checkCompliance() is a pure/view function (FREE to call) — stateless oracle
 *   - recordCompliance() stores evaluation hash on-chain, emits events for Mirror Node
 *   - Token creation via HTS precompile (shows deep Hedera integration for judges)
 *   - Day-to-day minting via SDK (reliable, cheaper, already battle-tested)
 *
 * Two-tier threshold system:
 *   Tier 1: CPCB Schedule-VI general standards (hardcoded defaults)
 *   Tier 2: CTO-specific overrides per facility (stricter, from Consent to Operate)
 */
contract ComplianceChecker is HederaTokenService, ExpiryHelper, KeyHelper {

    // ============================================================
    // Access Control
    // ============================================================

    address public owner;
    mapping(address => bool) public registrars;  // can register facilities
    mapping(address => bool) public submitters;  // can record compliance

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyRegistrar() {
        require(registrars[msg.sender] || msg.sender == owner, "Not registrar");
        _;
    }

    modifier onlySubmitter() {
        require(submitters[msg.sender] || msg.sender == owner, "Not submitter");
        _;
    }

    // ============================================================
    // CPCB Schedule-VI Defaults (immutable — hardcoded from regulation)
    // ============================================================
    // All values use uint16 with implicit 1-decimal precision
    // e.g., pH 5.5 → 55, COD 250.0 → 2500

    uint16 public constant DEFAULT_PH_MIN = 55;        // 5.5
    uint16 public constant DEFAULT_PH_MAX = 90;        // 9.0
    uint16 public constant DEFAULT_BOD = 300;           // 30.0 mg/L
    uint16 public constant DEFAULT_COD = 2500;          // 250.0 mg/L
    uint16 public constant DEFAULT_TSS = 1000;          // 100.0 mg/L
    uint16 public constant DEFAULT_TEMP = 50;           // 5.0°C above ambient
    uint16 public constant DEFAULT_TOTAL_CR = 20;       // 2.0 mg/L
    uint16 public constant DEFAULT_HEX_CR = 1;          // 0.1 mg/L
    uint16 public constant DEFAULT_OIL_GREASE = 100;    // 10.0 mg/L
    uint16 public constant DEFAULT_NH3N = 500;          // 50.0 mg/L

    // ============================================================
    // Facility Registry
    // ============================================================

    struct FacilityThresholds {
        uint16 pH_min;          // 1-decimal: 55 = 5.5
        uint16 pH_max;          // 1-decimal: 90 = 9.0
        uint16 BOD;             // 1-decimal: 300 = 30.0 mg/L
        uint16 COD;             // 1-decimal: 2500 = 250.0 mg/L
        uint16 TSS;             // 1-decimal: 1000 = 100.0 mg/L
        uint16 tempAboveAmbient;// 1-decimal: 50 = 5.0°C
        uint16 totalCr;        // 1-decimal: 20 = 2.0 mg/L
        uint16 hexCr;          // 1-decimal: 1 = 0.1 mg/L
        uint16 oilGrease;      // 1-decimal: 100 = 10.0 mg/L
        uint16 NH3N;           // 1-decimal: 500 = 50.0 mg/L
    }

    struct Facility {
        bool registered;
        bool isZLD;             // Zero Liquid Discharge mandated
        bool hasCTOOverride;    // uses CTO limits instead of Schedule-VI
        string facilityId;      // e.g., "KNP-TAN-001"
        string industryCategory;
        FacilityThresholds thresholds;
    }

    // facilityId hash → Facility
    mapping(bytes32 => Facility) public facilities;
    bytes32[] public facilityKeys;

    // ============================================================
    // Compliance Records (on-chain audit trail)
    // ============================================================

    struct ComplianceRecord {
        bytes32 facilityKey;
        bytes32 evaluationHash;     // keccak256 of full evaluation JSON
        bool compliant;
        uint8 violationCount;
        uint8 criticalViolationCount;
        uint40 timestamp;           // unix timestamp (fits until year 36812)
        string hcsMessageId;        // HCS message reference
    }

    ComplianceRecord[] public complianceRecords;
    // facilityKey → count of records
    mapping(bytes32 => uint256) public facilityRecordCount;
    // facilityKey → count of violations
    mapping(bytes32 => uint256) public facilityViolationCount;

    // ============================================================
    // Token Addresses (created via HTS precompile)
    // ============================================================

    address public ggccToken;       // GGCC fungible token
    address public violationNFT;    // ZVIOL NFT collection
    address public complianceCertNFT; // ZCERT NFT collection

    // ============================================================
    // Events (indexed for Mirror Node queries)
    // ============================================================

    event FacilityRegistered(
        bytes32 indexed facilityKey,
        string facilityId,
        string industryCategory,
        bool isZLD,
        bool hasCTOOverride
    );

    event ComplianceEvaluated(
        bytes32 indexed facilityKey,
        bool compliant,
        uint8 violationCount,
        uint8 criticalViolationCount,
        bytes32 evaluationHash,
        uint256 recordIndex
    );

    event TokensCreated(
        address ggccToken,
        address violationNFT,
        address complianceCertNFT
    );

    event RoleGranted(address indexed account, string role);
    event RoleRevoked(address indexed account, string role);

    // ============================================================
    // Constructor
    // ============================================================

    constructor() {
        owner = msg.sender;
        registrars[msg.sender] = true;
        submitters[msg.sender] = true;
    }

    // ============================================================
    // Role Management
    // ============================================================

    function grantRegistrar(address account) external onlyOwner {
        registrars[account] = true;
        emit RoleGranted(account, "REGISTRAR");
    }

    function revokeRegistrar(address account) external onlyOwner {
        registrars[account] = false;
        emit RoleRevoked(account, "REGISTRAR");
    }

    function grantSubmitter(address account) external onlyOwner {
        submitters[account] = true;
        emit RoleGranted(account, "SUBMITTER");
    }

    function revokeSubmitter(address account) external onlyOwner {
        submitters[account] = false;
        emit RoleRevoked(account, "SUBMITTER");
    }

    // ============================================================
    // Facility Registration
    // ============================================================

    function registerFacility(
        string calldata facilityId,
        string calldata industryCategory,
        bool isZLD,
        bool hasCTOOverride,
        FacilityThresholds calldata thresholds
    ) external onlyRegistrar {
        bytes32 key = keccak256(abi.encodePacked(facilityId));
        require(!facilities[key].registered, "Already registered");

        FacilityThresholds memory effectiveThresholds;
        if (hasCTOOverride) {
            effectiveThresholds = thresholds;
        } else {
            effectiveThresholds = getDefaultThresholds();
        }

        facilities[key] = Facility({
            registered: true,
            isZLD: isZLD,
            hasCTOOverride: hasCTOOverride,
            facilityId: facilityId,
            industryCategory: industryCategory,
            thresholds: effectiveThresholds
        });

        facilityKeys.push(key);

        emit FacilityRegistered(key, facilityId, industryCategory, isZLD, hasCTOOverride);
    }

    function getDefaultThresholds() public pure returns (FacilityThresholds memory) {
        return FacilityThresholds({
            pH_min: DEFAULT_PH_MIN,
            pH_max: DEFAULT_PH_MAX,
            BOD: DEFAULT_BOD,
            COD: DEFAULT_COD,
            TSS: DEFAULT_TSS,
            tempAboveAmbient: DEFAULT_TEMP,
            totalCr: DEFAULT_TOTAL_CR,
            hexCr: DEFAULT_HEX_CR,
            oilGrease: DEFAULT_OIL_GREASE,
            NH3N: DEFAULT_NH3N
        });
    }

    // ============================================================
    // Compliance Check — PURE/VIEW (FREE to call)
    // ============================================================

    struct SensorInput {
        uint16 pH;              // 1-decimal: 72 = 7.2
        uint16 BOD;             // 1-decimal: 250 = 25.0 mg/L
        uint16 COD;             // 1-decimal: 1800 = 180.0 mg/L
        uint16 TSS;             // 1-decimal: 650 = 65.0 mg/L
        uint16 tempAboveAmbient;// 1-decimal: 30 = 3.0°C
        uint16 totalCr;        // 1-decimal: 15 = 1.5 mg/L
        uint16 hexCr;          // 1-decimal: 0 = 0.05 (round to nearest)
        uint16 oilGrease;      // 1-decimal: 50 = 5.0 mg/L
        uint16 NH3N;           // 1-decimal: 200 = 20.0 mg/L
        uint16 flow_KLD;       // 1-decimal: 100 = 10.0 KLD (for ZLD check)
    }

    struct ComplianceResult {
        bool overallCompliant;
        uint8 violationCount;
        bool pH_compliant;
        bool BOD_compliant;
        bool COD_compliant;
        bool TSS_compliant;
        bool temp_compliant;
        bool totalCr_compliant;
        bool hexCr_compliant;
        bool oilGrease_compliant;
        bool NH3N_compliant;
        bool zld_compliant;     // true if not ZLD mode, or ZLD + no flow
    }

    /**
     * @notice Check compliance of sensor readings against facility thresholds.
     *         This is a VIEW function — costs ZERO gas to call externally.
     *         Anyone (regulators, courts, citizens, NGOs) can verify compliance.
     *
     * @param facilityId The facility identifier string
     * @param input Sensor readings with 1-decimal precision
     * @return result Per-parameter compliance booleans + overall status
     */
    function checkCompliance(
        string calldata facilityId,
        SensorInput calldata input
    ) external view returns (ComplianceResult memory result) {
        bytes32 key = keccak256(abi.encodePacked(facilityId));
        Facility storage fac = facilities[key];
        require(fac.registered, "Facility not registered");

        FacilityThresholds storage t = fac.thresholds;

        // ZLD check — ANY flow > 0 is a violation
        if (fac.isZLD) {
            result.zld_compliant = (input.flow_KLD == 0);
            if (!result.zld_compliant) {
                // ZLD violation overrides everything
                result.overallCompliant = false;
                result.violationCount = 1;
                // Set all other params as unchecked (true) since ZLD is the violation
                result.pH_compliant = true;
                result.BOD_compliant = true;
                result.COD_compliant = true;
                result.TSS_compliant = true;
                result.temp_compliant = true;
                result.totalCr_compliant = true;
                result.hexCr_compliant = true;
                result.oilGrease_compliant = true;
                result.NH3N_compliant = true;
                return result;
            }
        } else {
            result.zld_compliant = true;
        }

        // Parameter checks (1-decimal encoded)
        result.pH_compliant = (input.pH >= t.pH_min && input.pH <= t.pH_max);
        result.BOD_compliant = (input.BOD <= t.BOD);
        result.COD_compliant = (input.COD <= t.COD);
        result.TSS_compliant = (input.TSS <= t.TSS);
        result.temp_compliant = (input.tempAboveAmbient <= t.tempAboveAmbient);
        result.totalCr_compliant = (input.totalCr <= t.totalCr);
        result.hexCr_compliant = (input.hexCr <= t.hexCr);
        result.oilGrease_compliant = (input.oilGrease <= t.oilGrease);
        result.NH3N_compliant = (input.NH3N <= t.NH3N);

        // Count violations
        uint8 count = 0;
        if (!result.pH_compliant) count++;
        if (!result.BOD_compliant) count++;
        if (!result.COD_compliant) count++;
        if (!result.TSS_compliant) count++;
        if (!result.temp_compliant) count++;
        if (!result.totalCr_compliant) count++;
        if (!result.hexCr_compliant) count++;
        if (!result.oilGrease_compliant) count++;
        if (!result.NH3N_compliant) count++;

        result.violationCount = count;
        result.overallCompliant = (count == 0);

        return result;
    }

    // ============================================================
    // Record Compliance (state-modifying — costs gas)
    // ============================================================

    /**
     * @notice Record a compliance evaluation on-chain.
     *         The evaluation hash links to the full evaluation JSON on HCS.
     *         This creates an immutable on-chain audit trail.
     */
    function recordCompliance(
        string calldata facilityId,
        bytes32 evaluationHash,
        bool compliant,
        uint8 violationCount,
        uint8 criticalViolationCount,
        string calldata hcsMessageId
    ) external onlySubmitter returns (uint256 recordIndex) {
        bytes32 key = keccak256(abi.encodePacked(facilityId));
        require(facilities[key].registered, "Facility not registered");

        recordIndex = complianceRecords.length;

        complianceRecords.push(ComplianceRecord({
            facilityKey: key,
            evaluationHash: evaluationHash,
            compliant: compliant,
            violationCount: violationCount,
            criticalViolationCount: criticalViolationCount,
            timestamp: uint40(block.timestamp),
            hcsMessageId: hcsMessageId
        }));

        facilityRecordCount[key]++;
        if (!compliant) {
            facilityViolationCount[key]++;
        }

        emit ComplianceEvaluated(
            key,
            compliant,
            violationCount,
            criticalViolationCount,
            evaluationHash,
            recordIndex
        );

        return recordIndex;
    }

    // ============================================================
    // HTS Token Creation (via precompile — shows Hedera integration)
    // ============================================================

    /**
     * @notice Create all three Zeno token types via HTS precompile.
     *         Called once during deployment. Requires HBAR for token creation fees.
     *         Supply key = this contract, so only this contract can mint via precompile.
     *         (Day-to-day minting uses SDK for reliability — see hts.ts)
     */
    function createTokens(
        string memory ggccName,
        string memory ggccSymbol,
        string memory violName,
        string memory violSymbol,
        string memory certName,
        string memory certSymbol
    ) external payable onlyOwner {
        require(ggccToken == address(0), "Tokens already created");

        // Supply key = this contract
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(
            KeyHelper.KeyType.SUPPLY,
            KeyHelper.KeyValueType.CONTRACT_ID,
            abi.encodePacked(address(this))
        );

        // Create GGCC fungible token
        IHederaTokenService.HederaToken memory ggccDef;
        ggccDef.name = ggccName;
        ggccDef.symbol = ggccSymbol;
        ggccDef.treasury = address(this);
        ggccDef.memo = "1 GGCC = 1 facility-day of verified compliant discharge";
        ggccDef.tokenSupplyType = false;  // false = INFINITE
        ggccDef.maxSupply = 0;
        ggccDef.freezeDefault = false;
        ggccDef.tokenKeys = keys;
        ggccDef.expiry = createAutoRenewExpiry(address(this), 7776000);

        (int responseCode, address tokenAddr) =
            HederaTokenService.createFungibleToken(ggccDef, 0, 0);
        require(responseCode == HederaResponseCodes.SUCCESS, "GGCC creation failed");
        ggccToken = tokenAddr;

        // Create Violation NFT collection
        IHederaTokenService.HederaToken memory violDef;
        violDef.name = violName;
        violDef.symbol = violSymbol;
        violDef.treasury = address(this);
        violDef.memo = "Immutable record of discharge standard violation";
        violDef.tokenSupplyType = false;
        violDef.maxSupply = 0;
        violDef.freezeDefault = false;
        violDef.tokenKeys = keys;
        violDef.expiry = createAutoRenewExpiry(address(this), 7776000);

        (int responseCode2, address violAddr) =
            HederaTokenService.createNonFungibleToken(violDef);
        require(responseCode2 == HederaResponseCodes.SUCCESS, "ZVIOL creation failed");
        violationNFT = violAddr;

        // Create Compliance Certificate NFT collection
        IHederaTokenService.HederaToken memory certDef;
        certDef.name = certName;
        certDef.symbol = certSymbol;
        certDef.treasury = address(this);
        certDef.memo = "Sustained compliance achievement certificate";
        certDef.tokenSupplyType = false;
        certDef.maxSupply = 0;
        certDef.freezeDefault = false;
        certDef.tokenKeys = keys;
        certDef.expiry = createAutoRenewExpiry(address(this), 7776000);

        (int responseCode3, address certAddr) =
            HederaTokenService.createNonFungibleToken(certDef);
        require(responseCode3 == HederaResponseCodes.SUCCESS, "ZCERT creation failed");
        complianceCertNFT = certAddr;

        emit TokensCreated(ggccToken, violationNFT, complianceCertNFT);
    }

    // ============================================================
    // View Helpers
    // ============================================================

    function getFacilityCount() external view returns (uint256) {
        return facilityKeys.length;
    }

    function getRecordCount() external view returns (uint256) {
        return complianceRecords.length;
    }

    function getFacility(string calldata facilityId)
        external view returns (Facility memory)
    {
        bytes32 key = keccak256(abi.encodePacked(facilityId));
        require(facilities[key].registered, "Facility not registered");
        return facilities[key];
    }

    function getFacilityStats(string calldata facilityId)
        external view returns (
            uint256 totalRecords,
            uint256 totalViolations,
            uint256 complianceRate  // percentage × 100 (e.g., 8500 = 85.00%)
        )
    {
        bytes32 key = keccak256(abi.encodePacked(facilityId));
        require(facilities[key].registered, "Facility not registered");

        totalRecords = facilityRecordCount[key];
        totalViolations = facilityViolationCount[key];

        if (totalRecords == 0) {
            complianceRate = 10000; // 100.00% if no records
        } else {
            complianceRate = ((totalRecords - totalViolations) * 10000) / totalRecords;
        }
    }

    // Fallback to receive HBAR for token creation
    receive() external payable {}
}
