'use client';

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { Button } from './ui/Button';
import { shortenAddress } from '@/lib/utils';
import { useTokenBalances } from '@/hooks/useTokens';
import { useInterestStats, useUserVaults } from '@/hooks/useVault';
import { useReadContract } from 'wagmi';
import { useEffect, useState } from 'react';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { VaultManagerABI } from '@/lib/abis/VaultManager';
import { Tooltip } from './ui/Tooltip';
import { formatBigInt } from '@/lib/utils';

export function Header() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { tctcBalance, rusdBalance } = useTokenBalances();
  const { minRate, weightedAvgRate, maxRate } = useInterestStats();
  const { vaultIds } = useUserVaults();
  // Auto-switch chain when connected but on wrong chain
  const { switchChainAsync } = useSwitchChain();
  const targetId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '102031');
  useEffect(() => {
    if (isConnected && !isNaN(targetId) && chainId !== targetId) {
      (async () => {
        try {
          await switchChainAsync({ chainId: targetId });
        } catch {}
      })();
    }
  }, [isConnected, chainId]);

  // Read currently selected vault id from localStorage client-side only
  const [selectedVaultId, setSelectedVaultId] = useState<bigint | undefined>(undefined);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('selectedVaultId');
    if (stored) {
      try {
        setSelectedVaultId(BigInt(stored));
      } catch {}
    }
  }, [vaultIds?.length]);
  const { data: currentVaultInterest } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultInterest',
    args: selectedVaultId !== undefined ? [selectedVaultId] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: !!selectedVaultId,
    },
  });

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200/80 shadow-sm">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/logo.svg" alt="Credit CDP" width={40} height={40} className="rounded-lg shadow-sm" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Credit CDP</h1>
              <p className="text-xs text-gray-500">CreditCoin Testnet</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {minRate !== undefined && (
              <Tooltip
                content={
                  <span>
                    Min: {(Number(minRate) * 100 / 1e18).toFixed(2)}% {weightedAvgRate !== undefined ? `• Weighted Avg: ${(Number(weightedAvgRate) * 100 / 1e18).toFixed(2)}%` : ''} {maxRate !== undefined ? `• Max: ${(Number(maxRate) * 100 / 1e18).toFixed(2)}%` : ''}
                    {currentVaultInterest !== undefined ? ` • Current: ${(Number(currentVaultInterest as bigint) * 100 / 1e18).toFixed(2)}%` : ''}
                  </span>
                }
              >
                <div className="hidden md:flex items-center px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-700 cursor-default">
                  APR: <span className="ml-1 font-medium">{(Number(minRate) * 100 / 1e18).toFixed(2)}%</span>
                  {weightedAvgRate !== undefined && (
                    <>
                      <span className="mx-1">•</span>
                      <span className="font-medium">{(Number(weightedAvgRate) * 100 / 1e18).toFixed(2)}%</span>
                    </>
                  )}
                  {currentVaultInterest !== undefined && (
                    <>
                      <span className="mx-1">•</span>
                      <span className="font-medium">{(Number(currentVaultInterest as bigint) * 100 / 1e18).toFixed(2)}%</span>
                    </>
                  )}
                </div>
              </Tooltip>
            )}
            {isConnected && address && (
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-right">
                  <p className="text-xs text-gray-500">tCTC</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {tctcBalance !== undefined ? formatBigInt(tctcBalance, 18, 4) : '--'}
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
                onClick={async () => {
                  // Prefer a ready connector, else first available
                  const ready = connectors.find((c) => (c as any).ready);
                  const fallback = connectors[0];
                  const connector = ready || fallback;
                  if (connector) {
                    try {
                      const res = await connect({ connector });
                      // Ensure correct chain after connect
                      const targetId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '102031');
                      if (!isNaN(targetId) && chainId !== targetId) {
                        try {
                          await switchChainAsync({ chainId: targetId });
                        } catch {}
                      }
                    } catch (e) {
                      // If no injected provider, open MetaMask install
                      if (typeof window !== 'undefined') {
                        window.open('https://metamask.io/download', '_blank');
                      }
                    }
                  } else if (typeof window !== 'undefined') {
                    window.open('https://metamask.io/download', '_blank');
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
