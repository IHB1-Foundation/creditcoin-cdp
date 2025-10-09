import { Chain } from 'viem';

// CreditCoin Testnet Chain Configuration
export const creditcoinTestnet: Chain = {
  id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '5555'),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'CreditCoin Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'tCTC',
    symbol: 'tCTC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545'],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Explorer',
      url: process.env.NEXT_PUBLIC_BLOCK_EXPLORER || 'https://explorer.creditcoin.org',
    },
  },
  testnet: true,
};

// Contract Addresses
export const CONTRACTS = {
  WCTC: (process.env.NEXT_PUBLIC_WCTC_ADDRESS || '0x') as `0x${string}`,
  RUSD: (process.env.NEXT_PUBLIC_RUSD_ADDRESS || '0x') as `0x${string}`,
  VAULT_MANAGER: (process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS || '0x') as `0x${string}`,
  STABILITY_POOL: (process.env.NEXT_PUBLIC_STABILITY_POOL_ADDRESS || '0x') as `0x${string}`,
  LIQUIDATION_ENGINE: (process.env.NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS || '0x') as `0x${string}`,
  ORACLE: (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0x') as `0x${string}`,
  TREASURY: (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0x') as `0x${string}`,
} as const;

// Protocol Parameters
export const PROTOCOL_PARAMS = {
  PRECISION: BigInt(1e18),
  MIN_DEBT: BigInt(100) * BigInt(1e18), // 100 crdUSD
  DECIMALS: 18,
} as const;
