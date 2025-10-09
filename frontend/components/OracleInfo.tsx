'use client';

import { Card } from './ui/Card';
import { StatCard } from './ui/StatCard';
import { useOracle } from '@/hooks/useOracle';
import { useProtocolParams } from '@/hooks/useVault';
import { formatBigInt, formatPercentage, formatTimeAgo, formatUSD } from '@/lib/utils';
import { useEffect } from 'react';

export function OracleInfo() {
  const { price, isFresh, lastUpdateTime, refetch } = useOracle();
  const { mcr, borrowingFee, redemptionFee, totalDebt, totalCollateral } = useProtocolParams();

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
        {/* Oracle Price */}
        <StatCard
          label="wCTC Price"
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
          label="Min. Collateral Ratio"
          value={mcr ? formatPercentage(mcr) : '--'}
          subtitle="Required minimum"
        />

        {/* Borrowing Fee */}
        <StatCard
          label="Borrowing Fee"
          value={borrowingFee ? formatPercentage(borrowingFee) : '--'}
          subtitle="On new debt"
        />

        {/* Redemption Fee */}
        <StatCard
          label="Redemption Fee"
          value={redemptionFee ? formatPercentage(redemptionFee) : '--'}
          subtitle="On redeemed collateral"
        />

        {/* Total Debt */}
        <StatCard
          label="Total System Debt"
          value={totalDebt ? `${formatBigInt(totalDebt, 18, 0)} rUSD` : '--'}
          subtitle={totalDebt ? formatUSD(totalDebt) : undefined}
        />

        {/* Total Collateral */}
        <StatCard
          label="Total System Collateral"
          value={totalCollateral ? `${formatBigInt(totalCollateral, 18, 2)} wCTC` : '--'}
          subtitle={
            totalCollateral && price
              ? formatUSD((totalCollateral * price) / BigInt(1e18))
              : undefined
          }
        />
      </div>

      {isFresh === false && (
        <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-lg">
          <p className="text-sm text-error font-medium">⚠️ Oracle price is stale. Transactions may fail.</p>
        </div>
      )}
    </Card>
  );
}
