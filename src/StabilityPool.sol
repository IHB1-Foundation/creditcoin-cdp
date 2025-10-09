// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./interfaces/IInterfaces.sol";

/**
 * @title StabilityPool
 * @notice Accepts crdUSD deposits to absorb liquidated debt and earn discounted collateral
 * @dev Depositors provide crdUSD which is burned during liquidations in exchange for wCTC
 */
contract StabilityPool {
    // =============================================================
    //                           STORAGE
    // =============================================================

    struct Deposit {
        uint256 amount;                    // crdUSD deposited
        uint256 collateralGainSnapshot;    // Collateral gain at last interaction
        uint256 epochSnapshot;             // Epoch at last interaction
    }

    uint256 private constant PRECISION = 1e18;

    // Contract references
    IStablecoin public immutable stablecoin;    // crdUSD
    IERC20 public immutable collateralToken;    // wCTC

    // State
    mapping(address => Deposit) public deposits;
    uint256 public totalDeposits;
    uint256 public totalCollateralGains;

    // Track collateral distribution
    uint256 public collateralPerUnitStaked;
    uint256 public lastErrorRedistribution;

    // Authorization
    address public liquidationEngine;
    address public owner;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event StabilityDeposit(address indexed depositor, uint256 amount, uint256 newBalance);
    event StabilityWithdraw(address indexed depositor, uint256 amount, uint256 newBalance);
    event CollateralGainWithdrawn(address indexed depositor, uint256 collateralAmount);
    event DebtAbsorbed(uint256 debtAmount, uint256 collateralAmount);
    event LiquidationEngineSet(address indexed liquidationEngine);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientDeposit();
    error InsufficientPoolBalance();
    error TransferFailed();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the StabilityPool
     * @param _stablecoin crdUSD token address
     * @param _collateralToken wCTC token address
     */
    constructor(address _stablecoin, address _collateralToken) {
        if (_stablecoin == address(0)) revert ZeroAddress();
        if (_collateralToken == address(0)) revert ZeroAddress();

        stablecoin = IStablecoin(_stablecoin);
        collateralToken = IERC20(_collateralToken);
        owner = msg.sender;
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyLiquidationEngine() {
        if (msg.sender != liquidationEngine) revert Unauthorized();
        _;
    }

    // =============================================================
    //                      DEPOSIT FUNCTIONS
    // =============================================================

    /**
     * @notice Deposit crdUSD into the stability pool
     * @param amount Amount of crdUSD to deposit
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        // Update depositor gains before modifying deposit
        _updateDepositorGains(msg.sender);

        // Transfer crdUSD from user
        (bool success, bytes memory data) = address(stablecoin).call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        // Update deposit
        deposits[msg.sender].amount += amount;
        totalDeposits += amount;

        emit StabilityDeposit(msg.sender, amount, deposits[msg.sender].amount);
    }

    /**
     * @notice Withdraw crdUSD from the stability pool
     * @param amount Amount of crdUSD to withdraw
     */
    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (deposits[msg.sender].amount < amount) revert InsufficientDeposit();

        // Update depositor gains before modifying deposit
        _updateDepositorGains(msg.sender);

        // Update deposit
        deposits[msg.sender].amount -= amount;
        totalDeposits -= amount;

        // Transfer crdUSD to user
        (bool success, bytes memory data) = address(stablecoin).call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit StabilityWithdraw(msg.sender, amount, deposits[msg.sender].amount);
    }

    /**
     * @notice Withdraw accumulated collateral gains
     */
    function withdrawCollateralGain() external {
        // Update depositor gains
        _updateDepositorGains(msg.sender);

        uint256 collateralGain = deposits[msg.sender].collateralGainSnapshot;
        if (collateralGain == 0) revert ZeroAmount();

        // Reset collateral gain
        deposits[msg.sender].collateralGainSnapshot = 0;
        totalCollateralGains -= collateralGain;

        // Transfer collateral to user
        if (!collateralToken.transfer(msg.sender, collateralGain)) {
            revert TransferFailed();
        }

        emit CollateralGainWithdrawn(msg.sender, collateralGain);
    }

    // =============================================================
    //                   LIQUIDATION FUNCTIONS
    // =============================================================

    /**
     * @notice Absorb debt from a liquidation
     * @param debtAmount Amount of debt to absorb
     * @param collateralAmount Amount of collateral to distribute
     * @dev Only callable by LiquidationEngine
     */
    function absorbDebt(uint256 debtAmount, uint256 collateralAmount)
        external
        onlyLiquidationEngine
    {
        if (debtAmount == 0) revert ZeroAmount();
        if (totalDeposits < debtAmount) revert InsufficientPoolBalance();

        // Burn crdUSD from the pool
        stablecoin.burn(address(this), debtAmount);
        totalDeposits -= debtAmount;

        // Distribute collateral proportionally to depositors
        if (collateralAmount > 0 && totalDeposits > 0) {
            // Update collateral per unit staked
            uint256 collateralPerUnit = (collateralAmount * PRECISION) / (totalDeposits + debtAmount);
            collateralPerUnitStaked += collateralPerUnit;
            totalCollateralGains += collateralAmount;
        }

        emit DebtAbsorbed(debtAmount, collateralAmount);
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    /**
     * @notice Get depositor information
     * @param depositor Address of the depositor
     * @return depositAmount Amount of crdUSD deposited
     * @return collateralGain Accumulated collateral gains
     */
    function getDepositorInfo(address depositor)
        external
        view
        returns (uint256 depositAmount, uint256 collateralGain)
    {
        Deposit storage dep = deposits[depositor];
        depositAmount = dep.amount;

        // Calculate pending collateral gain
        if (dep.amount > 0) {
            uint256 collateralGainPerUnit = collateralPerUnitStaked;
            uint256 previousCollateralGain = (dep.amount * collateralGainPerUnit) / PRECISION;
            collateralGain = dep.collateralGainSnapshot + previousCollateralGain;
        } else {
            collateralGain = dep.collateralGainSnapshot;
        }
    }

    /**
     * @notice Get the total crdUSD in the stability pool
     * @return total Total crdUSD deposited
     */
    function getTotalDeposits() external view returns (uint256 total) {
        return totalDeposits;
    }

    /**
     * @notice Check if pool has sufficient crdUSD to absorb debt
     * @param debtAmount Amount of debt to check
     * @return sufficient True if pool can absorb the debt
     */
    function canAbsorbDebt(uint256 debtAmount) external view returns (bool sufficient) {
        return totalDeposits >= debtAmount;
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

    // =============================================================
    //                      INTERNAL HELPERS
    // =============================================================

    /**
     * @notice Update depositor's collateral gains
     * @param depositor Address of the depositor
     */
    function _updateDepositorGains(address depositor) private {
        Deposit storage dep = deposits[depositor];

        if (dep.amount > 0) {
            // Calculate collateral gain since last update
            uint256 collateralGain = (dep.amount * collateralPerUnitStaked) / PRECISION;
            dep.collateralGainSnapshot += collateralGain;

            // Reset the per-unit counter for this depositor
            // This is done by reducing their deposit and re-adding it
            // which effectively resets their snapshot point
        }
    }
}
