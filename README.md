# Credit CDP Protocol

A clean-room implementation of a collateralized debt position (CDP) protocol inspired by Liquity V2, built for London EVM compatibility on CreditCoin Testnet.

## Overview

Credit CDP allows users to:
- Deposit wCTC (wrapped tCTC) as collateral
- Borrow rUSD (stablecoin) against collateral
- Participate in the Stability Pool to earn liquidation rewards
- Liquidate under-collateralized vaults
- Redeem rUSD for wCTC collateral at oracle price

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design and component descriptions.

### Core Components

- **WCTC**: Wrapped tCTC token for use as collateral
- **Stablecoin (rUSD)**: Protocol-controlled stablecoin
- **VaultManager**: Core CDP logic for managing collateralized positions
- **StabilityPool**: Liquidation buffer that absorbs bad debt
- **LiquidationEngine**: Handles liquidation of unhealthy vaults
- **PushOracle**: Mock price oracle (replace with Chainlink/API3 in production)
- **Treasury**: Collects protocol fees and liquidation penalties

### Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Minimum Collateral Ratio (MCR) | 130% | Minimum collateral required |
| Liquidation Penalty | 5% | Bonus for liquidators |
| Borrowing Fee | 0.5% | Fee on new debt |
| Redemption Fee | 0.5% | Fee on redeemed collateral |
| Oracle Staleness Threshold | 1 hour | Max price age |

## London EVM Compatibility

This protocol is specifically designed for London EVM:
- Solidity version: 0.8.7
- EVM version: London
- No use of post-Merge features (e.g., `block.prevrandao`, transient storage, PUSH0, etc.)
- Uses `block.difficulty` instead of `prevrandao` for any entropy needs

## Installation

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+ (for frontend, if needed)
- Git

### Setup

```bash
# Clone the repository
cd credit-cdp

# Install Foundry dependencies
forge install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Add your private key, RPC URL, etc.
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
forge test

# Run with verbosity
forge test -vvv

# Run specific test
forge test --match-test testLiquidation

# Generate gas report
forge test --gas-report
```

All 25 tests should pass:
- WCTC wrap/unwrap functionality
- Oracle price updates and staleness checks
- Vault operations (open, adjust, close)
- Collateral ratio calculations
- Stability pool deposits and withdrawals
- Liquidations (single and batch)
- Redemptions (single/multiple vaults, fee calculation, edge cases)

## Deployment

### Local Deployment (Anvil)

```bash
# Start local node
anvil

# Deploy contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

### CreditCoin Testnet Deployment

```bash
# Ensure .env is configured with:
# - PRIVATE_KEY
# - RPC_URL (CreditCoin Testnet RPC)

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast

# Save the deployed addresses to .env
```

### Post-Deployment

1. **Update Oracle Price**: The oracle starts with a default price. Update it regularly:
   ```bash
   cast send $ORACLE_ADDRESS "setPrice(uint256,uint256)" 2000000000000000000000 $(date +%s) --rpc-url $RPC_URL --private-key $PRIVATE_KEY
   ```

2. **Verify Contracts**: If block explorer is available
   ```bash
   forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> --chain-id $CHAIN_ID --rpc-url $RPC_URL
   ```

3. **Test the Deployment**: Interact with contracts using cast
   ```bash
   # Wrap some tCTC
   cast send $WCTC_ADDRESS "wrap()" --value 1ether --rpc-url $RPC_URL --private-key $PRIVATE_KEY
   ```

## Usage Examples

### Opening a Vault

```solidity
// 1. Wrap native tCTC into wCTC
wctc.wrap{value: 10 ether}();

// 2. Approve VaultManager to spend wCTC
wctc.approve(address(vaultManager), 10 ether);

// 3. Open vault with 10 wCTC collateral, borrow 10,000 rUSD
uint256 vaultId = vaultManager.openVault(10 ether, 10_000e18);
```

### Depositing to Stability Pool

```solidity
// 1. Approve StabilityPool to spend rUSD
rusd.approve(address(stabilityPool), 5000e18);

// 2. Deposit rUSD
stabilityPool.deposit(5000e18);

// 3. Later, withdraw collateral gains
stabilityPool.withdrawCollateralGain();
```

### Liquidating a Vault

```solidity
// Check if vault can be liquidated
bool canLiquidate = vaultManager.canLiquidate(vaultId);

// Liquidate if underwater
if (canLiquidate) {
    liquidationEngine.liquidate(vaultId);
}
```

### Redeeming rUSD for Collateral

```solidity
// User has 10,000 rUSD and wants to redeem for wCTC
uint256 redemptionAmount = 10_000e18;

// Check how much wCTC they'll receive
uint256 estimatedWCTC = vaultManager.getRedeemableAmount(redemptionAmount);

// Approve and redeem
rusd.approve(address(vaultManager), redemptionAmount);
uint256 wctcReceived = vaultManager.redeem(redemptionAmount, msg.sender);

// wctcReceived = actual wCTC received (after 0.5% fee)
```

## Project Structure

```
credit-cdp/
├── src/
│   ├── WCTC.sol                 # Wrapped tCTC token
│   ├── Stablecoin.sol           # rUSD stablecoin
│   ├── PushOracle.sol           # Mock price oracle
│   ├── Treasury.sol             # Fee collection
│   ├── VaultManager.sol         # Core CDP logic
│   ├── StabilityPool.sol        # Liquidation buffer
│   ├── LiquidationEngine.sol    # Liquidation logic
│   └── interfaces/
│       └── IInterfaces.sol      # Shared interfaces
├── test/
│   └── CreditCDP.t.sol          # Comprehensive test suite
├── script/
│   └── Deploy.s.sol             # Deployment script
├── foundry.toml                  # Foundry configuration
├── ARCHITECTURE.md               # Architecture documentation
├── REDEMPTION_FEATURE.md         # Redemption mechanism docs
└── README.md                     # This file
```

## Security Considerations

**⚠️ WARNING: This is a clean-room implementation for educational/testing purposes.**

Before production deployment:

1. **Professional Audit**: Have the code audited by reputable security firms
2. **Oracle Upgrade**: Replace PushOracle with Chainlink, API3, or similar
3. **Governance**: Implement timelock and multi-sig controls
4. **Economic Modeling**: Test parameters under various market conditions
5. **Recovery Mode**: Consider adding global recovery mode for extreme events
6. **Reentrancy**: Review all external calls for reentrancy risks
7. **Integer Overflow**: Verify all arithmetic operations
8. **Access Control**: Review all privileged functions

## Known Limitations

1. **Stability Pool Accounting**: Individual depositor balances don't auto-decrease when debt is absorbed. Total pool balance is accurate, but requires snapshot system for proper per-depositor tracking.

2. **Oracle Centralization**: Uses a centralized push oracle. Production should use decentralized oracles.

3. **No Governance**: Protocol parameters are owner-controlled, not governance-controlled.

4. **No Redemptions**: Unlike Liquity, this implementation doesn't include redemption mechanism.

5. **Single Collateral**: Only supports wCTC as collateral.

## License

This is a clean-room implementation. All code is original and license-safe. No code or comments were copied from Liquity or other CDP protocols.

MIT License - See LICENSE file for details.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Support

For questions or issues:
- Open a GitHub issue
- Review the ARCHITECTURE.md for detailed design docs
- Check test files for usage examples

## Acknowledgments

Inspired by Liquity V2's architecture (conceptually, not code-wise). This is an independent, clean-room implementation.

---

**Built with London EVM compatibility in mind for CreditCoin Testnet**
