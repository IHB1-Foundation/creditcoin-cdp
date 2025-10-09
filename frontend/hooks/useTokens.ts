import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS } from '@/lib/config';
import { ERC20ABI } from '@/lib/abis/ERC20';
import { WCTCABI } from '@/lib/abis/WCTC';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

/**
 * Hook to get token balances
 */
export function useTokenBalances() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.WCTC,
        abi: WCTCABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
      {
        address: CONTRACTS.RUSD,
        abi: ERC20ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
    ],
    query: {
      enabled: !!address,
    },
  });

  return {
    wctcBalance: data?.[0]?.result as bigint | undefined,
    rusdBalance: data?.[1]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to get allowances
 */
export function useAllowances(spender: `0x${string}`) {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.WCTC,
        abi: WCTCABI,
        functionName: 'allowance',
        args: address && spender ? [address, spender] : undefined,
      },
      {
        address: CONTRACTS.RUSD,
        abi: ERC20ABI,
        functionName: 'allowance',
        args: address && spender ? [address, spender] : undefined,
      },
    ],
    query: {
      enabled: !!address && !!spender,
    },
  });

  return {
    wctcAllowance: data?.[0]?.result as bigint | undefined,
    rusdAllowance: data?.[1]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to approve token
 */
export function useApprove() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const approve = async (token: 'wctc' | 'rusd', spender: `0x${string}`, amount: bigint) => {
    try {
      const tokenAddress = token === 'wctc' ? CONTRACTS.WCTC : CONTRACTS.RUSD;
      const abi = token === 'wctc' ? WCTCABI : ERC20ABI;

      await writeContract({
        address: tokenAddress,
        abi,
        functionName: 'approve',
        args: [spender, amount],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    approve,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to wrap native tokens to wCTC
 */
export function useWrap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const wrap = async (amount: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.WCTC,
        abi: WCTCABI,
        functionName: 'wrap',
        value: amount,
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    wrap,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to unwrap wCTC to native tokens
 */
export function useUnwrap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const unwrap = async (amount: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.WCTC,
        abi: WCTCABI,
        functionName: 'unwrap',
        args: [amount],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    unwrap,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}
