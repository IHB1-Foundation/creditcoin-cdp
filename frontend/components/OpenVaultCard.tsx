'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Tooltip } from './ui/Tooltip';
import { InfoIcon } from './ui/InfoIcon';
import { useAccount } from 'wagmi';
import { useOpenVault, useProtocolParams } from '@/hooks/useVault';
import { useTokenBalances } from '@/hooks/useTokens';
import { useOracle } from '@/hooks/useOracle';
import { PROTOCOL_PARAMS } from '@/lib/config';
import { formatBigInt, parseToBigInt, formatPercentage, formatForInput } from '@/lib/utils';
import { calculateCollateralRatio, getHealthStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

export function OpenVaultCard() {
  const { isConnected } = useAccount();
  const { tctcBalance, rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { price } = useOracle();
  const { mcr, liquidationRatio, borrowingFee } = useProtocolParams();

  const [collateralAmount, setCollateralAmount] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [interestRate, setInterestRate] = useState('5'); // percent

  const { openVault, isPending: isOpening, isSuccess: openSuccess } = useOpenVault();

  useEffect(() => {
    if (openSuccess) {
      setCollateralAmount('');
      setDebtAmount('');
      toast.success('Vault opened successfully!');
      refetchBalances();
    }
  }, [openSuccess]);

  const handleOpenVault = async () => {
    try {
      const collateral = parseToBigInt(collateralAmount);
      const debt = parseToBigInt(debtAmount);

      if (collateral === BigInt(0) || debt === BigInt(0)) {
        toast.error('Please enter valid amounts');
        return;
      }

      if (debt < PROTOCOL_PARAMS.MIN_DEBT) {
        toast.error(`Minimum debt is ${formatBigInt(PROTOCOL_PARAMS.MIN_DEBT)} crdUSD`);
        return;
      }

      let rateNum = Number(interestRate);
      if (isNaN(rateNum) || rateNum < 0 || rateNum > 40) {
        toast.error('Interest rate must be between 0% and 40%');
        return;
      }
      rateNum = Math.round(rateNum * 100) / 100;
      const rateWad = parseToBigInt((rateNum / 100).toString());

      await openVault(collateral, debt, rateWad);
    } catch (error) {
      // handled in hooks
    }
  };

  // Projected health preview
  const projectedCollateral = parseToBigInt(collateralAmount);
  const projectedDebt = parseToBigInt(debtAmount);
  const projectedRatio =
    projectedCollateral > BigInt(0) && projectedDebt > BigInt(0) && price
      ? calculateCollateralRatio(projectedCollateral, projectedDebt, price)
      : undefined;
  const projectedHealth = projectedRatio && liquidationRatio ? getHealthStatus(projectedRatio, liquidationRatio) : null;

  // Tooltip helpers
  const gasBuffer = BigInt(5_000_000_000_000_000); // ~0.005 tCTC
  const spendableTctc = tctcBalance !== undefined ? (tctcBalance > gasBuffer ? (tctcBalance - gasBuffer) : BigInt(0)) : undefined;
  const borrowCapacity = (() => {
    try {
      if (!price || !mcr) return undefined;
      const collateral = parseToBigInt(collateralAmount);
      if (collateral === BigInt(0)) return undefined;
      const PREC = BigInt(1e18);
      const cv = (collateral * price) / PREC;
      const maxDebtGross = (cv * PREC) / mcr;
      const bf = borrowingFee ?? BigInt(0);
      const denom = PREC + bf;
      return (maxDebtGross * PREC) / denom;
    } catch { return undefined; }
  })();

  if (!isConnected) {
    return (
      <Card title="Open New Vault" subtitle="Deposit tCTC and borrow crdUSD">
        <div className="text-center py-12">
          <p className="text-gray-500">Connect your wallet to open a vault</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Open New Vault" subtitle="Use native tCTC as collateral and choose APR">
      <div className="space-y-3">
        <Input
          type="number"
          label={
            <span className="inline-flex items-center gap-1">
              Collateral Amount (tCTC)
              <Tooltip content={`Balance: ${tctcBalance ? formatBigInt(tctcBalance, 18, 4) : '--'} tCTC${spendableTctc !== undefined ? ` • Spendable: ${formatBigInt(spendableTctc, 18, 4)} tCTC` : ''}`}>
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          placeholder="0.0"
          value={collateralAmount}
          onChange={(e) => setCollateralAmount(e.target.value)}
          rightElement={
            <button
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => {
                if (tctcBalance) {
                  // Leave small buffer for gas (e.g., 0.005 tCTC)
                  const buffer = BigInt(5_000_000_000_000_000); // 0.005e18
                  const spendable = tctcBalance > buffer ? (tctcBalance - buffer) : BigInt(0);
                  setCollateralAmount(formatForInput(spendable, 18));
                }
              }}
            >
              MAX
            </button>
          }
        />

        <Input
          type="number"
          label={
            <span className="inline-flex items-center gap-1">
              Borrow Amount (crdUSD)
              <Tooltip content={`Balance: ${rusdBalance ? formatBigInt(rusdBalance, 18, 4) : '--'} crdUSD${borrowCapacity !== undefined ? ` • Capacity: ${formatBigInt(borrowCapacity, 18, 2)} crdUSD` : ''} • Min: ${formatBigInt(PROTOCOL_PARAMS.MIN_DEBT, 18, 2)} crdUSD`}>
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          placeholder="0.0"
          value={debtAmount}
          onChange={(e) => setDebtAmount(e.target.value)}
          rightElement={
            <button
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => {
                try {
                  if (!price || !mcr) return;
                  const collateral = parseToBigInt(collateralAmount);
                  if (collateral === BigInt(0)) return;
                  const PREC = BigInt(1e18);
                  const cv = (collateral * price) / PREC; // collateral value in USD (1e18)
                  // Max total debt allowed by MCR
                  const maxDebtGross = (cv * PREC) / mcr; // USD (1e18)
                  // Account for borrowing fee on the borrowed amount x
                  const bf = borrowingFee ?? BigInt(0);
                  const denom = PREC + bf; // (1e18 + fee)
                  // Max borrow x so that x + x*fee <= maxDebtGross
                  let maxBorrow = (maxDebtGross * PREC) / denom;
                  if (maxBorrow < PROTOCOL_PARAMS.MIN_DEBT) {
                    // Not enough collateral for minimum debt
                    maxBorrow = BigInt(0);
                  }
                  setDebtAmount(formatForInput(maxBorrow, 18));
                } catch {}
              }}
            >
              MAX
            </button>
          }
        />

        <div>
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
                className={`px-2 py-1 text-xs rounded border ${interestRate === p ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-700'}`}
                onClick={() => setInterestRate(p)}
              >
                {p}%
              </button>
            ))}
          </div>
          <Input
            type="number"
            placeholder="5.0"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </div>

        {/* Projected health preview */}
        {price && mcr && projectedRatio !== undefined && projectedRatio > BigInt(0) && (
          <div className="-mt-1 text-sm text-gray-600">
            <span className="mr-2">Projected ratio</span>
            <span className={projectedHealth?.color}>
              {formatPercentage(projectedRatio)}
            </span>
            <span className="ml-2 text-xs text-gray-500">(min {formatPercentage(mcr)})</span>
          </div>
        )}

        <Button className="w-full" onClick={handleOpenVault} isLoading={isOpening}>
          Open Vault
        </Button>
      </div>
    </Card>
  );
}
