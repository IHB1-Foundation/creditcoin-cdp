import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { VaultManagerABI } from '@/lib/abis/VaultManager';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

/**
 * Hook to get redemption estimate
 */
export function useRedemptionEstimate(rUSDAmount: bigint | undefined) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'getRedeemableAmount',
        args: rUSDAmount ? [rUSDAmount] : undefined,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'redemptionFee',
      },
    ],
    chainId: creditcoinTestnet.id,
    query: {
      enabled: rUSDAmount !== undefined && rUSDAmount > 0,
    },
  });

  const estimatedCollateral = data?.[0]?.result as bigint | undefined;
  const redemptionFee = data?.[1]?.result as bigint | undefined;

  // Calculate gross collateral before fee
  let grossCollateral: bigint | undefined;
  let feeAmount: bigint | undefined;

  if (estimatedCollateral !== undefined && redemptionFee !== undefined) {
    // net = gross - fee, where fee = gross * redemptionFee / 1e18
    // net = gross * (1 - redemptionFee / 1e18)
    // gross = net / (1 - redemptionFee / 1e18)
    const precision = BigInt(1e18);
    const multiplier = precision - redemptionFee;
    grossCollateral = (estimatedCollateral * precision) / multiplier;
    feeAmount = grossCollateral - estimatedCollateral;
  }

  return {
    estimatedCollateral,
    grossCollateral,
    feeAmount,
    redemptionFeeRate: redemptionFee,
    isLoading,
  };
}

/**
 * Hook to redeem crdUSD
 */
export function useRedeem() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const redeem = async (
    rUSDAmount: bigint,
    receiver: `0x${string}`,
    maxInterestRate?: bigint,
    preferLargerDebt?: boolean,
  ) => {
    try {
      // Always redeem to native tCTC for receiver
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'redeemNative',
        args: [rUSDAmount, receiver],
        chainId: creditcoinTestnet.id,
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    redeem,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}
