'use client';

import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatCard } from './ui/StatCard';
import { useAccount } from 'wagmi';
import { useRedemptionEstimate, useRedeem } from '@/hooks/useRedemption';
import { useTokenBalances, useAllowances, useApprove } from '@/hooks/useTokens';
import { useOracle } from '@/hooks/useOracle';
import { CONTRACTS } from '@/lib/config';
import { formatBigInt, formatPercentage, formatUSD, parseToBigInt } from '@/lib/utils';
import toast from 'react-hot-toast';

export function RedemptionCard() {
  const { address, isConnected } = useAccount();
  const { rusdBalance, refetch: refetchBalances } = useTokenBalances();
  const { rusdAllowance, refetch: refetchAllowances } = useAllowances(CONTRACTS.VAULT_MANAGER);
  const { price } = useOracle();

  const [amount, setAmount] = useState('');
  const amountBigInt = amount ? parseToBigInt(amount) : undefined;

  const { estimatedCollateral, grossCollateral, feeAmount, redemptionFeeRate } = useRedemptionEstimate(amountBigInt);
  const { redeem, isPending: isRedeeming, isSuccess: redeemSuccess } = useRedeem();
  const { approve, isPending: isApproving, isSuccess: approveSuccess } = useApprove();

  // Refetch data when transactions succeed
  useEffect(() => {
    if (redeemSuccess || approveSuccess) {
      refetchBalances();
      refetchAllowances();
    }
  }, [redeemSuccess, approveSuccess]);

  // Reset form and show success
  useEffect(() => {
    if (redeemSuccess) {
      setAmount('');
      toast.success('Redemption successful!');
    }
  }, [redeemSuccess]);

  const handleRedeem = async () => {
    if (!address) return;

    try {
      const redeemAmount = parseToBigInt(amount);

      if (redeemAmount === BigInt(0)) {
        toast.error('Please enter a valid amount');
        return;
      }

      if (rusdBalance !== undefined && redeemAmount > rusdBalance) {
        toast.error('Insufficient crdUSD balance');
        return;
      }

      // Check approval
      if (rusdAllowance === undefined || rusdAllowance < redeemAmount) {
        toast('Approving crdUSD...', { icon: '⏳' });
        await approve('rusd', CONTRACTS.VAULT_MANAGER, redeemAmount * BigInt(2));
        return;
      }

      await redeem(redeemAmount, address);
    } catch (error) {
      // Error handling in hook
    }
  };

  if (!isConnected) {
    return (
      <Card title="Redemption" subtitle="Redeem crdUSD for wCTC">
        <div className="text-center py-12">
          <p className="text-gray-500">Connect your wallet to redeem</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Redemption" subtitle="Burn crdUSD to receive wCTC collateral">
      {/* Amount */}
      <div className="space-y-3">
        <Input
          type="number"
          label="crdUSD Amount"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          rightElement={
            <button
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => rusdBalance && setAmount(formatBigInt(rusdBalance, 18, 18))}
            >
              MAX
            </button>
          }
        />

        <div className="text-xs text-gray-500">
          Available: <span className="font-medium text-gray-700">{rusdBalance ? formatBigInt(rusdBalance, 18, 2) : '--'}</span> crdUSD
        </div>

        {/* Estimate */}
        {amountBigInt && amountBigInt > BigInt(0) && estimatedCollateral !== undefined && (
          <div className="rounded-xl p-4 border border-gray-100 bg-gradient-to-br from-gray-50 to-white space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gross Collateral</span>
              <span className="font-semibold text-gray-900">
                {grossCollateral ? formatBigInt(grossCollateral, 18, 4) : '--'} wCTC
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Redemption Fee {redemptionFeeRate ? `(${formatPercentage(redemptionFeeRate)})` : ''}</span>
              <span className="text-sm text-error font-medium">
                - {feeAmount ? formatBigInt(feeAmount, 18, 4) : '--'} wCTC
              </span>
            </div>

            <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">You Will Receive</span>
              <div className="text-right">
                <p className="font-semibold text-lg text-success">
                  {formatBigInt(estimatedCollateral, 18, 4)} wCTC
                </p>
                {price && (
                  <p className="text-xs text-gray-500">
                    ≈ {formatUSD((estimatedCollateral * price) / BigInt(1e18))}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleRedeem}
          isLoading={isRedeeming || isApproving}
          disabled={!amount || !amountBigInt || amountBigInt === BigInt(0)}
        >
          {isApproving ? 'Approving...' : 'Redeem'}
        </Button>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-warning/10 border border-warning/20 rounded-xl">
        <p className="text-sm text-warning font-medium mb-2">⚠️ Important</p>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Redemptions target vaults with lowest collateral ratio</li>
          <li>• Oracle price is used for redemption rate</li>
          <li>• A {redemptionFeeRate ? formatPercentage(redemptionFeeRate) : '0.5%'} fee applies</li>
          <li>• Vaults below MCR are skipped</li>
        </ul>
      </div>

      {/* How it Works */}
      <div className="mt-4 p-4 bg-primary-50 border border-primary-200 rounded-xl">
        <p className="text-sm text-primary-900 font-medium mb-2">💡 How redemptions work</p>
        <ul className="text-sm text-primary-800 space-y-1">
          <li>• Burn your crdUSD to receive wCTC at oracle price</li>
          <li>• Protocol targets riskiest vaults first</li>
          <li>• Great arbitrage when crdUSD trades below $1</li>
          <li>• Helps maintain the crdUSD peg</li>
        </ul>
      </div>
    </Card>
  );
}
