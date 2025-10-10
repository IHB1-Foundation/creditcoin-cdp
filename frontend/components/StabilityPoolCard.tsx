'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatCard } from './ui/StatCard';
import { useAccount } from 'wagmi';
import { useStabilityPoolData, useStabilityDeposit, useStabilityWithdraw, useClaimCollateralGain } from '@/hooks/useStabilityPool';
import { useTokenBalances, useAllowances, useApprove } from '@/hooks/useTokens';
import { CONTRACTS } from '@/lib/config';
import { formatBigInt, formatCompactBigInt, parseToBigInt, formatForInput } from '@/lib/utils';
import { Skeleton } from './ui/Skeleton';
import toast from 'react-hot-toast';

export function StabilityPoolCard() {
  const { isConnected } = useAccount();
  const { depositAmount, collateralGain, totalDeposits, isLoading: poolLoading, refetch: refetchPool } = useStabilityPoolData();
  const { rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { rusdAllowance, refetch: refetchAllowances } = useAllowances(CONTRACTS.STABILITY_POOL);

  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');

  const { deposit, isPending: isDepositing, isSuccess: depositSuccess } = useStabilityDeposit();
  const { withdraw, isPending: isWithdrawing, isSuccess: withdrawSuccess } = useStabilityWithdraw();
  const { claim, isPending: isClaiming, isSuccess: claimSuccess } = useClaimCollateralGain();
  const { approve, isPending: isApproving, isSuccess: approveSuccess } = useApprove();

  // Refetch data when transactions succeed
  useEffect(() => {
    if (depositSuccess || withdrawSuccess || claimSuccess || approveSuccess) {
      refetchPool();
      refetchBalances();
      refetchAllowances();
    }
  }, [depositSuccess, withdrawSuccess, claimSuccess, approveSuccess]);

  // Reset form and show success
  useEffect(() => {
    if (depositSuccess) {
      setAmount('');
      toast.success('Deposited to Stability Pool!');
    }
  }, [depositSuccess]);

  useEffect(() => {
    if (withdrawSuccess) {
      setAmount('');
      toast.success('Withdrawn from Stability Pool!');
    }
  }, [withdrawSuccess]);

  useEffect(() => {
    if (claimSuccess) {
      toast.success('Collateral gains claimed!');
    }
  }, [claimSuccess]);

  const handleDeposit = async () => {
    try {
      const depositAmt = parseToBigInt(amount);

      if (depositAmt === BigInt(0)) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (rusdBalance !== undefined && depositAmt > rusdBalance) {
        toast.error('Insufficient crdUSD balance');
        return;
      }

      // Check approval
      if (rusdAllowance === undefined || rusdAllowance < depositAmt) {
        toast('Approving crdUSD...', { icon: '⏳' });
        await approve('rusd', CONTRACTS.STABILITY_POOL, depositAmt * BigInt(2));
        return;
      }

      await deposit(depositAmt);
    } catch (error) {
      // Error handling in hook
    }
  };

  const handleWithdraw = async () => {
    try {
      const withdrawAmt = parseToBigInt(amount);

      if (withdrawAmt === BigInt(0)) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (depositAmount !== undefined && withdrawAmt > depositAmount) {
        toast.error('Cannot withdraw more than deposited');
        return;
      }

      await withdraw(withdrawAmt);
    } catch (error) {
      // Error handling in hook
    }
  };

  const handleClaim = async () => {
    try {
      if (collateralGain === undefined || collateralGain === BigInt(0)) {
        toast.error('No collateral gains to claim');
        return;
      }

      await claim();
    } catch (error) {
      // Error handling in hook
    }
  };

  if (!isConnected) {
    return (
      <Card title="Stability Pool" subtitle="Earn liquidation rewards">
        <div className="text-center py-12">
          <p className="text-gray-500">Connect your wallet to participate</p>
        </div>
      </Card>
    );
  }

  const poolShare = totalDeposits && totalDeposits > BigInt(0) && depositAmount
    ? (depositAmount * BigInt(10000) / totalDeposits) / BigInt(100)
    : BigInt(0);

  return (
    <Card title="Stability Pool" subtitle="Earn collateral from liquidations">
      {/* Your Position */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {poolLoading && (
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
        <StatCard
          label="Your Deposit"
          value={depositAmount !== undefined ? `${formatCompactBigInt(depositAmount, 18)} crdUSD` : '--'}
          subtitle={poolShare > BigInt(0) ? `${Number(poolShare) / 100}% of pool` : undefined}
        />
        <StatCard
          label="Collateral Gains"
          value={collateralGain !== undefined ? `${formatBigInt(collateralGain, 18, 4)} tCTC` : '--'}
          subtitle={collateralGain && collateralGain > BigInt(0) ? 'Ready to claim' : 'No gains yet'}
        />
        <StatCard
          label="Total Pool Size"
          value={totalDeposits !== undefined ? `${formatCompactBigInt(totalDeposits, 18)} crdUSD` : '--'}
        />
      </div>

      {/* Claim Button */}
      {collateralGain && collateralGain > BigInt(0) && (
        <div className="mb-6">
          <Button
            className="w-full"
            variant="success"
            onClick={handleClaim}
            isLoading={isClaiming}
          >
            Claim {formatBigInt(collateralGain, 18, 4)} tCTC
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Actions</p>
      </div>

      {/* Mode Selector */}
      <div className="mb-6 flex space-x-2 border-b border-gray-100">
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'deposit'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setMode('deposit')}
        >
          Deposit
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'withdraw'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setMode('withdraw')}
        >
          Withdraw
        </button>
      </div>

      {/* Deposit/Withdraw Form */}
      <div className="space-y-3">
        <Input
          type="number"
          label={mode === 'deposit' ? 'Deposit Amount (crdUSD)' : 'Withdraw Amount (crdUSD)'}
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          rightElement={
            <button
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => {
                if (mode === 'deposit' && rusdBalance) {
                  setAmount(formatForInput(rusdBalance, 18));
                } else if (mode === 'withdraw' && depositAmount) {
                  setAmount(formatForInput(depositAmount, 18));
                }
              }}
            >
              MAX
            </button>
          }
        />

        <div className="text-xs text-gray-500">
          Available: <span className="font-medium text-gray-700">{mode === 'deposit'
            ? (rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--')
            : (depositAmount ? formatBigInt(depositAmount, 18, 2) : '--')}</span> crdUSD
        </div>

        {mode === 'deposit' ? (
          <Button
            className="w-full"
            onClick={handleDeposit}
            isLoading={isDepositing || isApproving}
          >
            {isApproving ? 'Approving...' : 'Deposit'}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={handleWithdraw}
            isLoading={isWithdrawing}
          >
            Withdraw
          </Button>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-primary-50 border border-primary-200 rounded-xl">
        <p className="text-sm text-primary-900 font-medium mb-2">💡 How it works</p>
        <ul className="text-sm text-primary-800 space-y-1">
          <li>• Deposit crdUSD to help absorb liquidated debt</li>
          <li>• Earn collateral from liquidations</li>
          <li>• Your share proportional to pool deposit</li>
          <li>• Claim collateral gains anytime</li>
        </ul>
      </div>
    </Card>
  );
}
