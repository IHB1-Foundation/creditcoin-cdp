// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./interfaces/IInterfaces.sol";

/**
 * @title LiquidationEngine
 * @notice Handles liquidation of under-collateralized vaults
 * @dev Coordinates between VaultManager, StabilityPool, and Treasury
 */
contract LiquidationEngine {
    // =============================================================
    //                           STORAGE
    // =============================================================

    uint256 private constant PRECISION = 1e18;

    // Contract references
    IVaultManager public immutable vaultManager;
    IStabilityPool public immutable stabilityPool;
    ITreasury public immutable treasury;
    IERC20 public immutable collateralToken;

    // Parameters
    uint256 public liquidationPenalty; // e.g., 5e16 = 5%

    address public owner;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event Liquidated(
        uint256 indexed vaultId,
        address indexed liquidator,
        uint256 collateralLiquidated,
        uint256 debtLiquidated,
        uint256 penaltyAmount
    );
    event BatchLiquidated(
        uint256[] vaultIds,
        address indexed liquidator,
        uint256 totalCollateral,
        uint256 totalDebt
    );
    event LiquidationPenaltyUpdated(uint256 indexed oldPenalty, uint256 indexed newPenalty);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error VaultNotLiquidatable();
    error StabilityPoolInsufficient();
    error InvalidPenalty();
    error TransferFailed();
    error ApprovalFailed();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the LiquidationEngine
     * @param _vaultManager VaultManager contract address
     * @param _stabilityPool StabilityPool contract address
     * @param _treasury Treasury contract address
     * @param _collateralToken Collateral token (wCTC) address
     * @param _liquidationPenalty Penalty percentage (e.g., 5e16 = 5%)
     */
    constructor(
        address _vaultManager,
        address _stabilityPool,
        address _treasury,
        address _collateralToken,
        uint256 _liquidationPenalty
    ) {
        if (_vaultManager == address(0)) revert Unauthorized();
        if (_stabilityPool == address(0)) revert Unauthorized();
        if (_treasury == address(0)) revert Unauthorized();
        if (_collateralToken == address(0)) revert Unauthorized();
        if (_liquidationPenalty > 0.2e18) revert InvalidPenalty(); // Max 20%

        vaultManager = IVaultManager(_vaultManager);
        stabilityPool = IStabilityPool(_stabilityPool);
        treasury = ITreasury(_treasury);
        collateralToken = IERC20(_collateralToken);

        liquidationPenalty = _liquidationPenalty;
        owner = msg.sender;
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // =============================================================
    //                   LIQUIDATION FUNCTIONS
    // =============================================================

    /**
     * @notice Liquidate a single vault
     * @param vaultId ID of the vault to liquidate
     */
    function liquidate(uint256 vaultId) external {
        // Check if vault can be liquidated
        if (!vaultManager.canLiquidate(vaultId)) revert VaultNotLiquidatable();

        // Get vault info before liquidation
        (, , uint256 debt, ) = vaultManager.getVaultBasic(vaultId);

        // Check if stability pool can absorb the debt
        if (!stabilityPool.canAbsorbDebt(debt)) revert StabilityPoolInsufficient();

        // Liquidate vault (transfers collateral to this contract)
        (uint256 collateral, uint256 debtAmount) = vaultManager.liquidateVault(vaultId);

        // Calculate penalty
        uint256 penaltyAmount = (collateral * liquidationPenalty) / PRECISION;
        uint256 collateralToPool = collateral - penaltyAmount;

        // Approve and send collateral to stability pool
        if (collateralToPool > 0) {
            if (!collateralToken.approve(address(stabilityPool), collateralToPool)) {
                revert ApprovalFailed();
            }

            // Transfer collateral to stability pool
            if (!collateralToken.transfer(address(stabilityPool), collateralToPool)) {
                revert TransferFailed();
            }

            // Absorb debt in stability pool
            stabilityPool.absorbDebt(debtAmount, collateralToPool);
        }

        // Send penalty to treasury
        if (penaltyAmount > 0) {
            if (!collateralToken.approve(address(treasury), penaltyAmount)) {
                revert ApprovalFailed();
            }

            treasury.collectFee(address(collateralToken), penaltyAmount);
        }

        emit Liquidated(vaultId, msg.sender, collateral, debtAmount, penaltyAmount);
    }

    /**
     * @notice Liquidate multiple vaults in a single transaction
     * @param vaultIds Array of vault IDs to liquidate
     */
    function batchLiquidate(uint256[] calldata vaultIds) external {
        uint256 totalCollateral;
        uint256 totalDebt;

        for (uint256 i = 0; i < vaultIds.length; i++) {
            uint256 vaultId = vaultIds[i];

            // Skip if not liquidatable
            if (!vaultManager.canLiquidate(vaultId)) {
                continue;
            }

            // Get vault info
            (, , uint256 debt, ) = vaultManager.getVaultBasic(vaultId);

            // Skip if stability pool can't absorb
            if (!stabilityPool.canAbsorbDebt(debt)) {
                continue;
            }

            // Liquidate vault
            (uint256 collateral, uint256 debtAmount) = vaultManager.liquidateVault(vaultId);

            totalCollateral += collateral;
            totalDebt += debtAmount;

            // Calculate penalty for this vault
            uint256 penaltyAmount = (collateral * liquidationPenalty) / PRECISION;
            uint256 collateralToPool = collateral - penaltyAmount;

            // Process liquidation
            if (collateralToPool > 0) {
                if (!collateralToken.approve(address(stabilityPool), collateralToPool)) {
                    revert ApprovalFailed();
                }

                if (!collateralToken.transfer(address(stabilityPool), collateralToPool)) {
                    revert TransferFailed();
                }

                stabilityPool.absorbDebt(debtAmount, collateralToPool);
            }

            if (penaltyAmount > 0) {
                if (!collateralToken.approve(address(treasury), penaltyAmount)) {
                    revert ApprovalFailed();
                }

                treasury.collectFee(address(collateralToken), penaltyAmount);
            }

            emit Liquidated(vaultId, msg.sender, collateral, debtAmount, penaltyAmount);
        }

        emit BatchLiquidated(vaultIds, msg.sender, totalCollateral, totalDebt);
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    /**
     * @notice Check if a vault can be liquidated
     * @param vaultId ID of the vault
     * @return canLiq True if vault can be liquidated
     */
    function canLiquidate(uint256 vaultId) external view returns (bool canLiq) {
        return vaultManager.canLiquidate(vaultId);
    }

    /**
     * @notice Calculate liquidation amounts for a vault
     * @param collateralAmount Amount of collateral in vault
     * @return penaltyAmount Amount going to treasury
     * @return poolAmount Amount going to stability pool
     */
    function calculateLiquidationAmounts(uint256 collateralAmount)
        external
        view
        returns (uint256 penaltyAmount, uint256 poolAmount)
    {
        penaltyAmount = (collateralAmount * liquidationPenalty) / PRECISION;
        poolAmount = collateralAmount - penaltyAmount;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Update liquidation penalty
     * @param _newPenalty New penalty percentage (e.g., 5e16 = 5%)
     */
    function setLiquidationPenalty(uint256 _newPenalty) external onlyOwner {
        if (_newPenalty > 0.2e18) revert InvalidPenalty();

        uint256 oldPenalty = liquidationPenalty;
        liquidationPenalty = _newPenalty;

        emit LiquidationPenaltyUpdated(oldPenalty, _newPenalty);
    }
}
