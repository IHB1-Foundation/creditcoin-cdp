import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS } from '@/lib/config';
import { StabilityPoolABI } from '@/lib/abis/StabilityPool';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

/**
 * Hook to get stability pool data
 */
export function useStabilityPoolData() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.STABILITY_POOL,
        abi: StabilityPoolABI,
        functionName: 'getDepositorInfo',
        args: address ? [address] : undefined,
      },
      {
        address: CONTRACTS.STABILITY_POOL,
        abi: StabilityPoolABI,
        functionName: 'getTotalDeposits',
      },
    ],
    query: {
      enabled: !!address,
    },
  });

  const depositorInfo = data?.[0]?.result as [bigint, bigint] | undefined;

  return {
    depositAmount: depositorInfo?.[0] || BigInt(0),
    collateralGain: depositorInfo?.[1] || BigInt(0),
    totalDeposits: data?.[1]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to deposit to stability pool
 */
export function useStabilityDeposit() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const deposit = async (amount: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.STABILITY_POOL,
        abi: StabilityPoolABI,
        functionName: 'deposit',
        args: [amount],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    deposit,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to withdraw from stability pool
 */
export function useStabilityWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const withdraw = async (amount: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.STABILITY_POOL,
        abi: StabilityPoolABI,
        functionName: 'withdraw',
        args: [amount],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    withdraw,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to claim collateral gain
 */
export function useClaimCollateralGain() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = async () => {
    try {
      await writeContract({
        address: CONTRACTS.STABILITY_POOL,
        abi: StabilityPoolABI,
        functionName: 'withdrawCollateralGain',
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    claim,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}
