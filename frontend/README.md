# Credit CDP Frontend

A modern, minimal, and fully functional frontend for the Credit CDP Protocol built with Next.js 14, TypeScript, Wagmi, and TailwindCSS.

## Features

- ✅ **Vault Management**: Open, adjust, and close collateralized vaults
- ✅ **Stability Pool**: Deposit crdUSD and earn liquidation rewards
- ✅ **Redemption**: Burn crdUSD to receive wCTC at oracle price
- ✅ **Real-time Data**: Direct contract reads, no subgraph needed
- ✅ **Wallet Integration**: MetaMask support via Wagmi
- ✅ **Responsive Design**: Mobile-friendly TailwindCSS UI
- ✅ **Transaction Handling**: Toast notifications for all states
- ✅ **London EVM Compatible**: Built for CreditCoin Testnet

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Blockchain**: Wagmi v2 + Viem
- **Styling**: TailwindCSS
- **State Management**: TanStack Query (React Query)
- **Notifications**: React Hot Toast

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- MetaMask browser extension
- CreditCoin Testnet RPC access

## Installation

```bash
# Clone the repository
cd credit-cdp/frontend

# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

## Configuration

1. Copy the environment template:
```bash
cp .env.example .env.local
```

2. Update `.env.local` with your configuration:

```env
# CreditCoin Testnet Configuration
NEXT_PUBLIC_CHAIN_ID=5555
NEXT_PUBLIC_CHAIN_NAME="CreditCoin Testnet"
NEXT_PUBLIC_RPC_URL=https://creditcoin-testnet.rpc.url
NEXT_PUBLIC_BLOCK_EXPLORER=https://creditcoin-testnet.explorer.url

# Contract Addresses (from deployment)
NEXT_PUBLIC_WCTC_ADDRESS=0x...
NEXT_PUBLIC_RUSD_ADDRESS=0x...
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_STABILITY_POOL_ADDRESS=0x...
NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS=0x...
NEXT_PUBLIC_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_TREASURY_ADDRESS=0x...
```

3. Deploy contracts using the backend scripts:
```bash
cd ../
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

4. Update contract addresses in `.env.local` from deployment output

## Development

```bash
# Start development server
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

```bash
# Create production build
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard page
│   ├── providers.tsx      # Wagmi & React Query providers
│   └── globals.css        # Global styles + Tailwind
├── components/            # React components
│   ├── Header.tsx         # Wallet connection header
│   ├── OracleInfo.tsx     # System info card
│   ├── VaultCard.tsx      # Vault management
│   ├── StabilityPoolCard.tsx  # Stability pool interface
│   ├── RedemptionCard.tsx # Redemption interface
│   └── ui/                # Reusable UI components
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Input.tsx
│       └── StatCard.tsx
├── hooks/                 # Custom React hooks
│   ├── useVault.ts        # Vault operations
│   ├── useStabilityPool.ts # Stability pool ops
│   ├── useRedemption.ts   # Redemption ops
│   ├── useTokens.ts       # Token balances & approvals
│   ├── useOracle.ts       # Oracle price data
│   └── useLiquidation.ts  # Liquidation ops
├── lib/                   # Utilities & config
│   ├── config.ts          # Chain & contract config
│   ├── utils.ts           # Helper functions
│   ├── wagmi.ts           # Wagmi configuration
│   └── abis/              # Contract ABIs
│       ├── VaultManager.ts
│       ├── StabilityPool.ts
│       ├── ERC20.ts
│       ├── WCTC.ts
│       ├── PushOracle.ts
│       └── LiquidationEngine.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Usage Guide

### 1. Connect Wallet

Click "Connect Wallet" in the header to connect MetaMask to CreditCoin Testnet.

### 2. Wrap tCTC to wCTC

Before opening a vault, you need wCTC collateral:
1. In the Vault Card, click "Wrap tCTC"
2. Enter the amount of native tCTC to wrap
3. Confirm the transaction

### 3. Open a Vault

1. Navigate to the "Open Vault" tab
2. Enter collateral amount (wCTC)
3. Enter debt amount (crdUSD to borrow)
4. Click "Open Vault"
5. Approve wCTC if needed (first time)
6. Confirm the transaction

### 4. Adjust Your Vault

1. Select your vault from the dropdown
2. Go to "Adjust Vault" tab
3. Choose to deposit/withdraw collateral
4. Choose to borrow/repay debt
5. Enter amounts and confirm

### 5. Participate in Stability Pool

1. Navigate to the Stability Pool card
2. Click "Deposit" tab
3. Enter crdUSD amount
4. Click "Deposit"
5. Approve crdUSD if needed
6. Claim wCTC gains when available

### 6. Redeem crdUSD for wCTC

1. Navigate to the Redemption card
2. Enter crdUSD amount to redeem
3. Review the estimated wCTC you'll receive
4. Click "Redeem"
5. Approve crdUSD if needed
6. Confirm the transaction

## Key Features Explained

### Vault Management

- **Health Factor**: Shows your collateral ratio (green = safe, yellow = at risk, red = liquidatable)
- **Liquidation Price**: The wCTC price at which your vault becomes liquidatable
- **Minimum Debt**: 100 crdUSD minimum to open/maintain a vault

### Stability Pool

- **Rewards**: Earn wCTC collateral from liquidated vaults
- **Pool Share**: Your percentage of the total stability pool
- **Claim Anytime**: Withdraw your collateral gains whenever you want

### Redemption

- **Fee**: 0.5% default redemption fee on collateral received
- **Targeting**: Redeems from vaults with lowest collateral ratio first
- **Oracle Price**: Uses real-time oracle price for redemption rate

## Troubleshooting

### "Oracle price is stale" Warning

The oracle hasn't been updated recently. Transactions may fail until the price is refreshed.

### "Insufficient collateral ratio" Error

Your vault would fall below the Minimum Collateral Ratio (130%). Add more collateral or borrow less.

### "User rejected transaction"

You cancelled the transaction in MetaMask.

### "Insufficient funds"

You don't have enough tokens or native currency for gas fees.

## Smart Contract Addresses

Update these in your `.env.local` file after deployment:

- **WCTC**: Wrapped tCTC token
- **Stablecoin**: crdUSD token
- **VaultManager**: Main vault operations
- **StabilityPool**: Stability pool contract
- **LiquidationEngine**: Liquidation logic
- **Oracle**: Price feed (PushOracle)
- **Treasury**: Fee collection

## Development Tips

### Adding New Features

1. Add hooks in `/hooks` directory
2. Create components in `/components`
3. Update ABIs in `/lib/abis` if needed
4. Use the `Button`, `Card`, `Input` components for consistency

### Debugging

```bash
# Type checking
npm run type-check

# Linting
npm run lint
```

### Testing MetaMask Connection

1. Open MetaMask
2. Add CreditCoin Testnet manually:
   - Network Name: CreditCoin Testnet
   - RPC URL: (from env)
   - Chain ID: (from env)
   - Currency Symbol: tCTC

## Performance Optimization

- Data auto-refreshes every 30 seconds (oracle)
- Transactions auto-update relevant data on success
- No redundant contract calls
- Optimistic UI updates where possible

## Security Notes

⚠️ **This is a testnet deployment for educational purposes**

- Never use mainnet private keys for testnets
- Always verify contract addresses
- Test with small amounts first
- Monitor oracle price freshness

## License

MIT

## Support

For issues or questions:
- Check the main protocol documentation
- Review the contract source code
- Submit an issue on GitHub

---

**Built for London EVM • CreditCoin Testnet • Clean-room Implementation**
