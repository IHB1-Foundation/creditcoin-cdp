'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from './ui/Button';
import { shortenAddress } from '@/lib/utils';
import { useTokenBalances } from '@/hooks/useTokens';
import { formatBigInt } from '@/lib/utils';

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { wctcBalance, rusdBalance } = useTokenBalances();

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Credit CDP</h1>
              <p className="text-xs text-gray-500">CreditCoin Testnet</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {isConnected && address && (
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-gray-50 rounded-lg">
                <div className="text-right">
                  <p className="text-xs text-gray-500">wCTC</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {wctcBalance !== undefined ? formatBigInt(wctcBalance, 18, 4) : '--'}
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-300" />
                <div className="text-right">
                  <p className="text-xs text-gray-500">rUSD</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {rusdBalance !== undefined ? formatBigInt(rusdBalance, 18, 2) : '--'}
                  </p>
                </div>
              </div>
            )}

            {isConnected && address ? (
              <div className="flex items-center space-x-2">
                <div className="px-3 py-2 bg-primary-50 rounded-lg">
                  <p className="text-sm font-medium text-primary-700">{shortenAddress(address)}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => disconnect()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => {
                  const injectedConnector = connectors.find((c) => c.id === 'injected');
                  if (injectedConnector) {
                    connect({ connector: injectedConnector });
                  }
                }}
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
