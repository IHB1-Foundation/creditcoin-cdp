// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "./interfaces/IInterfaces.sol";

/**
 * @title VaultManager
 * @notice Core CDP logic for creating and managing collateralized debt positions
 * @dev Allows users to deposit wCTC collateral and borrow rUSD against it
 */
contract VaultManager {
    // =============================================================
    //                           STORAGE
    // =============================================================

    struct Vault {
        address owner;
        uint256 collateral; // wCTC amount
        uint256 debt;       // rUSD amount
        uint256 timestamp;  // Last update time
    }

    // Constants with 18 decimals precision
    uint256 private constant PRECISION = 1e18;
    uint256 private constant MIN_DEBT = 100e18; // Minimum 100 rUSD debt

    // Contract references
    IERC20 public immutable collateralToken;    // wCTC
    IStablecoin public immutable stablecoin;    // rUSD
    IPushOracle public immutable oracle;        // Price oracle
    ITreasury public immutable treasury;        // Fee collection

    // Parameters
    uint256 public minCollateralRatio;          // e.g., 1.3e18 = 130%
    uint256 public borrowingFee;                // e.g., 5e15 = 0.5%

    // State
    mapping(uint256 => Vault) public vaults;
    mapping(address => uint256[]) public userVaults;
    uint256 public nextVaultId;
    uint256 public totalCollateral;
    uint256 public totalDebt;

    // Liquidation authorization
    address public liquidationEngine;

    address public owner;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event VaultOpened(
        uint256 indexed vaultId,
        address indexed owner,
        uint256 collateralAmount,
        uint256 debtAmount
    );
    event VaultAdjusted(
        uint256 indexed vaultId,
        int256 collateralDelta,
        int256 debtDelta,
        uint256 newCollateral,
        uint256 newDebt
    );
    event VaultClosed(uint256 indexed vaultId, address indexed owner);
    event LiquidationEngineSet(address indexed liquidationEngine);
    event ParametersUpdated(uint256 minCollateralRatio, uint256 borrowingFee);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error VaultNotFound();
    error InsufficientCollateralRatio();
    error DebtTooLow();
    error VaultAlreadyClosed();
    error InvalidParameters();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the VaultManager
     * @param _collateralToken wCTC token address
     * @param _stablecoin rUSD token address
     * @param _oracle Price oracle address
     * @param _treasury Treasury address
     * @param _minCollateralRatio Minimum collateral ratio (e.g., 1.3e18 = 130%)
     * @param _borrowingFee Borrowing fee percentage (e.g., 5e15 = 0.5%)
     */
    constructor(
        address _collateralToken,
        address _stablecoin,
        address _oracle,
        address _treasury,
        uint256 _minCollateralRatio,
        uint256 _borrowingFee
    ) {
        if (_collateralToken == address(0)) revert ZeroAddress();
        if (_stablecoin == address(0)) revert ZeroAddress();
        if (_oracle == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_minCollateralRatio < PRECISION) revert InvalidParameters();
        if (_borrowingFee > 0.1e18) revert InvalidParameters(); // Max 10% fee

        collateralToken = IERC20(_collateralToken);
        stablecoin = IStablecoin(_stablecoin);
        oracle = IPushOracle(_oracle);
        treasury = ITreasury(_treasury);

        minCollateralRatio = _minCollateralRatio;
        borrowingFee = _borrowingFee;

        owner = msg.sender;
        nextVaultId = 1; // Start vault IDs at 1
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVaultOwner(uint256 vaultId) {
        if (vaults[vaultId].owner != msg.sender) revert Unauthorized();
        _;
    }

    modifier onlyLiquidationEngine() {
        if (msg.sender != liquidationEngine) revert Unauthorized();
        _;
    }

    modifier vaultExists(uint256 vaultId) {
        if (vaults[vaultId].owner == address(0)) revert VaultNotFound();
        _;
    }

    // =============================================================
    //                      VAULT OPERATIONS
    // =============================================================

    /**
     * @notice Open a new vault with collateral and debt
     * @param collateralAmount Amount of wCTC to deposit
     * @param debtAmount Amount of rUSD to borrow
     * @return vaultId ID of the newly created vault
     */
    function openVault(uint256 collateralAmount, uint256 debtAmount)
        external
        returns (uint256 vaultId)
    {
        if (collateralAmount == 0) revert ZeroAmount();
        if (debtAmount < MIN_DEBT) revert DebtTooLow();

        // Get current price
        uint256 price = oracle.getPrice();

        // Calculate fee
        uint256 fee = (debtAmount * borrowingFee) / PRECISION;
        uint256 totalDebtWithFee = debtAmount + fee;

        // Check collateral ratio
        uint256 collateralValue = (collateralAmount * price) / PRECISION;
        uint256 requiredCollateral = (totalDebtWithFee * minCollateralRatio) / PRECISION;

        if (collateralValue < requiredCollateral) revert InsufficientCollateralRatio();

        // Create vault
        vaultId = nextVaultId++;
        vaults[vaultId] = Vault({
            owner: msg.sender,
            collateral: collateralAmount,
            debt: totalDebtWithFee,
            timestamp: block.timestamp
        });

        userVaults[msg.sender].push(vaultId);

        // Update global state
        totalCollateral += collateralAmount;
        totalDebt += totalDebtWithFee;

        // Transfer collateral from user
        if (!collateralToken.transferFrom(msg.sender, address(this), collateralAmount)) {
            revert TransferFailed();
        }

        // Mint rUSD to user (only the requested amount, not the fee)
        stablecoin.mint(msg.sender, debtAmount);

        // Mint fee to treasury
        if (fee > 0) {
            stablecoin.mint(address(treasury), fee);
        }

        emit VaultOpened(vaultId, msg.sender, collateralAmount, totalDebtWithFee);
    }

    /**
     * @notice Adjust an existing vault's collateral and/or debt
     * @param vaultId ID of the vault to adjust
     * @param collateralDelta Change in collateral (positive = add, negative = remove)
     * @param debtDelta Change in debt (positive = borrow more, negative = repay)
     */
    function adjustVault(uint256 vaultId, int256 collateralDelta, int256 debtDelta)
        external
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        Vault storage vault = vaults[vaultId];

        // Calculate new amounts
        uint256 newCollateral = _applyDelta(vault.collateral, collateralDelta);
        uint256 newDebt = _applyDelta(vault.debt, debtDelta);

        // Check minimum debt requirement (unless closing)
        if (newDebt > 0 && newDebt < MIN_DEBT) revert DebtTooLow();

        // Get current price
        uint256 price = oracle.getPrice();

        // Check collateral ratio if debt remains
        if (newDebt > 0) {
            uint256 collateralValue = (newCollateral * price) / PRECISION;
            uint256 requiredCollateral = (newDebt * minCollateralRatio) / PRECISION;

            if (collateralValue < requiredCollateral) revert InsufficientCollateralRatio();
        }

        // Handle collateral changes
        if (collateralDelta > 0) {
            // Adding collateral
            if (!collateralToken.transferFrom(msg.sender, address(this), uint256(collateralDelta))) {
                revert TransferFailed();
            }
            totalCollateral += uint256(collateralDelta);
        } else if (collateralDelta < 0) {
            // Removing collateral
            uint256 amount = uint256(-collateralDelta);
            if (!collateralToken.transfer(msg.sender, amount)) {
                revert TransferFailed();
            }
            totalCollateral -= amount;
        }

        // Handle debt changes
        if (debtDelta > 0) {
            // Borrowing more
            uint256 amount = uint256(debtDelta);
            uint256 fee = (amount * borrowingFee) / PRECISION;
            uint256 totalNew = amount + fee;

            stablecoin.mint(msg.sender, amount);
            if (fee > 0) {
                stablecoin.mint(address(treasury), fee);
            }

            newDebt += fee;
            totalDebt += totalNew;
        } else if (debtDelta < 0) {
            // Repaying debt
            uint256 amount = uint256(-debtDelta);
            stablecoin.burn(msg.sender, amount);
            totalDebt -= amount;
        }

        // Update vault
        vault.collateral = newCollateral;
        vault.debt = newDebt;
        vault.timestamp = block.timestamp;

        emit VaultAdjusted(vaultId, collateralDelta, debtDelta, newCollateral, newDebt);
    }

    /**
     * @notice Close a vault by repaying all debt and withdrawing collateral
     * @param vaultId ID of the vault to close
     */
    function closeVault(uint256 vaultId)
        external
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        Vault storage vault = vaults[vaultId];

        uint256 collateralAmount = vault.collateral;
        uint256 debtAmount = vault.debt;

        // Burn debt
        if (debtAmount > 0) {
            stablecoin.burn(msg.sender, debtAmount);
            totalDebt -= debtAmount;
        }

        // Return collateral
        if (collateralAmount > 0) {
            if (!collateralToken.transfer(msg.sender, collateralAmount)) {
                revert TransferFailed();
            }
            totalCollateral -= collateralAmount;
        }

        // Clear vault
        delete vaults[vaultId];

        emit VaultClosed(vaultId, msg.sender);
    }

    // =============================================================
    //                   LIQUIDATION FUNCTIONS
    // =============================================================

    /**
     * @notice Liquidate a vault (only callable by LiquidationEngine)
     * @param vaultId ID of the vault to liquidate
     * @return collateralAmount Amount of collateral in the vault
     * @return debtAmount Amount of debt in the vault
     */
    function liquidateVault(uint256 vaultId)
        external
        onlyLiquidationEngine
        vaultExists(vaultId)
        returns (uint256 collateralAmount, uint256 debtAmount)
    {
        Vault storage vault = vaults[vaultId];

        collateralAmount = vault.collateral;
        debtAmount = vault.debt;

        // Update global state
        totalCollateral -= collateralAmount;
        totalDebt -= debtAmount;

        // Transfer collateral to liquidation engine
        if (collateralAmount > 0) {
            if (!collateralToken.transfer(liquidationEngine, collateralAmount)) {
                revert TransferFailed();
            }
        }

        // Clear vault
        delete vaults[vaultId];
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    /**
     * @notice Calculate the collateral ratio of a vault
     * @param vaultId ID of the vault
     * @return ratio Collateral ratio with 18 decimals (e.g., 1.5e18 = 150%)
     */
    function getVaultCollateralRatio(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (uint256 ratio)
    {
        Vault storage vault = vaults[vaultId];
        if (vault.debt == 0) return type(uint256).max;

        uint256 price = oracle.getPrice();
        uint256 collateralValue = (vault.collateral * price) / PRECISION;

        return (collateralValue * PRECISION) / vault.debt;
    }

    /**
     * @notice Check if a vault can be liquidated
     * @param vaultId ID of the vault
     * @return canLiquidate True if vault is below MCR
     */
    function canLiquidate(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (bool canLiquidate)
    {
        Vault storage vault = vaults[vaultId];
        if (vault.debt == 0) return false;

        if (!oracle.isFresh()) return false;

        uint256 price = oracle.getPrice();
        uint256 collateralValue = (vault.collateral * price) / PRECISION;
        uint256 requiredCollateral = (vault.debt * minCollateralRatio) / PRECISION;

        return collateralValue < requiredCollateral;
    }

    /**
     * @notice Get vault details
     * @param vaultId ID of the vault
     * @return vault Vault struct
     */
    function getVault(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (Vault memory vault)
    {
        return vaults[vaultId];
    }

    /**
     * @notice Get all vault IDs for a user
     * @param user User address
     * @return vaultIds Array of vault IDs
     */
    function getUserVaults(address user) external view returns (uint256[] memory vaultIds) {
        return userVaults[user];
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Set the liquidation engine address
     * @param _liquidationEngine Address of the liquidation engine
     */
    function setLiquidationEngine(address _liquidationEngine) external onlyOwner {
        if (_liquidationEngine == address(0)) revert ZeroAddress();
        liquidationEngine = _liquidationEngine;
        emit LiquidationEngineSet(_liquidationEngine);
    }

    /**
     * @notice Update protocol parameters
     * @param _minCollateralRatio New minimum collateral ratio
     * @param _borrowingFee New borrowing fee
     */
    function updateParameters(uint256 _minCollateralRatio, uint256 _borrowingFee)
        external
        onlyOwner
    {
        if (_minCollateralRatio < PRECISION) revert InvalidParameters();
        if (_borrowingFee > 0.1e18) revert InvalidParameters();

        minCollateralRatio = _minCollateralRatio;
        borrowingFee = _borrowingFee;

        emit ParametersUpdated(_minCollateralRatio, _borrowingFee);
    }

    // =============================================================
    //                      INTERNAL HELPERS
    // =============================================================

    /**
     * @notice Apply a signed delta to a uint256 value
     * @param value Current value
     * @param delta Signed change
     * @return newValue Updated value
     */
    function _applyDelta(uint256 value, int256 delta) private pure returns (uint256 newValue) {
        if (delta >= 0) {
            return value + uint256(delta);
        } else {
            return value - uint256(-delta);
        }
    }
}
