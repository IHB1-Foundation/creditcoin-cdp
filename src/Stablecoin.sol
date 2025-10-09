// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/**
 * @title Stablecoin (rUSD)
 * @notice Protocol-controlled stablecoin with restricted minting and burning
 * @dev Only authorized contracts (VaultManager, StabilityPool) can mint/burn
 */
contract Stablecoin {
    // =============================================================
    //                           STORAGE
    // =============================================================

    string public constant name = "Reserve USD";
    string public constant symbol = "rUSD";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public totalSupply;

    // Access control
    address public owner;
    mapping(address => bool) public isMinter;
    mapping(address => bool) public isBurner;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event BurnerAdded(address indexed burner);
    event BurnerRemoved(address indexed burner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();
    error ZeroAmount();

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

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyBurner() {
        if (!isBurner[msg.sender]) revert Unauthorized();
        _;
    }

    // =============================================================
    //                      MINTING & BURNING
    // =============================================================

    /**
     * @notice Mint new rUSD tokens
     * @param to Address to receive minted tokens
     * @param amount Amount to mint
     * @dev Only callable by authorized minters (e.g., VaultManager)
     */
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        balanceOf[to] += amount;
        totalSupply += amount;

        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Burn rUSD tokens from an account
     * @param from Address to burn tokens from
     * @param amount Amount to burn
     * @dev Only callable by authorized burners (e.g., VaultManager, StabilityPool)
     */
    function burn(address from, uint256 amount) external onlyBurner {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Transfer(from, address(0), amount);
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
    //                      ACCESS CONTROL
    // =============================================================

    /**
     * @notice Add a new minter
     * @param minter Address to grant minting permissions
     */
    function addMinter(address minter) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        isMinter[minter] = true;
        emit MinterAdded(minter);
    }

    /**
     * @notice Remove a minter
     * @param minter Address to revoke minting permissions
     */
    function removeMinter(address minter) external onlyOwner {
        isMinter[minter] = false;
        emit MinterRemoved(minter);
    }

    /**
     * @notice Add a new burner
     * @param burner Address to grant burning permissions
     */
    function addBurner(address burner) external onlyOwner {
        if (burner == address(0)) revert ZeroAddress();
        isBurner[burner] = true;
        emit BurnerAdded(burner);
    }

    /**
     * @notice Remove a burner
     * @param burner Address to revoke burning permissions
     */
    function removeBurner(address burner) external onlyOwner {
        isBurner[burner] = false;
        emit BurnerRemoved(burner);
    }

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
