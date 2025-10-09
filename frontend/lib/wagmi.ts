import { http, createConfig } from 'wagmi';
import { creditcoinTestnet } from './config';
import { injected } from 'wagmi/connectors';

// Configure Wagmi
export const config = createConfig({
  chains: [creditcoinTestnet],
  connectors: [
    injected({
      target: 'metaMask',
    }),
  ],
  transports: {
    [creditcoinTestnet.id]: http(),
  },
  ssr: false,
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
