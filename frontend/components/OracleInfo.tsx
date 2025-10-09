'use client';

import { Card } from './ui/Card';
import { StatCard } from './ui/StatCard';
import { Tooltip } from './ui/Tooltip';
import { InfoIcon } from './ui/InfoIcon';
import { useOracle } from '@/hooks/useOracle';
import { useProtocolParams, useInterestStats } from '@/hooks/useVault';
import { formatBigInt, formatCompactBigInt, formatPercentage, formatTimeAgo, formatUSD } from '@/lib/utils';
import { useEffect } from 'react';
import { Skeleton } from './ui/Skeleton';

export function OracleInfo() {
  const { price, isFresh, lastUpdateTime, isLoading: oracleLoading, refetch } = useOracle();
  const { mcr, borrowingFee, redemptionFee, totalDebt, totalCollateral, totalDebtCurrent, isLoading: paramsLoading } = useProtocolParams();
  const { minRate, maxRate, avgRate, weightedAvgRate, activeVaultCount } = useInterestStats();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <Card title="System Info" subtitle="Real-time protocol statistics">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(oracleLoading || paramsLoading) && (
          <>
            <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
              <Skeleton className="h-3 w-32 mb-3 rounded" />
              <Skeleton className="h-6 w-24 mb-2 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
            <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
              <Skeleton className="h-3 w-32 mb-3 rounded" />
              <Skeleton className="h-6 w-24 mb-2 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
            <div className="p-4 border border-gray-100 rounded-xl bg-gradient-to-br from-gray-50 to-white">
              <Skeleton className="h-3 w-32 mb-3 rounded" />
              <Skeleton className="h-6 w-24 mb-2 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          </>
        )}
        {/* Oracle Price */}
        <StatCard
          label="tCTC Price"
          value={
            <span className={isFresh === false ? 'text-error' : ''}>
              {price ? formatUSD(price) : '--'}
            </span>
          }
          subtitle={
            lastUpdateTime
              ? `Updated ${formatTimeAgo(Number(lastUpdateTime))}`
              : undefined
          }
          icon={
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                isFresh === false ? 'bg-error animate-pulse' : 'bg-success'
              }`}
            />
          }
        />

        {/* MCR */}
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Min. Collateral Ratio
              <Tooltip content="Minimum required collateral value relative to debt.">
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          value={mcr ? formatPercentage(mcr) : '--'}
          subtitle="Required minimum"
        />

        {/* Borrowing Fee */}
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Borrowing Fee
              <Tooltip content="Fee charged on newly issued debt.">
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          value={borrowingFee ? formatPercentage(borrowingFee) : '--'}
          subtitle="On new debt"
        />

        {/* Redemption Fee */}
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Redemption Fee
              <Tooltip content="Fee deducted from collateral received during redemption.">
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          value={redemptionFee ? formatPercentage(redemptionFee) : '--'}
          subtitle="On redeemed collateral"
        />

        {/* Total Debt */}
        <StatCard
          label="Total System Debt"
          value={totalDebt ? `${formatCompactBigInt(totalDebt, 18)} crdUSD` : '--'}
          subtitle={totalDebt ? formatUSD(totalDebt) : undefined}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Total Debt (Current)
              <Tooltip content="Includes accrued interest across all active vaults.">
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          value={totalDebtCurrent ? `${formatCompactBigInt(totalDebtCurrent, 18)} crdUSD` : '--'}
          subtitle={totalDebtCurrent ? formatUSD(totalDebtCurrent) : undefined}
        />

        {/* Total Collateral */}
        <StatCard
          label="Total System Collateral"
          value={totalCollateral ? `${formatCompactBigInt(totalCollateral, 18)} tCTC` : '--'}
          subtitle={
            totalCollateral && price
              ? formatUSD((totalCollateral * price) / BigInt(1e18))
              : undefined
          }
        />
      </div>

      {/* Interest Stats */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Min Vault Interest"
          value={minRate !== undefined ? formatPercentage(minRate) : '--'}
          subtitle={activeVaultCount ? `${activeVaultCount.toString()} active` : undefined}
        />
        <StatCard
          label="Avg Vault Interest"
          value={avgRate !== undefined ? formatPercentage(avgRate) : '--'}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Max Vault Interest
              <Tooltip content="Simple average and debt-weighted average across active vaults.">
                <span><InfoIcon /></span>
              </Tooltip>
            </span>
          }
          value={maxRate !== undefined ? formatPercentage(maxRate) : '--'}
        />
        <StatCard
          label="Debt-Weighted Avg"
          value={weightedAvgRate !== undefined ? formatPercentage(weightedAvgRate) : '--'}
        />
      </div>

      {isFresh === false && (
        <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-xl">
          <p className="text-sm text-error font-medium">⚠️ Oracle price is stale. Transactions may fail.</p>
        </div>
      )}
    </Card>
  );
}
