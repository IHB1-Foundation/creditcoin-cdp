# Redemption Feature Documentation

## Overview

The redemption mechanism allows crdUSD holders to burn their stablecoins in exchange for wCTC collateral from existing vaults at oracle price, providing a crucial stability mechanism for the protocol.

## How Redemptions Work

### Basic Flow

1. **User burns crdUSD**: The redeemer burns crdUSD stablecoins from their balance
2. **Vault targeting**: Protocol identifies vaults with the lowest APR (interest rate)
3. **Collateral extraction**: Proportional wCTC collateral is removed from targeted vaults
4. **Fee application**: A redemption fee (default 0.5%) is applied on the collateral
5. **Transfer**: Net collateral (after fee) is sent to the receiver; fee goes to treasury

### Vault Selection Algorithm

Redemptions target vaults in ascending order of collateral ratio:
- **Lowest CR first**: Vaults closest to the Minimum Collateral Ratio (MCR) are redeemed from first
- **Skips liquidatable vaults**: Vaults below MCR are excluded from redemption
- **Multi-vault redemption**: Large redemptions can span multiple vaults

### Example Redemption

**Setup**:
- Oracle price: $2,000 per wCTC
- Vault A: 10 wCTC collateral, $14,070 debt → CR = 142%
- Vault B: 15 wCTC collateral, $16,080 debt → CR = 186%
- Redemption fee: 0.5%

**User redeems 5,000 crdUSD**:
1. Protocol targets Vault A (lowest CR)
2. Calculates collateral needed: 5,000 / 2,000 = 2.5 wCTC
3. Applies fee: 2.5 * 0.5% = 0.0125 wCTC fee
4. User receives: 2.5 - 0.0125 = 2.4875 wCTC
5. Treasury receives: 0.0125 wCTC
6. Vault A updated: 7.5 wCTC collateral, $9,070 debt → new CR = 165%

## Key Functions

### Core Redemption Function

```solidity
function redeem(uint256 rUSDAmount, address receiver)
    external
    returns (uint256 collateralRedeemed)
```

**Parameters**:
- `rUSDAmount`: Amount of crdUSD to burn for redemption
- `receiver`: Address to receive the redeemed wCTC

**Returns**:
- `collateralRedeemed`: Total wCTC sent to receiver (after fee)

**Events**:
- `RedemptionExecuted(redeemer, receiver, rUSDAmount, wCTCReceived, feeAmount)`
- `VaultRedeemed(vaultId, debtRedeemed, collateralRedeemed)` - emitted for each vault affected

### Helper Functions

#### Estimate Redeemable Amount

```solidity
function getRedeemableAmount(uint256 rUSDAmount)
    external
    view
    returns (uint256 estimatedCollateral)
```

Returns estimated wCTC the user will receive (after fee) for a given crdUSD redemption amount.

#### Calculate Redemption Fee

```solidity
function getRedemptionFee(uint256 collateralAmount)
    external
    view
    returns (uint256 fee)
```

Returns the fee (in wCTC) for redeeming a given amount of collateral.

### Admin Function

```solidity
function setRedemptionFee(uint256 _redemptionFee) external onlyOwner
```

Updates the redemption fee percentage (max 10%).

## Edge Cases & Safety Features

### 1. Vault Closure on Low Debt

If redemption reduces a vault's debt below `MIN_DEBT` (100 crdUSD):
- The vault is automatically closed
- Remaining collateral is returned to the vault owner
- `VaultClosed` event is emitted

### 2. Liquidatable Vault Protection

Vaults below MCR are skipped during redemption:
- Prevents redemption from unhealthy vaults
- These vaults should be liquidated instead
- Ensures fair treatment of vault owners

### 3. Insufficient Redeemable Vaults

If no healthy vaults exist or redemption amount is too large:
- Transaction reverts with `InsufficientRedeemableVaults` error
- Partial redemptions are allowed (redeems what's available)

### 4. Zero Amount/Address Validation

- Reverts on zero crdUSD amount: `ZeroAmount` error
- Reverts on zero receiver address: `ZeroAddress` error

## Economic Impact

### For Redeemers

**Benefits**:
- Arbitrage opportunity when crdUSD trades below peg
- Exit mechanism for large crdUSD holders
- Price-efficient collateral acquisition

**Costs**:
- Redemption fee (0.5% default)
- Gas costs
- Slippage if multiple redemptions occur simultaneously

### For Vault Owners

**Impact**:
- Vaults with lowest CR are targeted first
- Encourages maintaining higher collateral ratios
- Vault can be partially or fully redeemed
- Automatic closure if debt falls below minimum

**Mitigation**:
- Maintain CR well above MCR to avoid being targeted
- Monitor redemption activity
- Adjust collateral/debt proactively

### For Protocol

**Benefits**:
- Natural peg restoration mechanism
- Revenue from redemption fees
- Improves overall system health by targeting riskier vaults

## Parameters

| Parameter | Default Value | Range | Description |
|-----------|--------------|-------|-------------|
| `redemptionFee` | 0.5% (5e15) | 0-10% | Fee on redeemed collateral |
| `MIN_DEBT` | 100 crdUSD | Fixed | Minimum vault debt threshold |
| `MCR` | 130% (1.3e18) | >100% | Minimum Collateral Ratio |

## Integration Examples

### Basic Redemption

```solidity
// User wants to redeem 10,000 crdUSD for wCTC
uint256 redemptionAmount = 10_000e18;

// Approve VaultManager to burn crdUSD
rusd.approve(address(vaultManager), redemptionAmount);

// Perform redemption
uint256 collateralReceived = vaultManager.redeem(
    redemptionAmount,
    msg.sender // Receive wCTC in same address
);

// collateralReceived = amount of wCTC received (after fee)
```

### Estimate Before Redeeming

```solidity
// Check how much wCTC you'll receive before redeeming
uint256 redemptionAmount = 10_000e18;
uint256 estimatedWCTC = vaultManager.getRedeemableAmount(redemptionAmount);

// Check the fee
uint256 price = oracle.getPrice();
uint256 grossCollateral = (redemptionAmount * 1e18) / price;
uint256 fee = vaultManager.getRedemptionFee(grossCollateral);

// Decide if redemption is worthwhile
if (estimatedWCTC >= minAcceptableAmount) {
    rusd.approve(address(vaultManager), redemptionAmount);
    vaultManager.redeem(redemptionAmount, msg.sender);
}
```

### Separate Receiver

```solidity
// Redeem to a different address (e.g., cold wallet)
address coldWallet = 0x...;

rusd.approve(address(vaultManager), redemptionAmount);
vaultManager.redeem(redemptionAmount, coldWallet);
```

## Test Coverage

The redemption feature includes comprehensive tests:

1. ✅ **testRedemptionSingleVault**: Basic redemption from one vault
2. ✅ **testRedemptionMultipleVaults**: Redemption spanning multiple vaults
3. ✅ **testRedemptionTargetsLowestCR**: Verifies correct vault targeting
4. ✅ **testRedemptionFeeCalculation**: Fee calculation accuracy
5. ✅ **testRedemptionSkipsLiquidatableVaults**: Skips unhealthy vaults
6. ✅ **testRedemptionRevertsOnZeroAmount**: Zero amount validation
7. ✅ **testRedemptionRevertsOnZeroAddress**: Zero address validation
8. ✅ **testRedemptionClosesVaultBelowMinDebt**: Auto-closure behavior
9. ✅ **testSetRedemptionFee**: Admin fee updates
10. ✅ **testRedemptionEstimateAccuracy**: Estimate function accuracy

All tests pass with Solidity 0.8.7 and London EVM compatibility.

## Security Considerations

### Reentrancy Protection

- Uses checks-effects-interactions pattern
- State updates before external calls
- Burns crdUSD before transferring collateral

### Price Oracle Dependency

- Always uses fresh oracle price
- Reverts if oracle is stale
- Prevents manipulation via stale prices

### Vault Ordering Efficiency

- Current implementation: O(n²) bubble sort
- Acceptable for MVP with small vault count
- Consider upgrading to sorted tree for production

### Front-Running Considerations

- Redemptions are public and visible in mempool
- Large redemptions can be front-run
- Consider implementing:
  - Minimum collateral received parameter
  - Time-weighted redemption fees
  - Rate limiting for large redemptions

## Future Improvements

1. **Optimized Sorting**: Replace bubble sort with sorted tree or heap
2. **Partial Redemption Limits**: Add max redemption per vault
3. **Dynamic Fees**: Base fee on redemption size or frequency
4. **Redemption Queue**: FIFO queue for fair ordering
5. **Flash Loan Protection**: Prevent flash loan attacks on redemptions
6. **Multi-collateral Support**: When adding new collateral types

## Comparison with Liquity V2

**Similarities**:
- Targets lowest CR vaults first
- Burns stablecoin, returns collateral
- Applies redemption fee
- Skips liquidatable vaults

**Differences**:
- Simplified vault ordering (bubble sort vs. sorted list)
- Fixed fee vs. dynamic fee based on base rate
- No redemption cool-down period
- Simpler implementation for MVP

## London EVM Compatibility

The redemption mechanism is fully compatible with London EVM:
- ✅ No use of `block.prevrandao`
- ✅ No transient storage (EIP-1153)
- ✅ No PUSH0 opcode (EIP-3855)
- ✅ Solidity 0.8.7 compatible
- ✅ Uses standard ERC20 operations
- ✅ Compatible with Foundry testing framework

---

**Implementation Status**: ✅ Complete and Tested
**Solidity Version**: 0.8.7
**Test Suite**: 10/10 passing
**EVM Target**: London
**Last Updated**: October 9, 2025
