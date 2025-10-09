import { http, createConfig } from 'wagmi';
import { creditcoinTestnet } from './config';
import { injected } from 'wagmi/connectors';

// Configure Wagmi
export const config = createConfig({
  chains: [creditcoinTestnet],
  connectors: [
    injected({
      // Broader detection (MetaMask and other injected wallets)
      shimDisconnect: true,
    }),
  ],
  transports: {
    [creditcoinTestnet.id]: http(
      (typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_RPC_URL || creditcoinTestnet.rpcUrls.default.http[0])
        : creditcoinTestnet.rpcUrls.default.http[0])
    ),
  },
  ssr: false,
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
