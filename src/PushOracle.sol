// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/**
 * @title PushOracle
 * @notice Mock price oracle with staleness protection
 * @dev Owner can push price updates. Reverts if price data is stale.
 *      For production, replace with Chainlink, API3, or similar oracle solution.
 */
contract PushOracle {
    // =============================================================
    //                           STORAGE
    // =============================================================

    address public owner;

    /// @notice Current price in USD with 18 decimals (e.g., 2000e18 = $2000)
    uint256 public price;

    /// @notice Timestamp of the last price update
    uint256 public lastUpdateTime;

    /// @notice Maximum age in seconds before price is considered stale
    uint256 public stalenessThreshold;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event PriceUpdated(uint256 indexed newPrice, uint256 indexed timestamp, address indexed updater);
    event StalenessThresholdUpdated(uint256 indexed oldThreshold, uint256 indexed newThreshold);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error Unauthorized();
    error StalePrice();
    error InvalidPrice();
    error InvalidTimestamp();
    error InvalidThreshold();
    error ZeroAddress();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the oracle
     * @param _stalenessThreshold Maximum age in seconds for valid price data
     * @param _initialPrice Initial price to set (with 18 decimals)
     */
    constructor(uint256 _stalenessThreshold, uint256 _initialPrice) {
        if (_stalenessThreshold == 0) revert InvalidThreshold();
        if (_initialPrice == 0) revert InvalidPrice();

        owner = msg.sender;
        stalenessThreshold = _stalenessThreshold;
        price = _initialPrice;
        lastUpdateTime = block.timestamp;

        emit OwnershipTransferred(address(0), msg.sender);
        emit PriceUpdated(_initialPrice, block.timestamp, msg.sender);
        emit StalenessThresholdUpdated(0, _stalenessThreshold);
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // =============================================================
    //                      ORACLE FUNCTIONS
    // =============================================================

    /**
     * @notice Set a new price
     * @param _price New price in USD with 18 decimals
     * @param _timestamp Timestamp of the price update
     * @dev Only callable by owner. Timestamp must not be in the future.
     */
    function setPrice(uint256 _price, uint256 _timestamp) external onlyOwner {
        if (_price == 0) revert InvalidPrice();
        if (_timestamp > block.timestamp) revert InvalidTimestamp();
        if (_timestamp < lastUpdateTime) revert InvalidTimestamp();

        price = _price;
        lastUpdateTime = _timestamp;

        emit PriceUpdated(_price, _timestamp, msg.sender);
    }

    /**
     * @notice Get the current price if it's fresh
     * @return currentPrice The current price in USD with 18 decimals
     * @dev Reverts if price is stale
     */
    function getPrice() external view returns (uint256 currentPrice) {
        if (!isFresh()) revert StalePrice();
        return price;
    }

    /**
     * @notice Check if the current price is fresh
     * @return fresh True if price is within staleness threshold
     */
    function isFresh() public view returns (bool fresh) {
        return (block.timestamp - lastUpdateTime) <= stalenessThreshold;
    }

    /**
     * @notice Get the age of the current price
     * @return age Age in seconds since last update
     */
    function getPriceAge() external view returns (uint256 age) {
        return block.timestamp - lastUpdateTime;
    }

    /**
     * @notice Get price and metadata
     * @return currentPrice Current price
     * @return timestamp Last update timestamp
     * @return fresh Whether the price is fresh
     */
    function getPriceData()
        external
        view
        returns (uint256 currentPrice, uint256 timestamp, bool fresh)
    {
        return (price, lastUpdateTime, isFresh());
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Update the staleness threshold
     * @param _newThreshold New staleness threshold in seconds
     */
    function setStalenessThreshold(uint256 _newThreshold) external onlyOwner {
        if (_newThreshold == 0) revert InvalidThreshold();

        uint256 oldThreshold = stalenessThreshold;
        stalenessThreshold = _newThreshold;

        emit StalenessThresholdUpdated(oldThreshold, _newThreshold);
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
