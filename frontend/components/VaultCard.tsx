'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatCard } from './ui/StatCard';
import { useAccount } from 'wagmi';
import { useUserVaults, useVaultData, useOpenVault, useAdjustVault, useCloseVault, useProtocolParams } from '@/hooks/useVault';
import { useTokenBalances, useAllowances, useApprove, useWrap } from '@/hooks/useTokens';
import { useOracle } from '@/hooks/useOracle';
import { CONTRACTS, PROTOCOL_PARAMS } from '@/lib/config';
import { formatBigInt, formatPercentage, formatUSD, parseToBigInt, getHealthStatus, calculateLiquidationPrice } from '@/lib/utils';
import toast from 'react-hot-toast';

export function VaultCard() {
  const { address, isConnected } = useAccount();
  const { vaultIds, refetch: refetchVaultIds } = useUserVaults();
  const { price } = useOracle();
  const { mcr } = useProtocolParams();

  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [mode, setMode] = useState<'open' | 'adjust' | 'close'>('open');

  // Form state
  const [collateralAmount, setCollateralAmount] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [collateralDelta, setCollateralDelta] = useState('');
  const [debtDelta, setDebtDelta] = useState('');
  const [isDeposit, setIsDeposit] = useState(true);
  const [isBorrow, setIsBorrow] = useState(true);

  const vaultId = vaultIds?.[selectedVaultIndex];
  const { vault, collateralRatio, refetch: refetchVault } = useVaultData(vaultId);
  const { wctcBalance, rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { wctcAllowance, rusdAllowance, refetch: refetchAllowances } = useAllowances(CONTRACTS.VAULT_MANAGER);

  const { openVault, isPending: isOpening, isSuccess: openSuccess } = useOpenVault();
  const { adjustVault, isPending: isAdjusting, isSuccess: adjustSuccess } = useAdjustVault();
  const { closeVault, isPending: isClosing, isSuccess: closeSuccess } = useCloseVault();
  const { approve, isPending: isApproving, isSuccess: approveSuccess } = useApprove();
  const { wrap, isPending: isWrapping, isSuccess: wrapSuccess } = useWrap();

  // Refetch data when transactions succeed
  useEffect(() => {
    if (openSuccess || adjustSuccess || closeSuccess || wrapSuccess || approveSuccess) {
      refetchVault();
      refetchVaultIds();
      refetchBalances();
      refetchAllowances();
    }
  }, [openSuccess, adjustSuccess, closeSuccess, wrapSuccess, approveSuccess]);

  // Reset form on success
  useEffect(() => {
    if (openSuccess) {
      setCollateralAmount('');
      setDebtAmount('');
      toast.success('Vault opened successfully!');
    }
  }, [openSuccess]);

  useEffect(() => {
    if (adjustSuccess) {
      setCollateralDelta('');
      setDebtDelta('');
      toast.success('Vault adjusted successfully!');
    }
  }, [adjustSuccess]);

  useEffect(() => {
    if (closeSuccess) {
      toast.success('Vault closed successfully!');
      setMode('open');
    }
  }, [closeSuccess]);

  const handleOpenVault = async () => {
    try {
      const collateral = parseToBigInt(collateralAmount);
      const debt = parseToBigInt(debtAmount);

      if (collateral === BigInt(0) || debt === BigInt(0)) {
        toast.error('Please enter valid amounts');
        return;
      }

      if (debt < PROTOCOL_PARAMS.MIN_DEBT) {
        toast.error(`Minimum debt is ${formatBigInt(PROTOCOL_PARAMS.MIN_DEBT)} rUSD`);
        return;
      }

      // Check if approval needed
      if (wctcAllowance === undefined || wctcAllowance < collateral) {
        toast('Approving wCTC...', { icon: '⏳' });
        await approve('wctc', CONTRACTS.VAULT_MANAGER, collateral * BigInt(2));
        return;
      }

      await openVault(collateral, debt);
    } catch (error) {
      // Error handling in hook
    }
  };

  const handleAdjustVault = async () => {
    if (!vaultId) return;

    try {
      const collatDelta = parseToBigInt(collateralDelta);
      const debtDelta = parseToBigInt(debtDelta);

      if (collatDelta === BigInt(0) && debtDelta === BigInt(0)) {
        toast.error('Please enter an amount to adjust');
        return;
      }

      // Check approvals
      if (isDeposit && collatDelta > BigInt(0)) {
        if (wctcAllowance === undefined || wctcAllowance < collatDelta) {
          toast('Approving wCTC...', { icon: '⏳' });
          await approve('wctc', CONTRACTS.VAULT_MANAGER, collatDelta * BigInt(2));
          return;
        }
      }

      if (!isBorrow && debtDelta > BigInt(0)) {
        if (rusdAllowance === undefined || rusdAllowance < debtDelta) {
          toast('Approving rUSD...', { icon: '⏳' });
          await approve('rusd', CONTRACTS.VAULT_MANAGER, debtDelta * BigInt(2));
          return;
        }
      }

      const finalCollatDelta = isDeposit ? collatDelta : -collatDelta;
      const finalDebtDelta = isBorrow ? debtDelta : -debtDelta;

      await adjustVault(vaultId, finalCollatDelta, finalDebtDelta);
    } catch (error) {
      // Error handling in hook
    }
  };

  const handleCloseVault = async () => {
    if (!vaultId || !vault) return;

    try {
      // Check rUSD approval
      if (rusdAllowance === undefined || rusdAllowance < vault.debt) {
        toast('Approving rUSD...', { icon: '⏳' });
        await approve('rusd', CONTRACTS.VAULT_MANAGER, vault.debt * BigInt(2));
        return;
      }

      await closeVault(vaultId);
    } catch (error) {
      // Error handling in hook
    }
  };

  const handleWrap = async () => {
    try {
      const amount = parseToBigInt(collateralAmount);
      if (amount === BigInt(0)) {
        toast.error('Please enter an amount to wrap');
        return;
      }

      await wrap(amount);
      toast.success('tCTC wrapped successfully!');
    } catch (error) {
      // Error handling in hook
    }
  };

  if (!isConnected) {
    return (
      <Card title="My Vaults" subtitle="Manage your collateralized positions">
        <div className="text-center py-12">
          <p className="text-gray-500">Connect your wallet to manage vaults</p>
        </div>
      </Card>
    );
  }

  const healthStatus = vault && collateralRatio && mcr ? getHealthStatus(collateralRatio, mcr) : null;
  const liquidationPrice = vault && mcr && price ? calculateLiquidationPrice(vault.collateral, vault.debt, mcr) : undefined;

  return (
    <Card title="My Vaults" subtitle={vaultIds && vaultIds.length > 0 ? `${vaultIds.length} vault(s)` : 'No vaults yet'}>
      {/* Vault Selector */}
      {vaultIds && vaultIds.length > 0 && (
        <div className="mb-6 flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Select Vault:</label>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            value={selectedVaultIndex}
            onChange={(e) => setSelectedVaultIndex(Number(e.target.value))}
          >
            {vaultIds.map((id, idx) => (
              <option key={idx} value={idx}>
                Vault #{id.toString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Vault Stats */}
      {vault && vaultId !== undefined && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Collateral"
            value={`${formatBigInt(vault.collateral)} wCTC`}
            subtitle={price ? formatUSD((vault.collateral * price) / PROTOCOL_PARAMS.PRECISION) : undefined}
          />
          <StatCard
            label="Debt"
            value={`${formatBigInt(vault.debt, 18, 2)} rUSD`}
            subtitle={formatUSD(vault.debt)}
          />
          <StatCard
            label="Health Factor"
            value={
              <span className={healthStatus?.color}>
                {collateralRatio ? formatPercentage(collateralRatio) : '--'}
              </span>
            }
            subtitle={healthStatus?.label}
          />
          <StatCard
            label="Liquidation Price"
            value={liquidationPrice ? formatUSD(liquidationPrice) : '--'}
            subtitle="Per wCTC"
          />
        </div>
      )}

      {/* Mode Selector */}
      <div className="mb-6 flex space-x-2 border-b border-gray-200">
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'open'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setMode('open')}
        >
          Open Vault
        </button>
        {vaultIds && vaultIds.length > 0 && (
          <>
            <button
              className={`px-4 py-2 font-medium transition-colors ${
                mode === 'adjust'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode('adjust')}
            >
              Adjust Vault
            </button>
            <button
              className={`px-4 py-2 font-medium transition-colors ${
                mode === 'close'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode('close')}
            >
              Close Vault
            </button>
          </>
        )}
      </div>

      {/* Open Vault Form */}
      {mode === 'open' && (
        <div className="space-y-4">
          <Input
            type="number"
            label="Collateral Amount (wCTC)"
            placeholder="0.0"
            value={collateralAmount}
            onChange={(e) => setCollateralAmount(e.target.value)}
            rightElement={
              <button
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                onClick={() => wctcBalance && setCollateralAmount(formatBigInt(wctcBalance, 18, 18))}
              >
                MAX
              </button>
            }
          />
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Available: {wctcBalance ? formatBigInt(wctcBalance) : '--'} wCTC</span>
            <Button size="sm" variant="secondary" onClick={handleWrap} isLoading={isWrapping}>
              Wrap tCTC
            </Button>
          </div>

          <Input
            type="number"
            label="Borrow Amount (rUSD)"
            placeholder="0.0"
            value={debtAmount}
            onChange={(e) => setDebtAmount(e.target.value)}
          />

          <Button
            className="w-full"
            onClick={handleOpenVault}
            isLoading={isOpening || isApproving}
          >
            {isApproving ? 'Approving...' : 'Open Vault'}
          </Button>
        </div>
      )}

      {/* Adjust Vault Form */}
      {mode === 'adjust' && vault && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Collateral</label>
              <div className="flex space-x-2">
                <button
                  className={`px-3 py-1 text-sm rounded ${
                    isDeposit ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}
                  onClick={() => setIsDeposit(true)}
                >
                  Deposit
                </button>
                <button
                  className={`px-3 py-1 text-sm rounded ${
                    !isDeposit ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}
                  onClick={() => setIsDeposit(false)}
                >
                  Withdraw
                </button>
              </div>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={collateralDelta}
              onChange={(e) => setCollateralDelta(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Debt</label>
              <div className="flex space-x-2">
                <button
                  className={`px-3 py-1 text-sm rounded ${
                    isBorrow ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}
                  onClick={() => setIsBorrow(true)}
                >
                  Borrow
                </button>
                <button
                  className={`px-3 py-1 text-sm rounded ${
                    !isBorrow ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}
                  onClick={() => setIsBorrow(false)}
                >
                  Repay
                </button>
              </div>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={debtDelta}
              onChange={(e) => setDebtDelta(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleAdjustVault}
            isLoading={isAdjusting || isApproving}
          >
            {isApproving ? 'Approving...' : 'Adjust Vault'}
          </Button>
        </div>
      )}

      {/* Close Vault Form */}
      {mode === 'close' && vault && (
        <div className="space-y-4">
          <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning font-medium">
              Closing this vault will repay all debt ({formatBigInt(vault.debt, 18, 2)} rUSD) and return all collateral ({formatBigInt(vault.collateral)} wCTC).
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">rUSD to repay:</span>
              <span className="font-semibold">{formatBigInt(vault.debt, 18, 2)} rUSD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Your rUSD balance:</span>
              <span className="font-semibold">{rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--'} rUSD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">wCTC to receive:</span>
              <span className="font-semibold text-success">{formatBigInt(vault.collateral)} wCTC</span>
            </div>
          </div>

          {rusdBalance && rusdBalance < vault.debt && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">
                Insufficient rUSD balance. Need {formatBigInt(vault.debt - rusdBalance, 18, 2)} more rUSD.
              </p>
            </div>
          )}

          <Button
            className="w-full"
            variant="danger"
            onClick={handleCloseVault}
            isLoading={isClosing || isApproving}
            disabled={rusdBalance !== undefined && rusdBalance < vault.debt}
          >
            {isApproving ? 'Approving...' : 'Close Vault'}
          </Button>
        </div>
      )}
    </Card>
  );
}
