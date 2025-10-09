'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from './ui/Button';
import { shortenAddress } from '@/lib/utils';
import { useTokenBalances } from '@/hooks/useTokens';
import { useInterestStats } from '@/hooks/useVault';
import { formatBigInt } from '@/lib/utils';

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { wctcBalance, rusdBalance } = useTokenBalances();
  const { minRate } = useInterestStats();

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200/80 shadow-sm">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Credit CDP</h1>
              <p className="text-xs text-gray-500">CreditCoin Testnet</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {minRate !== undefined && (
              <div className="hidden md:flex items-center px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-700">
                Lowest APR: <span className="ml-1 font-medium">{(Number(minRate) * 100 / 1e18).toFixed(2)}%</span>
              </div>
            )}
            {isConnected && address && (
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-right">
                  <p className="text-xs text-gray-500">wCTC</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {wctcBalance !== undefined ? formatBigInt(wctcBalance, 18, 4) : '--'}
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-300" />
                <div className="text-right">
                  <p className="text-xs text-gray-500">crdUSD</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {rusdBalance !== undefined ? formatBigInt(rusdBalance, 18, 2) : '--'}
                  </p>
                </div>
              </div>
            )}

            {isConnected && address ? (
              <div className="flex items-center space-x-2">
                <div className="px-3 py-2 bg-primary-50 rounded-lg border border-primary-100">
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
