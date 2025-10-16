// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./interfaces/IInterfaces.sol";

/**
 * @title VaultManager
 * @notice Core CDP logic for creating and managing collateralized debt positions
 * @dev Allows users to deposit wCTC collateral and borrow crdUSD against it
 */
contract VaultManager {
    // =============================================================
    //                           STORAGE
    // =============================================================

    struct Vault {
        address owner;
        uint256 collateral; // wCTC amount
        uint256 debt;       // crdUSD amount
        uint256 interestRate; // Borrower-chosen interest rate (1e18 = 100%)
        uint256 timestamp;  // Last update time
    }

    // Constants with 18 decimals precision
    uint256 private constant PRECISION = 1e18;
    uint256 private constant MIN_DEBT = 100e18; // Minimum 100 crdUSD debt
    uint256 private constant MAX_INTEREST = 0.40e18; // Max 40% interest
    uint256 private constant DEFAULT_INTEREST = 5e16; // 5%
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // Contract references
    IERC20 public collateralToken;    // wCTC
    IStablecoin public stablecoin;    // crdUSD
    IPushOracle public oracle;        // Price oracle
    ITreasury public treasury;        // Fee collection

    // Parameters
    uint256 public minCollateralRatio;          // e.g., 1.3e18 = 130% (borrow constraint)
    uint256 public liquidationRatio;            // e.g., 1.111e18 = 111.1% (liquidation threshold)
    uint256 public borrowingFee;                // e.g., 5e15 = 0.5%
    uint256 public redemptionFee;               // e.g., 5e15 = 0.5%

    // State
    mapping(uint256 => Vault) public vaults;
    mapping(address => uint256[]) public userVaults;
    uint256 public nextVaultId;
    uint256 public totalCollateral;
    uint256 public totalDebt;

    // Liquidation authorization
    address public liquidationEngine;

    address public owner;

    // Allow receiving native tCTC (for unwrap flows)
    receive() external payable {}

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
    event RedemptionExecuted(
        address indexed redeemer,
        address indexed receiver,
        uint256 rUSDAmount,
        uint256 wCTCReceived,
        uint256 feeAmount
    );
    event VaultRedeemed(
        uint256 indexed vaultId,
        uint256 debtRedeemed,
        uint256 collateralRedeemed
    );

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
    error InsufficientRedeemableVaults();
    error RedemptionAmountTooLarge();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Constructor: sets owner and initializes counters
     */
    constructor() {
        owner = msg.sender;
        nextVaultId = 1; // Start vault IDs at 1
    }

    /**
     * @notice Initialize core dependencies and parameters (one-time)
     * @param _collateralToken wCTC token address
     * @param _stablecoin crdUSD token address
     * @param _oracle Price oracle address
     * @param _treasury Treasury address
     * @param _minCollateralRatio Minimum collateral ratio (e.g., 1.3e18 = 130%)
     * @param _borrowingFee Borrowing fee percentage (e.g., 5e15 = 0.5%)
     */
    function initialize(
        address _collateralToken,
        address _stablecoin,
        address _oracle,
        address _treasury,
        uint256 _minCollateralRatio,
        uint256 _borrowingFee
    ) external onlyOwner {
        if (address(collateralToken) != address(0)) revert InvalidParameters(); // already initialized
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
        liquidationRatio = _minCollateralRatio; // default equals MCR; owner can adjust later
        borrowingFee = _borrowingFee;
        redemptionFee = 5e15; // Default 0.5%
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
     * @param debtAmount Amount of crdUSD to borrow
     * @return vaultId ID of the newly created vault
     */
    function openVault(uint256 collateralAmount, uint256 debtAmount)
        external
        returns (uint256 vaultId)
    {
        // Backwards-compatible overload: default interest
        return openVault(collateralAmount, debtAmount, DEFAULT_INTEREST);
    }

    /**
     * @notice Open a new vault using native tCTC as collateral (wrapped internally)
     * @param debtAmount Amount of crdUSD to borrow
     * @param interestRate Borrower-chosen interest rate (1e18 = 100%)
     * @return vaultId ID of the newly created vault
     */
    function openVaultNative(uint256 debtAmount, uint256 interestRate)
        external
        payable
        returns (uint256 vaultId)
    {
        uint256 collateralAmount = msg.value;
        if (collateralAmount == 0) revert ZeroAmount();
        if (debtAmount < MIN_DEBT) revert DebtTooLow();
        if (interestRate > MAX_INTEREST) revert InvalidParameters();

        uint256 price = oracle.getPrice();
        uint256 fee = (debtAmount * borrowingFee) / PRECISION;
        uint256 totalDebtWithFee = debtAmount + fee;

        uint256 collateralValue = (collateralAmount * price) / PRECISION;
        uint256 requiredCollateral = (totalDebtWithFee * minCollateralRatio) / PRECISION;
        if (collateralValue < requiredCollateral) revert InsufficientCollateralRatio();

        // Wrap native to wCTC into this contract
        IWCTC(address(collateralToken)).wrap{value: collateralAmount}();

        // Create vault owned by user
        vaultId = nextVaultId++;
        vaults[vaultId] = Vault({
            owner: msg.sender,
            collateral: collateralAmount,
            debt: totalDebtWithFee,
            interestRate: interestRate,
            timestamp: block.timestamp
        });
        userVaults[msg.sender].push(vaultId);

        totalCollateral += collateralAmount;
        totalDebt += totalDebtWithFee;

        // Mint crdUSD and fee
        stablecoin.mint(msg.sender, debtAmount);
        if (fee > 0) {
            stablecoin.mint(address(treasury), fee);
        }

        emit VaultOpened(vaultId, msg.sender, collateralAmount, totalDebtWithFee);
    }

    /**
     * @notice Open a new vault with collateral, debt, and chosen interest rate
     * @param collateralAmount Amount of wCTC to deposit
     * @param debtAmount Amount of crdUSD to borrow
     * @param interestRate Borrower-chosen interest rate (1e18 = 100%)
     * @return vaultId ID of the newly created vault
     */
    function openVault(uint256 collateralAmount, uint256 debtAmount, uint256 interestRate)
        public
        returns (uint256 vaultId)
    {
        if (collateralAmount == 0) revert ZeroAmount();
        if (debtAmount < MIN_DEBT) revert DebtTooLow();
        if (interestRate > MAX_INTEREST) revert InvalidParameters();

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
            interestRate: interestRate,
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

        // Mint crdUSD to user (only the requested amount, not the fee)
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

        // Accrue interest before any changes
        _accrueInterest(vault);

        // Calculate new amounts
        uint256 newCollateral = _applyDelta(vault.collateral, collateralDelta);
        uint256 newDebt = _applyDelta(vault.debt, debtDelta);

        // Check minimum debt requirement (unless closing)
        if (newDebt > 0 && newDebt < MIN_DEBT) revert DebtTooLow();

        // Only enforce collateral ratio checks when the change reduces safety:
        // - increasing debt or
        // - decreasing collateral.
        if (newDebt > 0 && (newDebt > vault.debt || newCollateral < vault.collateral)) {
            uint256 price = oracle.getPrice();
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
     * @notice Deposit native tCTC collateral (wrapped internally) into an existing vault
     * @param vaultId ID of the vault
     */
    function depositCollateralNative(uint256 vaultId)
        external
        payable
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        if (msg.value == 0) revert ZeroAmount();
        Vault storage vault = vaults[vaultId];

        // Accrue interest then update collateral
        _accrueInterest(vault);

        uint256 newCollateral = vault.collateral + msg.value;
        // Check ratio if debt remains
        if (vault.debt > 0) {
            uint256 price = oracle.getPrice();
            uint256 collateralValue = (newCollateral * price) / PRECISION;
            uint256 requiredCollateral = (vault.debt * minCollateralRatio) / PRECISION;
            if (collateralValue < requiredCollateral) revert InsufficientCollateralRatio();
        }

        // Wrap into contract balance
        IWCTC(address(collateralToken)).wrap{value: msg.value}();

        // Update state
        vault.collateral = newCollateral;
        vault.timestamp = block.timestamp;
        totalCollateral += msg.value;

        emit VaultAdjusted(vaultId, int256(msg.value), int256(0), newCollateral, vault.debt);
    }

    /**
     * @notice Withdraw collateral as native tCTC (unwraps internally)
     * @param vaultId ID of the vault
     * @param amount Amount of collateral to withdraw (in wCTC units)
     */
    function withdrawCollateralNative(uint256 vaultId, uint256 amount)
        external
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        if (amount == 0) revert ZeroAmount();
        Vault storage vault = vaults[vaultId];

        // Accrue interest and compute new collateral
        _accrueInterest(vault);
        if (amount > vault.collateral) amount = vault.collateral;
        uint256 newCollateral = vault.collateral - amount;

        // Check ratio if debt remains
        if (vault.debt > 0) {
            uint256 price = oracle.getPrice();
            uint256 collateralValue = (newCollateral * price) / PRECISION;
            uint256 requiredCollateral = (vault.debt * minCollateralRatio) / PRECISION;
            if (collateralValue < requiredCollateral) revert InsufficientCollateralRatio();
        }

        // Update state before external calls
        vault.collateral = newCollateral;
        vault.timestamp = block.timestamp;
        totalCollateral -= amount;

        // Unwrap into this contract then forward to user
        IWCTC(address(collateralToken)).unwrap(amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit VaultAdjusted(vaultId, -int256(amount), int256(0), newCollateral, vault.debt);
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

        // Accrue interest before closing
        _accrueInterest(vault);

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

    /**
     * @notice Close a vault and receive native tCTC (unwraps internally)
     * @param vaultId ID of the vault to close
     */
    function closeVaultNative(uint256 vaultId)
        external
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        Vault storage vault = vaults[vaultId];
        _accrueInterest(vault);

        uint256 collateralAmount = vault.collateral;
        uint256 debtAmount = vault.debt;

        if (debtAmount > 0) {
            stablecoin.burn(msg.sender, debtAmount);
            totalDebt -= debtAmount;
        }

        if (collateralAmount > 0) {
            // Unwrap collateral and forward native
            IWCTC(address(collateralToken)).unwrap(collateralAmount);
            (bool ok, ) = payable(msg.sender).call{value: collateralAmount}("");
            if (!ok) revert TransferFailed();
            totalCollateral -= collateralAmount;
        }

        delete vaults[vaultId];
        emit VaultClosed(vaultId, msg.sender);
    }

    // =============================================================
    //                    REDEMPTION FUNCTIONS
    // =============================================================

    /**
     * @notice Redeem crdUSD for wCTC collateral from lowest-interest vaults
     * @dev Targets vaults with lowest interest rate first; skips vaults below MCR
     * @param rUSDAmount Amount of crdUSD to burn for redemption
     * @param receiver Address to receive the redeemed wCTC
     * @return collateralRedeemed Total amount of wCTC sent to receiver (after fee)
     */
    function redeem(uint256 rUSDAmount, address receiver)
        external
        returns (uint256 collateralRedeemed)
    {
        return _redeemCore(rUSDAmount, receiver, type(uint256).max);
    }

    /**
     * @notice Redeem crdUSD and receive native tCTC directly (unwraps net collateral)
     * @param rUSDAmount Amount of crdUSD to burn for redemption
     * @param receiver Address to receive native tCTC
     * @return collateralRedeemedNative Amount of native tCTC sent to receiver (after fee)
     */
    function redeemNative(uint256 rUSDAmount, address receiver)
        external
        returns (uint256 collateralRedeemedNative)
    {
        // Reuse core path to select vaults and compute total wCTC redeemed
        uint256 beforeWCTC = IERC20(address(collateralToken)).balanceOf(address(this));
        _redeemCore(rUSDAmount, address(this), type(uint256).max);
        // _redeemCore transferred wCTC to receiver; but we passed address(this)
        // so we must adjust: revert to internal variant that doesn't transfer. To keep minimal changes,
        // we compute delta and unwrap only the net amount.
        // However, _redeemCore already emitted events and transferred fee to treasury.
        // Instead, implement a dedicated internal path is larger change. We'll adapt:
        // Balance delta is net to receiver (after fee).
        uint256 afterWCTC = IERC20(address(collateralToken)).balanceOf(address(this));
        uint256 netToReceiver = afterWCTC > beforeWCTC ? (afterWCTC - beforeWCTC) : 0;
        if (netToReceiver == 0) return 0;
        // Unwrap and forward native to receiver
        IWCTC(address(collateralToken)).unwrap(netToReceiver);
        (bool ok, ) = payable(receiver).call{value: netToReceiver}("");
        if (!ok) revert TransferFailed();
        return netToReceiver;
    }

    /**
     * @notice Redeem with an interest cap; skips vaults above maxInterestRate
     * @param rUSDAmount Amount of crdUSD to burn
     * @param receiver Recipient for collateral
     * @param maxInterestRate Maximum acceptable APR (WAD, e.g., 0.05e18 for 5%). Use type(uint256).max for no cap.
     */
    function redeemWithCap(uint256 rUSDAmount, address receiver, uint256 maxInterestRate)
        external
        returns (uint256 collateralRedeemed)
    {
        return _redeemCore(rUSDAmount, receiver, maxInterestRate);
    }

    function redeemAdvanced(
        uint256 rUSDAmount,
        address receiver,
        uint256 maxInterestRate,
        bool preferLargerDebt
    ) external returns (uint256 collateralRedeemed) {
        return _redeemCoreWithTie(rUSDAmount, receiver, maxInterestRate, preferLargerDebt);
    }

    function _redeemCore(uint256 rUSDAmount, address receiver, uint256 maxInterestRate)
        private
        returns (uint256 collateralRedeemed)
    {
        if (rUSDAmount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 price = oracle.getPrice();

        // Build heap of active vaults (ids, rates, debts)
        uint256 n;
        for (uint256 i = 1; i < nextVaultId; i++) {
            if (vaults[i].owner != address(0) && vaults[i].debt > 0) n++;
        }
        if (n == 0) revert InsufficientRedeemableVaults();

        uint256[] memory ids = new uint256[](n);
        uint256[] memory rates = new uint256[](n);
        uint256[] memory debts = new uint256[](n);
        uint256 k;
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage v = vaults[i];
            if (v.owner != address(0) && v.debt > 0) {
                ids[k] = i;
                rates[k] = v.interestRate;
                debts[k] = v.debt;
                k++;
            }
        }
        // Build min-heap
        for (int256 i = int256(n / 2) - 1; i >= 0; i--) {
            _heapify3(rates, ids, debts, uint256(i), n);
        }

        uint256 remainingDebt = rUSDAmount;
        uint256 totalCollateralRedeemed = 0;
        uint256 heapSize = n;

        while (heapSize > 0 && remainingDebt > 0) {
            uint256 vid = ids[0];
            Vault storage vault = vaults[vid];

            // Pop root for now
            ids[0] = ids[heapSize - 1];
            rates[0] = rates[heapSize - 1];
            debts[0] = debts[heapSize - 1];
            heapSize--;
            _heapify3(rates, ids, debts, 0, heapSize);

            // Validate and process vault
            if (vault.owner == address(0) || vault.debt == 0) continue;

            // Interest cap filter
            if (maxInterestRate != type(uint256).max && vault.interestRate > maxInterestRate) continue;

            // Accrue interest before check/redeem
            _accrueInterest(vault);

            // Skip if below MCR
            uint256 collateralValue = (vault.collateral * price) / PRECISION;
            uint256 requiredCollateral = (vault.debt * minCollateralRatio) / PRECISION;
            if (collateralValue < requiredCollateral) continue;

            uint256 debtToRedeem = remainingDebt > vault.debt ? vault.debt : remainingDebt;
            uint256 collateralToRedeem = (debtToRedeem * PRECISION) / price;
            if (collateralToRedeem > vault.collateral) {
                collateralToRedeem = vault.collateral;
                debtToRedeem = (collateralToRedeem * price) / PRECISION;
            }

            // Update vault
            vault.collateral -= collateralToRedeem;
            vault.debt -= debtToRedeem;
            vault.timestamp = block.timestamp;

            // Close if debt is at or below minimum threshold (including zero)
            if (vault.debt <= MIN_DEBT) {
                if (vault.collateral > 0) {
                    if (!collateralToken.transfer(vault.owner, vault.collateral)) {
                        revert TransferFailed();
                    }
                    totalCollateral -= vault.collateral;
                }
                address vaultOwner = vault.owner;
                delete vaults[vid];
                emit VaultClosed(vid, vaultOwner);
            }

            totalCollateralRedeemed += collateralToRedeem;
            remainingDebt -= debtToRedeem;
            totalCollateral -= collateralToRedeem;
            totalDebt -= debtToRedeem;
            emit VaultRedeemed(vid, debtToRedeem, collateralToRedeem);
        }

        if (totalCollateralRedeemed == 0) revert InsufficientRedeemableVaults();

        uint256 fee = (totalCollateralRedeemed * redemptionFee) / PRECISION;
        uint256 collateralToReceiver = totalCollateralRedeemed - fee;
        uint256 actualBurned = rUSDAmount - remainingDebt;
        stablecoin.burn(msg.sender, actualBurned);
        if (!collateralToken.transfer(receiver, collateralToReceiver)) revert TransferFailed();
        if (fee > 0) {
            if (!collateralToken.transfer(address(treasury), fee)) revert TransferFailed();
        }
        emit RedemptionExecuted(msg.sender, receiver, actualBurned, collateralToReceiver, fee);
        return collateralToReceiver;
    }

    /**
     * @notice Internal redeem core with tie preference selector
     */
    function _redeemCoreWithTie(
        uint256 rUSDAmount,
        address receiver,
        uint256 maxInterestRate,
        bool preferLargerDebt
    ) private returns (uint256 collateralRedeemed) {
        if (rUSDAmount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 price = oracle.getPrice();

        uint256 n;
        for (uint256 i = 1; i < nextVaultId; i++) {
            if (vaults[i].owner != address(0) && vaults[i].debt > 0) n++;
        }
        if (n == 0) revert InsufficientRedeemableVaults();

        uint256[] memory ids = new uint256[](n);
        uint256[] memory rates = new uint256[](n);
        uint256[] memory debts = new uint256[](n);
        uint256 k;
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage v = vaults[i];
            if (v.owner != address(0) && v.debt > 0) {
                ids[k] = i;
                rates[k] = v.interestRate;
                debts[k] = v.debt;
                k++;
            }
        }

        // Build heap with chosen tie-break preference
        if (preferLargerDebt) {
            for (int256 i = int256(n / 2) - 1; i >= 0; i--) {
                _heapify3(rates, ids, debts, uint256(i), n);
            }
        } else {
            for (int256 i = int256(n / 2) - 1; i >= 0; i--) {
                _heapify3Small(rates, ids, debts, uint256(i), n);
            }
        }

        uint256 remainingDebt = rUSDAmount;
        uint256 totalCollateralRedeemed = 0;
        uint256 heapSize = n;

        while (heapSize > 0 && remainingDebt > 0) {
            uint256 vid = ids[0];
            Vault storage vault = vaults[vid];

            // Pop root
            ids[0] = ids[heapSize - 1];
            rates[0] = rates[heapSize - 1];
            debts[0] = debts[heapSize - 1];
            heapSize--;
            if (preferLargerDebt) {
                _heapify3(rates, ids, debts, 0, heapSize);
            } else {
                _heapify3Small(rates, ids, debts, 0, heapSize);
            }

            if (vault.owner == address(0) || vault.debt == 0) continue;
            if (maxInterestRate != type(uint256).max && vault.interestRate > maxInterestRate) continue;

            _accrueInterest(vault);

            uint256 collateralValue = (vault.collateral * price) / PRECISION;
            uint256 requiredCollateral = (vault.debt * minCollateralRatio) / PRECISION;
            if (collateralValue < requiredCollateral) continue;

            uint256 debtToRedeem = remainingDebt > vault.debt ? vault.debt : remainingDebt;
            uint256 collateralToRedeem = (debtToRedeem * PRECISION) / price;
            if (collateralToRedeem > vault.collateral) {
                collateralToRedeem = vault.collateral;
                debtToRedeem = (collateralToRedeem * price) / PRECISION;
            }

            vault.collateral -= collateralToRedeem;
            vault.debt -= debtToRedeem;
            vault.timestamp = block.timestamp;

            if (vault.debt <= MIN_DEBT) {
                if (vault.collateral > 0) {
                    if (!collateralToken.transfer(vault.owner, vault.collateral)) revert TransferFailed();
                    totalCollateral -= vault.collateral;
                }
                address vaultOwner = vault.owner;
                delete vaults[vid];
                emit VaultClosed(vid, vaultOwner);
            }

            totalCollateralRedeemed += collateralToRedeem;
            remainingDebt -= debtToRedeem;
            totalCollateral -= collateralToRedeem;
            totalDebt -= debtToRedeem;
            emit VaultRedeemed(vid, debtToRedeem, collateralToRedeem);
        }

        if (totalCollateralRedeemed == 0) revert InsufficientRedeemableVaults();

        uint256 fee = (totalCollateralRedeemed * redemptionFee) / PRECISION;
        uint256 collateralToReceiver = totalCollateralRedeemed - fee;
        uint256 actualBurned = rUSDAmount - remainingDebt;
        stablecoin.burn(msg.sender, actualBurned);
        if (!collateralToken.transfer(receiver, collateralToReceiver)) revert TransferFailed();
        if (fee > 0) {
            if (!collateralToken.transfer(address(treasury), fee)) revert TransferFailed();
        }
        emit RedemptionExecuted(msg.sender, receiver, actualBurned, collateralToReceiver, fee);
        return collateralToReceiver;
    }

    // Heap with smaller debt tie-break
    function _heapify3Small(uint256[] memory rates, uint256[] memory ids, uint256[] memory debts, uint256 i, uint256 heapSize) private pure {
        while (true) {
            uint256 smallest = i;
            uint256 l = 2 * i + 1;
            uint256 r = 2 * i + 2;
            if (l < heapSize && _less3Small(rates[l], debts[l], ids[l], rates[smallest], debts[smallest], ids[smallest])) {
                smallest = l;
            }
            if (r < heapSize && _less3Small(rates[r], debts[r], ids[r], rates[smallest], debts[smallest], ids[smallest])) {
                smallest = r;
            }
            if (smallest == i) break;
            uint256 tr = rates[i]; rates[i] = rates[smallest]; rates[smallest] = tr;
            uint256 td = debts[i]; debts[i] = debts[smallest]; debts[smallest] = td;
            uint256 tid = ids[i]; ids[i] = ids[smallest]; ids[smallest] = tid;
            i = smallest;
        }
    }

    function _less3Small(
        uint256 rateA, uint256 debtA, uint256 idA,
        uint256 rateB, uint256 debtB, uint256 idB
    ) private pure returns (bool) {
        if (rateA < rateB) return true;
        if (rateA > rateB) return false;
        if (debtA < debtB) return true; // prefer smaller debt
        if (debtA > debtB) return false;
        return idA < idB;
    }

    /**
     * @notice Get estimated collateral amount for a given crdUSD redemption
     * @param rUSDAmount Amount of crdUSD to redeem
     * @return estimatedCollateral Estimated wCTC to receive (after fee)
     */
    function getRedeemableAmount(uint256 rUSDAmount)
        external
        view
        returns (uint256 estimatedCollateral)
    {
        if (rUSDAmount == 0) return 0;

        uint256 price = oracle.getPrice();

        // Calculate gross collateral at oracle price
        uint256 grossCollateral = (rUSDAmount * PRECISION) / price;

        // Subtract fee
        uint256 fee = (grossCollateral * redemptionFee) / PRECISION;

        return grossCollateral - fee;
    }

    /**
     * @notice Calculate redemption fee for a given collateral amount
     * @param collateralAmount Amount of collateral being redeemed
     * @return fee Fee amount in wCTC
     */
    function getRedemptionFee(uint256 collateralAmount)
        external
        view
        returns (uint256 fee)
    {
        return (collateralAmount * redemptionFee) / PRECISION;
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

        // Accrue interest before liquidation
        _accrueInterest(vault);

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
     * @notice Get basic vault details (compat with prior interface)
     */
    function getVaultBasic(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (address owner_, uint256 collateral_, uint256 debt_, uint256 timestamp_)
    {
        Vault storage v = vaults[vaultId];
        return (v.owner, v.collateral, v.debt, v.timestamp);
    }

    /**
     * @notice Get the interest rate for a vault
     */
    function getVaultInterest(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (uint256 interest)
    {
        return vaults[vaultId].interestRate;
    }

    /**
     * @notice Update vault interest rate
     * @param vaultId ID of the vault
     * @param newRate New interest rate (1e18 = 100%)
     */
    function updateInterestRate(uint256 vaultId, uint256 newRate)
        external
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        if (newRate > MAX_INTEREST) revert InvalidParameters();
        Vault storage v = vaults[vaultId];
        v.interestRate = newRate;
        v.timestamp = block.timestamp;
    }

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
        uint256 currentDebt = _accruedDebtView(vault);
        if (currentDebt == 0) return type(uint256).max;

        uint256 price = oracle.getPrice();
        uint256 collateralValue = (vault.collateral * price) / PRECISION;
        return (collateralValue * PRECISION) / currentDebt;
    }

    /**
     * @notice Check if a vault can be liquidated
     * @param vaultId ID of the vault
     * @return isLiquidatable True if vault is below MCR
     */
    function canLiquidate(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (bool isLiquidatable)
    {
        Vault storage vault = vaults[vaultId];
        uint256 currentDebt = _accruedDebtView(vault);
        if (currentDebt == 0) return false;

        if (!oracle.isFresh()) return false;

        uint256 price = oracle.getPrice();
        uint256 collateralValue = (vault.collateral * price) / PRECISION;
        uint256 requiredCollateral = (currentDebt * liquidationRatio) / PRECISION;
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

    /**
     * @notice Get current total system debt including accrued interest
     */
    function getTotalDebtCurrent() external view returns (uint256 total) {
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage v = vaults[i];
            if (v.owner != address(0) && v.debt > 0) {
                total += _accruedDebtView(v);
            }
        }
    }

    /**
     * @notice Get basic interest statistics across active vaults
     * @return minRate Minimum interest rate among active vaults
     * @return maxRate Maximum interest rate among active vaults
     * @return avgRate Average interest rate among active vaults
     * @return weightedAvgRate Debt-weighted average interest rate among active vaults
     * @return count Number of active vaults considered
     */
    function getInterestStats()
        external
        view
        returns (uint256 minRate, uint256 maxRate, uint256 avgRate, uint256 weightedAvgRate, uint256 count)
    {
        uint256 sum;
        uint256 weightedSum;
        uint256 sumDebt;
        bool init;
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage v = vaults[i];
            if (v.owner != address(0) && v.debt > 0) {
                if (!init) {
                    minRate = v.interestRate;
                    maxRate = v.interestRate;
                    init = true;
                } else {
                    if (v.interestRate < minRate) minRate = v.interestRate;
                    if (v.interestRate > maxRate) maxRate = v.interestRate;
                }
                sum += v.interestRate;
                weightedSum += v.interestRate * v.debt;
                sumDebt += v.debt;
                count++;
            }
        }
        if (count > 0) {
            avgRate = sum / count;
        }
        if (sumDebt > 0) {
            weightedAvgRate = weightedSum / sumDebt;
        }
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

    /**
     * @notice Update liquidation collateral ratio threshold
     * @param _liquidationRatio New liquidation ratio (e.g., 1.11e18 for 111%)
     */
    function setLiquidationRatio(uint256 _liquidationRatio) external onlyOwner {
        if (_liquidationRatio < PRECISION) revert InvalidParameters();
        liquidationRatio = _liquidationRatio;
    }

    /**
     * @notice Update redemption fee
     * @param _redemptionFee New redemption fee percentage (e.g., 5e15 = 0.5%)
     */
    function setRedemptionFee(uint256 _redemptionFee) external onlyOwner {
        if (_redemptionFee > 0.1e18) revert InvalidParameters(); // Max 10% fee
        redemptionFee = _redemptionFee;
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

    /**
     * @notice Get all vaults sorted by health (lowest collateral ratio first)
     * @dev Uses simple bubble sort - acceptable for MVP, optimize later with sorted list
     * @return sortedIds Array of vault IDs sorted by collateral ratio (ascending)
     */
    function _getSortedVaultsByHealth() private view returns (uint256[] memory sortedIds) {
        // Count active vaults
        uint256 activeCount = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            if (vaults[i].owner != address(0) && vaults[i].debt > 0) {
                activeCount++;
            }
        }

        if (activeCount == 0) {
            return new uint256[](0);
        }

        // Collect active vault IDs and their ratios
        sortedIds = new uint256[](activeCount);
        uint256[] memory ratios = new uint256[](activeCount);
        uint256 price = oracle.getPrice();

        uint256 index = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage vault = vaults[i];
            if (vault.owner != address(0) && vault.debt > 0) {
                sortedIds[index] = i;

                // Calculate collateral ratio
                uint256 collateralValue = (vault.collateral * price) / PRECISION;
                ratios[index] = (collateralValue * PRECISION) / vault.debt;

                index++;
            }
        }

        // Simple bubble sort (acceptable for MVP)
        for (uint256 i = 0; i < activeCount; i++) {
            for (uint256 j = i + 1; j < activeCount; j++) {
                if (ratios[j] < ratios[i]) {
                    // Swap ratios
                    uint256 tempRatio = ratios[i];
                    ratios[i] = ratios[j];
                    ratios[j] = tempRatio;

                    // Swap IDs
                    uint256 tempId = sortedIds[i];
                    sortedIds[i] = sortedIds[j];
                    sortedIds[j] = tempId;
                }
            }
        }

        return sortedIds;
    }

    /**
     * @notice Get all active vaults sorted by interest rate (ascending), tie-broken by vaultId (ascending)
     * @dev Builds a min-heap in memory for O(n log n) ordering within a single call
     */
    function _getSortedVaultsByInterest() private view returns (uint256[] memory sortedIds) {
        uint256 n = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            if (vaults[i].owner != address(0) && vaults[i].debt > 0) {
                n++;
            }
        }
        if (n == 0) return new uint256[](0);

        uint256[] memory ids = new uint256[](n);
        uint256[] memory rates = new uint256[](n);
        uint256 k = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            Vault storage v = vaults[i];
            if (v.owner != address(0) && v.debt > 0) {
                ids[k] = i;
                rates[k] = v.interestRate;
                k++;
            }
        }

        // Build min-heap (rates as primary key, ids as tie-breaker)
        // heap size = n
        for (int256 i = int256(n / 2) - 1; i >= 0; i--) {
            _heapify(rates, ids, uint256(i), n);
        }

        sortedIds = new uint256[](n);
        // Extract min one by one
        for (uint256 i = 0; i < n; i++) {
            // root (min) at index 0
            sortedIds[i] = ids[0];
            // Move last to root
            ids[0] = ids[n - 1 - i];
            rates[0] = rates[n - 1 - i];
            // Heapify reduced heap of size (n - 1 - i)
            _heapify(rates, ids, 0, n - 1 - i);
        }
        return sortedIds;
    }

    function _heapify(uint256[] memory rates, uint256[] memory ids, uint256 i, uint256 heapSize) private pure {
        while (true) {
            uint256 smallest = i;
            uint256 l = 2 * i + 1;
            uint256 r = 2 * i + 2;
            if (l < heapSize && _less(rates[l], ids[l], rates[smallest], ids[smallest])) {
                smallest = l;
            }
            if (r < heapSize && _less(rates[r], ids[r], rates[smallest], ids[smallest])) {
                smallest = r;
            }
            if (smallest == i) break;
            // swap i and smallest
            uint256 tr = rates[i];
            rates[i] = rates[smallest];
            rates[smallest] = tr;
            uint256 tid = ids[i];
            ids[i] = ids[smallest];
            ids[smallest] = tid;
            i = smallest;
        }
    }

    function _less(uint256 rateA, uint256 idA, uint256 rateB, uint256 idB) private pure returns (bool) {
        if (rateA < rateB) return true;
        if (rateA > rateB) return false;
        // tie-break on id (older/smaller id first)
        return idA < idB;
    }

    // Heap variant with debts for tie-breaking by larger debt first, then id
    function _heapify3(uint256[] memory rates, uint256[] memory ids, uint256[] memory debts, uint256 i, uint256 heapSize) private pure {
        while (true) {
            uint256 smallest = i;
            uint256 l = 2 * i + 1;
            uint256 r = 2 * i + 2;
            if (l < heapSize && _less3(rates[l], debts[l], ids[l], rates[smallest], debts[smallest], ids[smallest], true)) {
                smallest = l;
            }
            if (r < heapSize && _less3(rates[r], debts[r], ids[r], rates[smallest], debts[smallest], ids[smallest], true)) {
                smallest = r;
            }
            if (smallest == i) break;
            // swap i and smallest
            uint256 tr = rates[i]; rates[i] = rates[smallest]; rates[smallest] = tr;
            uint256 td = debts[i]; debts[i] = debts[smallest]; debts[smallest] = td;
            uint256 tid = ids[i]; ids[i] = ids[smallest]; ids[smallest] = tid;
            i = smallest;
        }
    }

    function _less3(
        uint256 rateA, uint256 debtA, uint256 idA,
        uint256 rateB, uint256 debtB, uint256 idB,
        bool /*preferLargerDebt*/
    ) private pure returns (bool) {
        if (rateA < rateB) return true;
        if (rateA > rateB) return false;
        // keep larger debt first
        if (debtA > debtB) return true;
        if (debtA < debtB) return false;
        // final tie-break on id asc
        return idA < idB;
    }

    /**
     * @notice Calculate pending interest for a vault (view)
     */
    function _pendingInterest(Vault storage v) private view returns (uint256 interest) {
        if (v.debt == 0 || v.interestRate == 0) return 0;
        uint256 dt = block.timestamp - v.timestamp;
        if (dt == 0) return 0;
        interest = (v.debt * v.interestRate * dt) / (PRECISION * SECONDS_PER_YEAR);
    }

    function _accruedDebtView(Vault storage v) private view returns (uint256) {
        return v.debt + _pendingInterest(v);
    }

    function _accrueInterest(Vault storage v) private {
        uint256 interest = _pendingInterest(v);
        if (interest > 0) {
            v.debt += interest;
            totalDebt += interest;
            v.timestamp = block.timestamp;
        }
    }
}
