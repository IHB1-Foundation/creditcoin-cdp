// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/**
 * @title WCTC - Wrapped CreditCoin Token
 * @notice Clean-room implementation of a wrapper for native tCTC
 * @dev Allows users to wrap native tCTC into an ERC20 token for use as collateral
 */
contract WCTC {
    // =============================================================
    //                           STORAGE
    // =============================================================

    string public name = "Wrapped CreditCoin";
    string public symbol = "wCTC";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public totalSupply;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferFailed();
    error ZeroAddress();

    // =============================================================
    //                      WRAPPING FUNCTIONS
    // =============================================================

    /**
     * @notice Wrap native tCTC into wCTC tokens
     * @dev Accepts native tCTC and mints 1:1 wCTC to the sender
     */
    function wrap() external payable {
        if (msg.value == 0) revert InsufficientBalance();

        balanceOf[msg.sender] += msg.value;
        totalSupply += msg.value;

        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    /**
     * @notice Unwrap wCTC tokens back to native tCTC
     * @param amount Amount of wCTC to unwrap
     * @dev Burns wCTC and sends native tCTC to the sender
     */
    function unwrap(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;

        emit Withdrawal(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // =============================================================
    //                      ERC20 FUNCTIONS
    // =============================================================

    /**
     * @notice Approve spender to transfer tokens on behalf of caller
     * @param spender Address authorized to spend
     * @param amount Amount of tokens to approve
     * @return success True if approval succeeded
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfer tokens to another address
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return success True if transfer succeeded
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Transfer tokens from one address to another using allowance
     * @param from Source address
     * @param to Destination address
     * @param amount Amount to transfer
     * @return success True if transfer succeeded
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // =============================================================
    //                      RECEIVE FUNCTION
    // =============================================================

    /**
     * @notice Receive function to accept native tCTC
     * @dev Automatically wraps received tCTC
     */
    receive() external payable {
        balanceOf[msg.sender] += msg.value;
        totalSupply += msg.value;

        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }
}
