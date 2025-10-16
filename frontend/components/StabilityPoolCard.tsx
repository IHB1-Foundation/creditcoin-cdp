'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatCard } from './ui/StatCard';
import { useAccount, usePublicClient } from 'wagmi';
import { useStabilityPoolData, useStabilityDeposit, useStabilityWithdraw, useClaimCollateralGain } from '@/hooks/useStabilityPool';
import { StabilityPoolABI } from '@/lib/abis/StabilityPool';
import { useTokenBalances, useAllowances, useApprove } from '@/hooks/useTokens';
import { CONTRACTS } from '@/lib/config';
import { formatBigInt, formatCompactBigInt, parseToBigInt, formatForInput } from '@/lib/utils';
import { Skeleton } from './ui/Skeleton';
import toast from 'react-hot-toast';

export function StabilityPoolCard() {
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { depositAmount, collateralGain, totalDeposits, isLoading: poolLoading, refetch: refetchPool } = useStabilityPoolData();
  const { rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { rusdAllowance, refetch: refetchAllowances } = useAllowances(CONTRACTS.STABILITY_POOL);

  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  type Step = 'idle' | 'checking' | 'approving' | 'depositing' | 'done' | 'error';
  const [depositStep, setDepositStep] = useState<Step>('idle');

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
      setDepositStep('done');
      toast.success('Deposited to Stability Pool!');
      // reset back to idle after a moment
      setTimeout(() => setDepositStep('idle'), 1200);
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

      // Guard: addresses configured
      if (!CONTRACTS.STABILITY_POOL || CONTRACTS.STABILITY_POOL === '0x0000000000000000000000000000000000000000') {
        toast.error('StabilityPool address is not configured');
        return;
      }
      if (!CONTRACTS.RUSD || CONTRACTS.RUSD === '0x0000000000000000000000000000000000000000') {
        toast.error('crdUSD address is not configured');
        return;
      }

      // Step 1: Check allowance (if we have it), approve only when actually needed
      setDepositStep('checking');
      const allowanceKnown = rusdAllowance !== undefined;
      const needsApproveNow = allowanceKnown && rusdAllowance! < depositAmt;
      if (needsApproveNow) {
        setDepositStep('approving');
        await approve('rusd', CONTRACTS.STABILITY_POOL, depositAmt * BigInt(2));
        await refetchAllowances();
      }

      // Step 2: Simulate deposit to catch precise revert reasons
      try {
        await publicClient.simulateContract({
          address: CONTRACTS.STABILITY_POOL,
          abi: StabilityPoolABI as any,
          functionName: 'deposit',
          args: [depositAmt],
          account: address as any,
        });
      } catch (simErr: any) {
        const simMsg = (simErr?.shortMessage || simErr?.message || '').toString();
        const needsApprovalBySim = /(insufficient allowance|ERC20: insufficient allowance|transfer amount exceeds allowance)/i.test(simMsg);
        if (needsApprovalBySim) {
          setDepositStep('approving');
          await approve('rusd', CONTRACTS.STABILITY_POOL, depositAmt * BigInt(2));
          await refetchAllowances();
        } else {
          setDepositStep('error');
          toast.error(simMsg || 'Simulation failed. Please try again.');
          return;
        }
      }

      // Step 3: Try deposit; on clear allowance error, approve then retry
      setDepositStep('depositing');
      try {
        await deposit(depositAmt);
      } catch (err: any) {
        const msg = (err?.message || '').toString();
        const needsApproveByError = /(insufficient allowance|ERC20: insufficient allowance|transfer amount exceeds allowance|TransferFailed)/i.test(msg);
        if (!needsApproveNow && needsApproveByError) {
          setDepositStep('approving');
          await approve('rusd', CONTRACTS.STABILITY_POOL, depositAmt * BigInt(2));
          await refetchAllowances();
          setDepositStep('depositing');
          await deposit(depositAmt);
        } else {
          throw err;
        }
      }
    } catch (error) {
      // Error handling in hook
      setDepositStep('error');
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
      <div className="mb-6 grid grid-cols-1 gap-4">
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

      {/* Claim Button (always visible; disabled if no gains) */}
      <div className="mb-6">
        <Button
          className="w-full"
          variant="success"
          onClick={handleClaim}
          isLoading={isClaiming}
          disabled={!collateralGain || collateralGain === BigInt(0)}
        >
          {collateralGain && collateralGain > BigInt(0)
            ? `Claim ${formatBigInt(collateralGain, 18, 4)} tCTC`
            : 'Claim (no gains)'}
        </Button>
      </div>

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

        {/* Balance / Allowance hint (deposit mode) */}
        {mode === 'deposit' && (
          <div className="-mt-2 text-xs text-gray-500 flex justify-between">
            <span>Balance: {rusdBalance !== undefined ? `${formatBigInt(rusdBalance, 18, 4)} crdUSD` : '--'}</span>
            <span>Allowance: {rusdAllowance !== undefined ? `${formatBigInt(rusdAllowance, 18, 4)} crdUSD` : '--'}</span>
          </div>
        )}

        {mode === 'deposit' && amount && (
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <span className={`mr-2 ${depositStep !== 'idle' ? 'text-primary-700' : ''}`}>1)</span>
              Check allowance {depositStep === 'checking' && '…'} {depositStep !== 'idle' && depositStep !== 'checking' && '✓'}
            </div>
            <div>
              <span className={`mr-2 ${depositStep === 'approving' ? 'text-primary-700' : ''}`}>2)</span>
              Approve crdUSD (if needed) {depositStep === 'approving' && '…'} {depositStep !== 'idle' && depositStep !== 'checking' && depositStep !== 'approving' && '✓'}
            </div>
            <div>
              <span className={`mr-2 ${depositStep === 'depositing' ? 'text-primary-700' : ''}`}>3)</span>
              Deposit to pool {depositStep === 'depositing' && '…'} {depositStep === 'done' && '✓'}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500">
          Available: <span className="font-medium text-gray-700">{mode === 'deposit'
            ? (rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--')
            : (depositAmount ? formatBigInt(depositAmount, 18, 2) : '--')}</span> crdUSD
        </div>

        {mode === 'deposit' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const amt = parseToBigInt(amount);
              const needsApprove = rusdAllowance !== undefined && amt > 0n && rusdAllowance < amt;
              return needsApprove ? (
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setDepositStep('approving');
                      await approve('rusd', CONTRACTS.STABILITY_POOL, amt);
                      await refetchAllowances();
                      setDepositStep('idle');
                      toast.success('Approved crdUSD');
                    } catch {}
                  }}
                  isLoading={isApproving || depositStep === 'approving'}
                >
                  {isApproving || depositStep === 'approving' ? 'Approving…' : 'Approve crdUSD'}
                </Button>
              ) : null;
            })()}
            <Button
              className="w-full"
              onClick={handleDeposit}
              disabled={(rusdAllowance !== undefined && parseToBigInt(amount) > rusdAllowance) || isApproving}
              isLoading={isDepositing || depositStep === 'checking' || depositStep === 'depositing'}
            >
              {depositStep === 'depositing' || isDepositing ? 'Depositing…' : 'Deposit'}
            </Button>
          </div>
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
