'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatCard } from './ui/StatCard';
import { Tooltip } from './ui/Tooltip';
import { InfoIcon } from './ui/InfoIcon';
import { useAccount, useWriteContract } from 'wagmi';
import { useUserVaults, useVaultData, useOpenVault, useAdjustVault, useCloseVault, useProtocolParams, useUpdateInterest } from '@/hooks/useVault';
import { Skeleton } from './ui/Skeleton';
import { useTokenBalances, useAllowances, useApprove, useWrap } from '@/hooks/useTokens';
import { useOracle } from '@/hooks/useOracle';
import { CONTRACTS, PROTOCOL_PARAMS, creditcoinTestnet } from '@/lib/config';
import { VaultManagerABI } from '@/lib/abis/VaultManager';
import { formatBigInt, formatCompactBigInt, formatPercentage, formatUSD, parseToBigInt, getHealthStatus, calculateLiquidationPrice, calculateCollateralRatio, formatForInput, toBigInt, formatError } from '@/lib/utils';
import { HealthBadge } from './ui/HealthBadge';
import toast from 'react-hot-toast';

export function VaultCard() {
  const { address, isConnected } = useAccount();
  const { vaultIds, isLoading: vaultIdsLoading, refetch: refetchVaultIds } = useUserVaults();
  const { price } = useOracle();
  const { mcr, liquidationRatio, borrowingFee } = useProtocolParams();

  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [mode, setMode] = useState<'adjust' | 'close'>('adjust');

  // Form state
  const [collateralAmount, setCollateralAmount] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [collateralDelta, setCollateralDelta] = useState('');
  const [debtDelta, setDebtDelta] = useState('');
  const [isDeposit, setIsDeposit] = useState(true);
  const [isBorrow, setIsBorrow] = useState(true);
  // Open-vault interest rate controls moved to OpenVaultCard
  const [newInterest, setNewInterest] = useState('');

  // Persist and restore selected vault id via localStorage for cross-component visibility (Header)
  useEffect(() => {
    if (!vaultIds || vaultIds.length === 0) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('selectedVaultId') : null;
    if (stored) {
      const storedId = BigInt(stored as string);
      const idx = vaultIds.findIndex((id) => id === storedId);
      if (idx >= 0) setSelectedVaultIndex(idx);
    }
  }, [vaultIds]);

  const vaultId = vaultIds?.[selectedVaultIndex];
  const { vault, collateralRatio, interestRate: vaultInterest, isLoading: vaultLoading, refetch: refetchVault } = useVaultData(vaultId);

  // Sync newInterest field with on-chain interest when it changes
  useEffect(() => {
    if (vaultInterest !== undefined) {
      const percent = Number((vaultInterest * 10000n) / (10n ** 18n)) / 100;
      setNewInterest(percent.toString());
    }
  }, [vaultInterest]);
  const { tctcBalance, rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { rusdAllowance, refetch: refetchAllowances } = useAllowances(CONTRACTS.VAULT_MANAGER);

  const { openVault, isPending: isOpening, isSuccess: openSuccess } = useOpenVault();
  const { adjustVault, isPending: isAdjusting, isSuccess: adjustSuccess } = useAdjustVault();
  const { writeContract } = useWriteContract();
  const { closeVault, isPending: isClosing, isSuccess: closeSuccess } = useCloseVault();
  const { approve, isPending: isApproving, isSuccess: approveSuccess } = useApprove();
  // Native zapper: no wrapping needed in UI
  const { updateInterest, isPending: isUpdatingInterest, isSuccess: updateInterestSuccess } = useUpdateInterest();

  // Tooltip helpers for Adjust mode (place after balances and vault are known)
  const withdrawable = (() => {
    try {
      if (!price || !mcr || !vault) return undefined;
      const PREC = 10n ** 18n;
      const requiredValue = (vault.debt * mcr) / PREC;
      const minCollateral = (requiredValue * PREC) / price;
      return vault.collateral > minCollateral ? (vault.collateral - minCollateral) : BigInt(0);
    } catch { return undefined; }
  })();
  const additionalBorrow = (() => {
    try {
      if (!price || !mcr || !vault) return undefined;
      const PREC = 10n ** 18n;
      const cv = (vault.collateral * price) / PREC;
      const maxDebtGross = (cv * PREC) / mcr;
      const remainingCapacity = maxDebtGross > vault.debt ? (maxDebtGross - vault.debt) : BigInt(0);
      const bf = borrowingFee ?? BigInt(0);
      const denom = PREC + bf;
      return (remainingCapacity * PREC) / denom;
    } catch { return undefined; }
  })();
  const repayable = (() => {
    if (!vault) return undefined;
    if (rusdBalance === undefined) return vault.debt;
    return rusdBalance < vault.debt ? rusdBalance : vault.debt;
  })();

  // Refetch data when transactions succeed
  useEffect(() => {
    if (openSuccess || adjustSuccess || closeSuccess || approveSuccess || updateInterestSuccess) {
      refetchVault();
      refetchVaultIds();
      refetchBalances();
      refetchAllowances();
    }
  }, [openSuccess, adjustSuccess, closeSuccess, approveSuccess, updateInterestSuccess]);

  // Reset form on success
  // Open flow removed from this card

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
      setMode('adjust');
    }
  }, [closeSuccess]);

  // Open flow moved to OpenVaultCard

  // Open flow moved to OpenVaultCard

  const handleAdjustVault = async () => {
    if (!vaultId || !vault) return;

    try {
      const collatDeltaBI = parseToBigInt(collateralDelta);
      const debtDeltaBI = parseToBigInt(debtDelta);

      if (collatDeltaBI === 0n && debtDeltaBI === 0n) {
        toast.error('Please enter an amount to adjust');
        return;
      }

      const baseCollateral = toBigInt(vault.collateral) ?? 0n;
      const baseDebt = toBigInt(vault.debt) ?? 0n;
      const finalCollatDelta = isDeposit ? collatDeltaBI : -collatDeltaBI;
      const finalDebtDelta = isBorrow ? debtDeltaBI : -debtDeltaBI;

      const newCollateral = finalCollatDelta >= 0n ? (baseCollateral + finalCollatDelta) : (baseCollateral - (-finalCollatDelta));
      const newDebtNoFee = finalDebtDelta >= 0n ? (baseDebt + finalDebtDelta) : (baseDebt - (-finalDebtDelta));

      if (finalCollatDelta < 0n && newCollateral < 0n) {
        toast.error('Cannot withdraw more collateral than available');
        return;
      }

      // Repay requires having crdUSD (no ERC20 approval needed for burn)
      if (finalDebtDelta < 0n) {
        if (rusdBalance === undefined || rusdBalance < (-finalDebtDelta)) {
          toast.error('Insufficient crdUSD balance to repay');
          return;
        }
      }

      if ((finalCollatDelta < 0n || finalDebtDelta > 0n)) {
        if (!price || !mcr) {
          toast.error('Oracle price or MCR unavailable. Try again shortly.');
          return;
        }
        const PREC = 10n ** 18n;
        const cv = (newCollateral * price) / PREC;
        const bf = borrowingFee ?? 0n;
        const borrowFee = finalDebtDelta > 0n ? ((finalDebtDelta * bf) / PREC) : 0n;
        const newDebtWithFee = newDebtNoFee + borrowFee;
        if (newDebtWithFee > 0n) {
          const required = (newDebtWithFee * mcr) / PREC;
          if (cv < required) {
            const requiredCollat = (required * PREC) / price;
            toast.error(`Insufficient collateral after change. Requires at least ${formatBigInt(requiredCollat, 18, 4)} tCTC.`);
            return;
          }
        }
      }

      // Execute: collateral change then debt change
      if (finalCollatDelta > 0n) {
        await writeContract({
          address: CONTRACTS.VAULT_MANAGER,
          abi: VaultManagerABI,
          functionName: 'depositCollateralNative',
          args: [vaultId],
          value: finalCollatDelta,
          chainId: creditcoinTestnet.id,
        });
      } else if (finalCollatDelta < 0n) {
        await writeContract({
          address: CONTRACTS.VAULT_MANAGER,
          abi: VaultManagerABI,
          functionName: 'withdrawCollateralNative',
          args: [vaultId, (-finalCollatDelta)],
          chainId: creditcoinTestnet.id,
        });
      }

      if (finalDebtDelta !== 0n) {
        await adjustVault(vaultId, 0n, finalDebtDelta);
      }
    } catch (error: any) {
      toast.error(formatError(error));
    }
  };

  const handleCloseVault = async () => {
    if (!vaultId || !vault) return;

    try {
      await closeVault(vaultId);
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

  const healthStatus = vault && collateralRatio && liquidationRatio ? getHealthStatus(collateralRatio, liquidationRatio) : null;
  const liquidationPrice = (() => {
    if (!vault || typeof liquidationRatio !== 'bigint') return undefined;
    const coll = toBigInt(vault.collateral);
    const debt = toBigInt(vault.debt);
    if (coll === undefined || debt === undefined) return undefined;
    return calculateLiquidationPrice(coll, debt, liquidationRatio as bigint);
  })();

  let vaultsSubtitle = vaultIds && vaultIds.length > 0 ? `${vaultIds.length} vault(s)` : 'No vaults yet';
  if (vaultInterest !== undefined && vaultId !== undefined && !vaultLoading) {
    const apr = (Number(vaultInterest) * 100 / 1e18).toFixed(2);
    vaultsSubtitle = `${vaultsSubtitle} • Current APR: ${apr}%`;
  }

  return (
    <Card title="My Vaults" subtitle={vaultsSubtitle}>
      {/* Vault Selector */}
      {vaultIds && vaultIds.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Select Vault</p>
          <select
            className="px-3 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-500"
            value={selectedVaultIndex}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setSelectedVaultIndex(idx);
              if (vaultIds && vaultIds[idx] !== undefined) {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('selectedVaultId', vaultIds[idx].toString());
                }
              }
            }}
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
      {(vaultLoading || vaultIdsLoading) && (
        <div className="mb-6 grid grid-cols-1 gap-4">
          <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-6 w-20 mb-2 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-6 w-20 mb-2 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-6 w-20 mb-2 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-6 w-20 mb-2 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
      )}
      {vault && vaultId !== undefined && !vaultLoading && (
        <div className="mb-6 grid grid-cols-1 gap-4">
          <StatCard
            label="Collateral"
            value={`${formatCompactBigInt(vault.collateral)} tCTC`}
            subtitle={
              (() => {
                if (typeof price !== 'bigint') return undefined;
                const coll = toBigInt(vault.collateral);
                if (coll === undefined) return undefined;
                return formatUSD((coll * price) / PROTOCOL_PARAMS.PRECISION);
              })()
            }
          />
          <StatCard
            label="Debt"
            value={`${formatCompactBigInt(vault.debt, 18)} crdUSD`}
            subtitle={formatUSD(vault.debt)}
          />
          <StatCard
            label={
              <span className="inline-flex items-center gap-1">
                Health Factor
                <Tooltip content="Collateral value divided by debt (higher is safer).">
                  <span><InfoIcon /></span>
                </Tooltip>
              </span>
            }
            value={
              <span className="inline-flex items-center">
                <span className={healthStatus?.color}>
                  {collateralRatio ? formatPercentage(collateralRatio) : '--'}
                </span>
                <HealthBadge ratio={collateralRatio} mcr={liquidationRatio} />
              </span>
            }
          />
          <StatCard
            label={
              <span className="inline-flex items-center gap-1">
                Liquidation Price
                <Tooltip content="tCTC price at which your vault reaches the minimum ratio.">
                  <span><InfoIcon /></span>
                </Tooltip>
              </span>
            }
            value={liquidationPrice ? formatUSD(liquidationPrice) : '--'}
            subtitle="Per tCTC"
          />
          <StatCard
            label="Interest"
            value={vaultInterest !== undefined ? formatPercentage(vaultInterest) : '--'}
            subtitle="Per year"
          />
        </div>
      )}

      {/* Actions */}
      {vaultIds && vaultIds.length > 0 && (
        <div className="mb-6 flex space-x-2 border-b border-gray-100">
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
        </div>
      )}

      {/* Open flow moved to OpenVaultCard */}
      {false && (
        <div className="space-y-3">
          <Input
            type="number"
            label="Collateral Amount (tCTC)"
            placeholder="0.0"
            value={collateralAmount}
            onChange={(e) => setCollateralAmount(e.target.value)}
          />

      <Input
        type="number"
        label="Borrow Amount (crdUSD)"
        placeholder="0.0"
        value={debtAmount}
        onChange={(e) => setDebtAmount(e.target.value)}
      />

        <div />

          {/* Projected health preview moved to OpenVaultCard */}

          {/* Selected interest preview removed from open flow */}

          {/* Button removed; see OpenVaultCard */}
        </div>
      )}

      {/* Adjust Vault Form */}
      {mode === 'adjust' && vault && !vaultLoading && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 inline-flex items-center gap-1">
                Collateral
                <Tooltip content={`Balance: ${tctcBalance ? formatBigInt(tctcBalance, 18, 4) : '--'} tCTC${withdrawable !== undefined ? ` • Withdrawable: ${formatBigInt(withdrawable, 18, 4)} tCTC` : ''}`}>
                  <span><InfoIcon /></span>
                </Tooltip>
              </label>
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
              rightElement={
                <button
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  onClick={() => {
                    if (!vault || !price || !mcr) return;
                    if (isDeposit) {
                      if (tctcBalance !== undefined) {
                        const buffer = BigInt(5_000_000_000_000_000); // 0.005 tCTC gas buffer
                        const spendable = tctcBalance > buffer ? (tctcBalance - buffer) : BigInt(0);
                        setCollateralDelta(formatForInput(spendable, 18));
                      }
                    } else {
                      // Max withdraw keeping MCR
                      const PREC = 10n ** 18n;
                      const requiredValue = (vault.debt * mcr) / PREC; // USD
                      const minCollateral = (requiredValue * PREC) / price; // tCTC
                      const maxWithdraw = vault.collateral > minCollateral ? (vault.collateral - minCollateral) : BigInt(0);
                      setCollateralDelta(formatForInput(maxWithdraw, 18));
                    }
                  }}
                >
                  MAX
                </button>
              }
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 inline-flex items-center gap-1">
                Debt
                <Tooltip content={`Balance: ${rusdBalance ? formatBigInt(rusdBalance, 18, 4) : '--'} crdUSD${additionalBorrow !== undefined ? ` • Borrow cap: ${formatBigInt(additionalBorrow, 18, 2)} crdUSD` : ''}${repayable !== undefined ? ` • Repayable: ${formatBigInt(repayable, 18, 2)} crdUSD` : ''}`}>
                  <span><InfoIcon /></span>
                </Tooltip>
              </label>
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
              rightElement={
                <button
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  onClick={() => {
                    if (!vault || !price || !mcr) return;
                    const PREC = 10n ** 18n;
                    if (isBorrow) {
                      // Max additional borrow under MCR considering fee
                      const cv = (vault.collateral * price) / PREC; // USD
                      const maxDebtGross = (cv * PREC) / mcr; // USD
                      const remainingCapacity = maxDebtGross > vault.debt ? (maxDebtGross - vault.debt) : BigInt(0);
                      const bf = borrowingFee ?? BigInt(0);
                      const denom = PREC + bf;
                      const maxBorrow = (remainingCapacity * PREC) / denom;
                      setDebtDelta(formatForInput(maxBorrow, 18));
                    } else {
                      // Max repay is current debt capped by balance
                      const maxRepay = rusdBalance !== undefined ? (rusdBalance < vault.debt ? rusdBalance : vault.debt) : vault.debt;
                      setDebtDelta(formatForInput(maxRepay, 18));
                    }
                  }}
                >
                  MAX
                </button>
              }
            />

            {/* Projected health after adjustment */}
            {
              (() => {
                if (!vault || !price || !mcr) return null;
                if (typeof vault.collateral !== 'bigint' || typeof vault.debt !== 'bigint' || typeof price !== 'bigint') return null;
                const collatDeltaBI: bigint = parseToBigInt(collateralDelta);
                const debtDeltaBI: bigint = parseToBigInt(debtDelta);
                const baseCollateral: bigint = vault.collateral;
                const baseDebt: bigint = vault.debt;
                const newCollateral: bigint = isDeposit ? (baseCollateral + collatDeltaBI) : (baseCollateral - collatDeltaBI);
                const newDebt: bigint = isBorrow ? (baseDebt + debtDeltaBI) : (baseDebt - debtDeltaBI);
                if (newCollateral >= 0n && newDebt > 0n) {
                  const ratio = calculateCollateralRatio(newCollateral, newDebt, price as bigint);
                  const health = getHealthStatus(ratio, liquidationRatio ?? mcr);
                  return (
                    <div className="mt-2 text-sm text-gray-600">
                      <span className="mr-2">Projected ratio:</span>
                      <span className={health.color}>{formatPercentage(ratio)}</span>
                      <span className="ml-2 text-xs text-gray-500">(min {formatPercentage(mcr)})</span>
                      {vaultInterest !== undefined && (
                        <span className="ml-3 text-xs text-gray-500">Current interest: <span className="font-medium">{(Number(vaultInterest) * 100 / 1e18).toFixed(2)}%</span> APR</span>
                      )}
                    </div>
                  );
                }
                return null;
              })()
            }
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
      {mode === 'close' && vault && !vaultLoading && (
        <div className="space-y-4">
          <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl">
            <p className="text-sm text-warning font-medium">
              Closing this vault will repay all debt ({formatBigInt(vault.debt, 18, 2)} crdUSD) and return all collateral ({formatBigInt(vault.collateral)} tCTC).
            </p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">crdUSD to repay:</span>
              <span className="font-semibold">{formatBigInt(vault.debt, 18, 2)} crdUSD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Your crdUSD balance:</span>
              <span className="font-semibold">{rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--'} crdUSD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">tCTC to receive:</span>
              <span className="font-semibold text-success">{formatBigInt(vault.collateral)} tCTC</span>
            </div>
          </div>

          {rusdBalance && rusdBalance < vault.debt && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-xl">
              <p className="text-sm text-error">
                Insufficient crdUSD balance. Need {formatBigInt(vault.debt - rusdBalance, 18, 2)} more crdUSD.
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
      {/* Update Interest Section (Adjust Mode) */}
      {mode === 'adjust' && vault && !vaultLoading && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Interest Rate (%)</label>
            <span className="text-xs text-gray-500">0 - 40</span>
          </div>
          {/* Quick-select presets */}
          <div className="mb-2 flex gap-2">
            {["5", "10", "15", "20"].map((p) => (
              <button
                key={p}
                type="button"
                className={`px-2 py-1 text-xs rounded border ${newInterest === p ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-700'}`}
                onClick={() => setNewInterest(p)}
              >
                {p}%
              </button>
            ))}
          </div>
          <Input
            type="number"
            placeholder="5.0"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
          />
          <Button
            className="mt-2 w-full"
            variant="secondary"
            onClick={async () => {
              if (!vaultId) return;
              let rateNum = Number(newInterest);
              if (isNaN(rateNum) || rateNum < 0 || rateNum > 40) {
                toast.error('Interest rate must be between 0% and 40%');
                return;
              }
              // Round to two decimals
              rateNum = Math.round(rateNum * 100) / 100;
              const rateWad = parseToBigInt((rateNum / 100).toString());
              await updateInterest(vaultId, rateWad);
              toast.success('Interest updated');
            }}
            isLoading={isUpdatingInterest}
          >
            Update Interest
          </Button>
        </div>
      )}
    </Card>
  );
}
