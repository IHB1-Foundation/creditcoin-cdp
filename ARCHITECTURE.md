# Credit CDP Protocol - Architecture Overview

## System Overview

Credit CDP is a clean-room implementation of a collateralized debt position (CDP) protocol inspired by Liquity V2, built for London EVM compatibility (CreditCoin Testnet).

### Core Concept

Users deposit wCTC (wrapped tCTC) as collateral to mint rUSD (stablecoin). The protocol ensures system solvency through:
- Minimum Collateral Ratio (MCR) enforcement
- Liquidation mechanism for under-collateralized vaults
- Stability Pool for absorbing liquidated debt
- Oracle-based price feeds

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│                     (Next.js Frontend)                           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Smart Contracts Layer                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐          ┌──────────────┐                     │
│  │   WCTC.sol   │◄─────────│ VaultManager │                     │
│  │ (Collateral) │          │     .sol     │                     │
│  └──────────────┘          └───────┬──────┘                     │
│                                    │                             │
│  ┌──────────────┐                  │                             │
│  │ Stablecoin   │◄─────────────────┤                             │
│  │   .sol       │                  │                             │
│  │   (rUSD)     │                  │                             │
│  └──────┬───────┘                  │                             │
│         │                          │                             │
│         │         ┌────────────────▼──────────┐                  │
│         │         │ LiquidationEngine.sol     │                  │
│         │         └────────┬──────────────────┘                  │
│         │                  │                                     │
│         │         ┌────────▼──────────┐                          │
│         └────────►│ StabilityPool.sol │                          │
│                   └───────────────────┘                          │
│                                                                   │
│  ┌──────────────┐          ┌──────────────┐                     │
│  │ PushOracle   │──────────│  Treasury    │                     │
│  │    .sol      │          │    .sol      │                     │
│  └──────────────┘          └──────────────┘                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Descriptions

### 1. WCTC.sol - Wrapped Collateral Token

**Purpose**: Wrap native tCTC into an ERC20 token for use as collateral

**Key Functions**:
- `wrap(uint256 amount)` - Deposit tCTC, receive wCTC 1:1
- `unwrap(uint256 amount)` - Burn wCTC, receive tCTC 1:1
- Standard ERC20 interface

**Design Notes**:
- Clean-room implementation (not copied from WETH)
- Simple deposit/withdraw pattern
- No fees or complexity

---

### 2. Stablecoin.sol - rUSD Token

**Purpose**: Protocol-controlled stablecoin (soft-pegged to $1 USD)

**Key Functions**:
- `mint(address to, uint256 amount)` - Only callable by VaultManager
- `burn(address from, uint256 amount)` - Only callable by VaultManager/StabilityPool
- Standard ERC20 interface

**Access Control**:
- Only authorized contracts can mint/burn
- VaultManager mints on borrow, burns on repay
- StabilityPool burns during liquidations

---

### 3. PushOracle.sol - Price Feed

**Purpose**: Provide wCTC/USD price with staleness protection

**Key Functions**:
- `setPrice(uint256 price, uint256 timestamp)` - Owner sets price
- `getPrice()` - Returns current price if not stale
- `isFresh()` - Check if price is within staleness threshold

**Parameters**:
- `stalenessThreshold` - Maximum age for valid price (e.g., 1 hour)

**Safety Features**:
- Reverts on stale data
- Owner-controlled for testnet (use Chainlink/API3 in production)
- Timestamp validation

---

### 4. VaultManager.sol - Core CDP Logic

**Purpose**: Create and manage collateralized debt positions

**Key Functions**:
- `openVault(uint256 collateralAmount, uint256 debtAmount)` - Create new vault
- `adjustVault(uint256 vaultId, int256 collateralDelta, int256 debtDelta)` - Modify position
- `closeVault(uint256 vaultId)` - Repay debt and withdraw collateral
- `getVaultHealth(uint256 vaultId)` - Calculate collateral ratio
- `redeem(uint256 rUSDAmount, address receiver)` - Redeem rUSD for wCTC from riskiest vaults
- `getRedeemableAmount(uint256 rUSDAmount)` - Estimate collateral for redemption
- `getRedemptionFee(uint256 collateralAmount)` - Calculate redemption fee

**Vault Structure**:
```solidity
struct Vault {
    address owner;
    uint256 collateral;  // wCTC amount
    uint256 debt;        // rUSD amount
    uint256 timestamp;   // Last update time
}
```

**Parameters**:
- `MCR` - Minimum Collateral Ratio (e.g., 130% = 1.3e18)
- `borrowingFee` - Fee on new debt (e.g., 0.5% = 5e15)
- `redemptionFee` - Fee on redeemed collateral (e.g., 0.5% = 5e15)

**Validation**:
- Enforce MCR on all operations
- Check oracle price for health calculations
- Prevent vault from becoming undercollateralized

---

### 5. LiquidationEngine.sol - Liquidation Logic

**Purpose**: Liquidate unhealthy vaults and distribute collateral

**Key Functions**:
- `liquidate(uint256 vaultId)` - Liquidate single vault
- `batchLiquidate(uint256[] vaultIds)` - Liquidate multiple vaults
- `canLiquidate(uint256 vaultId)` - Check if vault is liquidatable

**Liquidation Flow**:
1. Check vault health (collateral ratio < MCR)
2. Validate price is fresh
3. Transfer debt to Stability Pool
4. Apply liquidation penalty (e.g., 5%)
5. Distribute collateral to Stability Pool depositors
6. Send penalty to Treasury

**Parameters**:
- `liquidationPenalty` - Bonus collateral for liquidators (e.g., 5% = 5e16)

---

### 6. StabilityPool.sol - Liquidation Buffer

**Purpose**: Accept rUSD deposits to absorb liquidated debt

**Key Functions**:
- `deposit(uint256 amount)` - Deposit rUSD
- `withdraw(uint256 amount)` - Withdraw rUSD + accumulated wCTC
- `absorbDebt(uint256 debtAmount, uint256 collateralAmount)` - Process liquidation
- `getDepositorGains(address depositor)` - View wCTC gains

**Mechanism**:
- Users deposit rUSD
- During liquidations:
  - rUSD is burned to offset debt
  - wCTC collateral is distributed proportionally
- Depositors earn wCTC at discounted prices

**State Tracking**:
- Total rUSD deposited
- Individual deposit snapshots
- Cumulative collateral gains per depositor

---

### 7. Treasury.sol - Fee Collection

**Purpose**: Collect protocol fees and liquidation penalties

**Key Functions**:
- `collectFee(address token, uint256 amount)` - Receive fees
- `withdraw(address token, address to, uint256 amount)` - Owner withdrawal

**Revenue Sources**:
- Borrowing fees (on debt issuance)
- Liquidation penalties (portion of collateral)

---

## System Flows

### Flow 1: Opening a Vault

```
User
  │
  ├─► 1. Approve wCTC to VaultManager
  │
  ├─► 2. Call openVault(collateral, debt)
  │
VaultManager
  │
  ├─► 3. Transfer wCTC from user
  │
  ├─► 4. Check MCR with oracle price
  │
  ├─► 5. Calculate borrowing fee
  │
  ├─► 6. Mint rUSD to user
  │
  └─► 7. Emit VaultOpened event
```

### Flow 2: Liquidation

```
Liquidator
  │
  ├─► 1. Call liquidate(vaultId)
  │
LiquidationEngine
  │
  ├─► 2. Check vault health < MCR
  │
  ├─► 3. Get fresh price from oracle
  │
  ├─► 4. Calculate liquidation amounts
  │
  ├─► 5. Call StabilityPool.absorbDebt()
  │
StabilityPool
  │
  ├─► 6. Burn rUSD from pool
  │
  ├─► 7. Distribute wCTC to depositors
  │
  └─► 8. Emit Liquidated event
```

### Flow 3: Stability Pool Deposit

```
Depositor
  │
  ├─► 1. Approve rUSD to StabilityPool
  │
  ├─► 2. Call deposit(amount)
  │
StabilityPool
  │
  ├─► 3. Transfer rUSD from depositor
  │
  ├─► 4. Update deposit snapshot
  │
  ├─► 5. Track for liquidation distribution
  │
  └─► 6. Emit StabilityDeposit event
```

### Flow 4: Redemption

```
Redeemer
  │
  ├─► 1. Approve rUSD to VaultManager
  │
  ├─► 2. Call redeem(amount, receiver)
  │
VaultManager
  │
  ├─► 3. Sort vaults by collateral ratio (lowest first)
  │
  ├─► 4. For each vault (starting with riskiest):
  │     ├─► Skip if below MCR (liquidatable)
  │     ├─► Calculate debt to redeem
  │     ├─► Calculate collateral to return
  │     ├─► Reduce vault debt and collateral
  │     └─► Close vault if debt < MIN_DEBT
  │
  ├─► 5. Burn rUSD from redeemer
  │
  ├─► 6. Apply redemption fee
  │
  ├─► 7. Transfer net collateral to receiver
  │
  ├─► 8. Transfer fee to Treasury
  │
  └─► 9. Emit RedemptionExecuted event
```

---

## Key Parameters

| Parameter | Default Value | Description |
|-----------|--------------|-------------|
| MCR | 130% (1.3e18) | Minimum collateral ratio |
| Liquidation Penalty | 5% (5e16) | Bonus for liquidators |
| Borrowing Fee | 0.5% (5e15) | Fee on new debt (can be 0) |
| Redemption Fee | 0.5% (5e15) | Fee on redeemed collateral |
| Oracle Staleness | 1 hour (3600s) | Max price age |

---

## London EVM Compatibility Notes

### What We CANNOT Use:
- `block.prevrandao` (use `block.difficulty` instead)
- EIP-1153 transient storage
- EIP-3855 PUSH0 opcode
- EIP-5656 MCOPY opcode
- EIP-4844 blobs

### What We CAN Use:
- Solidity 0.8.7 (downgraded from 0.8.18 for maximum London EVM compatibility)
- EIP-1559 (`block.basefee`)
- Standard London hardfork features
- ChainID, standard opcodes

### Compiler Settings:
```toml
[profile.default]
solc_version = "0.8.7"
optimizer = true
optimizer_runs = 200
evm_version = "london"
```

---

## Security Considerations

1. **Oracle Dependency**: System relies on accurate price feeds
   - Implement staleness checks
   - Use multiple oracles in production

2. **Liquidation Incentives**: Must be profitable for liquidators
   - Penalty covers gas costs + profit margin
   - Monitor network congestion

3. **Stability Pool Solvency**: Must have sufficient rUSD to absorb debt
   - Monitor pool depth
   - Implement recovery mode if needed

4. **Reentrancy Protection**: Use checks-effects-interactions pattern
   - Consider ReentrancyGuard for critical functions

5. **Integer Overflow**: Use Solidity 0.8.x built-in checks
   - No unchecked blocks except where safe

6. **Access Control**: Restrict minting/burning to authorized contracts
   - Use role-based permissions

---

## Testing Strategy

### Unit Tests:
- WCTC wrap/unwrap functionality
- Stablecoin mint/burn permissions
- Oracle price updates and staleness
- Vault operations (open/adjust/close)
- Liquidation calculations
- Stability Pool accounting

### Integration Tests:
- End-to-end vault lifecycle
- Liquidation with stability pool
- Multi-vault scenarios
- Edge cases (dust amounts, maximum values)

### Invariant Tests:
- Total debt = sum of all vault debts
- Total collateral = sum of all vault collateral
- Stability pool solvency

---

## Deployment Order

1. Deploy WCTC (wrapper token)
2. Deploy Stablecoin (rUSD)
3. Deploy PushOracle
4. Deploy Treasury
5. Deploy VaultManager (with dependencies)
6. Deploy StabilityPool (with dependencies)
7. Deploy LiquidationEngine (with dependencies)
8. Configure permissions and parameters
9. Verify all contracts
10. Initialize oracle with initial price

---

## Frontend Requirements

### Key Features:
- Connect wallet (MetaMask)
- Display vault health and metrics
- Open/adjust/close vaults
- Deposit/withdraw from stability pool
- View liquidation opportunities
- Real-time price updates

### Contract Interactions:
- Direct RPC calls (no subgraph)
- Wagmi hooks for contract reads/writes
- Event listening for updates
- Error handling and user feedback

### UI Components:
- Vault dashboard
- Collateral ratio meter
- Liquidation price calculator
- Stability pool stats
- Transaction history

---

## License

This is a clean-room implementation. All code is original and license-safe.

**Important**: No code or comments from Liquity repositories were copied. Only architectural concepts were used as inspiration.
