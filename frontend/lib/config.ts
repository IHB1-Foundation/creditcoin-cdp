import { Chain } from 'viem';

// CreditCoin Testnet Chain Configuration
export const creditcoinTestnet: Chain = {
  id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '102031'),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'CreditCoin Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'tCTC',
    symbol: 'tCTC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network'],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network'],
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
  // Fallbacks populated from broadcast/Deploy.s.sol/102031/run-latest.json
  WCTC: (process.env.NEXT_PUBLIC_WCTC_ADDRESS || '0x17b0adcfee442c2e31065078510e87fba82ec603') as `0x${string}`,
  RUSD: (process.env.NEXT_PUBLIC_RUSD_ADDRESS || '0xcafc15c37dd4b0110d56841b8ee14df7e2bf29c9') as `0x${string}`,
  VAULT_MANAGER: (process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS || '0x4a2af59b957616980fe3a42cbef29a95366606de') as `0x${string}`,
  STABILITY_POOL: (process.env.NEXT_PUBLIC_STABILITY_POOL_ADDRESS || '0x19ca1c898617bbb05cb9dc4beb749387d5da9a0e') as `0x${string}`,
  LIQUIDATION_ENGINE: (process.env.NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS || '0xf7fe2d4e1991fa4a9c866ea0f9aa49a74c52fa66') as `0x${string}`,
  ORACLE: (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0xf0b6e7aa75819d093c5121fdfec0684b2e133ef1') as `0x${string}`,
  TREASURY: (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0x87e86fb2a311a66be378f3856ceef1dc6dd8f95e') as `0x${string}`,
} as const;

// Protocol Parameters
export const PROTOCOL_PARAMS = {
  PRECISION: BigInt(1e18),
  MIN_DEBT: BigInt(100) * BigInt(1e18), // 100 crdUSD
  DECIMALS: 18,
} as const;
