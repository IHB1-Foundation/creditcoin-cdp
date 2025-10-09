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
import { formatBigInt, parseToBigInt } from '@/lib/utils';
import toast from 'react-hot-toast';

export function StabilityPoolCard() {
  const { isConnected } = useAccount();
  const { depositAmount, collateralGain, totalDeposits, refetch: refetchPool } = useStabilityPoolData();
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
        toast.error('Insufficient rUSD balance');
        return;
      }

      // Check approval
      if (rusdAllowance === undefined || rusdAllowance < depositAmt) {
        toast('Approving rUSD...', { icon: '⏳' });
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
    <Card title="Stability Pool" subtitle="Earn wCTC from liquidations">
      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Your Deposit"
          value={depositAmount !== undefined ? `${formatBigInt(depositAmount, 18, 2)} rUSD` : '--'}
          subtitle={poolShare > BigInt(0) ? `${Number(poolShare) / 100}% of pool` : undefined}
        />
        <StatCard
          label="Collateral Gains"
          value={collateralGain !== undefined ? `${formatBigInt(collateralGain, 18, 4)} wCTC` : '--'}
          subtitle={collateralGain && collateralGain > BigInt(0) ? 'Ready to claim' : 'No gains yet'}
        />
        <StatCard
          label="Total Pool Size"
          value={totalDeposits !== undefined ? `${formatBigInt(totalDeposits, 18, 0)} rUSD` : '--'}
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
            Claim {formatBigInt(collateralGain, 18, 4)} wCTC
          </Button>
        </div>
      )}

      {/* Mode Selector */}
      <div className="mb-6 flex space-x-2 border-b border-gray-200">
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
      <div className="space-y-4">
        <Input
          type="number"
          label={mode === 'deposit' ? 'Deposit Amount (rUSD)' : 'Withdraw Amount (rUSD)'}
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          rightElement={
            <button
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => {
                if (mode === 'deposit' && rusdBalance) {
                  setAmount(formatBigInt(rusdBalance, 18, 18));
                } else if (mode === 'withdraw' && depositAmount) {
                  setAmount(formatBigInt(depositAmount, 18, 18));
                }
              }}
            >
              MAX
            </button>
          }
        />

        <div className="text-sm text-gray-600">
          Available: {mode === 'deposit'
            ? (rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--')
            : (depositAmount ? formatBigInt(depositAmount, 18, 2) : '--')} rUSD
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
      <div className="mt-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
        <p className="text-sm text-primary-900 font-medium mb-2">💡 How it works</p>
        <ul className="text-sm text-primary-800 space-y-1">
          <li>• Deposit rUSD to help absorb liquidated debt</li>
          <li>• Earn wCTC collateral from liquidations</li>
          <li>• Your share proportional to pool deposit</li>
          <li>• Claim collateral gains anytime</li>
        </ul>
      </div>
    </Card>
  );
}
