// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

/**
 * @title Treasury
 * @notice Collects protocol fees and liquidation penalties
 * @dev Simple treasury contract for collecting and managing protocol revenue
 */
contract Treasury {
    // =============================================================
    //                           STORAGE
    // =============================================================

    address public owner;

    // Track collected fees per token
    mapping(address => uint256) public collectedFees;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event FeeCollected(address indexed token, uint256 amount, address indexed from);
    event Withdrawal(address indexed token, address indexed to, uint256 amount);
    event NativeWithdrawal(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error InsufficientBalance();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // =============================================================
    //                      FEE COLLECTION
    // =============================================================

    /**
     * @notice Collect fees in ERC20 tokens
     * @param token Token address to collect
     * @param amount Amount to collect
     * @dev Caller must have approved this contract first
     */
    function collectFee(address token, uint256 amount) external {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        collectedFees[token] += amount;

        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount)
        );

        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit FeeCollected(token, amount, msg.sender);
    }

    /**
     * @notice Receive native token fees
     */
    receive() external payable {
        if (msg.value > 0) {
            collectedFees[address(0)] += msg.value;
            emit FeeCollected(address(0), msg.value, msg.sender);
        }
    }

    // =============================================================
    //                        WITHDRAWALS
    // =============================================================

    /**
     * @notice Withdraw ERC20 tokens from treasury
     * @param token Token address to withdraw
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (collectedFees[token] < amount) revert InsufficientBalance();

        collectedFees[token] -= amount;

        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );

        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit Withdrawal(token, to, amount);
    }

    /**
     * @notice Withdraw native tokens from treasury
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawNative(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (collectedFees[address(0)] < amount) revert InsufficientBalance();

        collectedFees[address(0)] -= amount;

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit NativeWithdrawal(to, amount);
    }

    // =============================================================
    //                      VIEW FUNCTIONS
    // =============================================================

    /**
     * @notice Get collected fees for a token
     * @param token Token address (address(0) for native)
     * @return amount Amount of fees collected
     */
    function getCollectedFees(address token) external view returns (uint256 amount) {
        return collectedFees[token];
    }

    /**
     * @notice Get actual balance of a token in the treasury
     * @param token Token address (address(0) for native)
     * @return balance Actual balance held
     */
    function getBalance(address token) external view returns (uint256 balance) {
        if (token == address(0)) {
            return address(this).balance;
        }

        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );

        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }

        return 0;
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
