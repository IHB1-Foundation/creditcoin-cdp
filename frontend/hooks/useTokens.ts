import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { ERC20ABI } from '@/lib/abis/ERC20';
import { WCTCABI } from '@/lib/abis/WCTC';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

/**
 * Hook to get token balances
 */
export function useTokenBalances() {
  const { address } = useAccount();
  const { data: nativeBal } = useBalance({ address, chainId: creditcoinTestnet.id, query: { enabled: !!address } });

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.RUSD,
        abi: ERC20ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
    ],
    chainId: creditcoinTestnet.id,
    query: {
      enabled: !!address,
    },
  });

  return {
    tctcBalance: nativeBal?.value as bigint | undefined,
    rusdBalance: data?.[0]?.result as bigint | undefined,
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
        address: CONTRACTS.RUSD,
        abi: ERC20ABI,
        functionName: 'allowance',
        args: address && spender ? [address, spender] : undefined,
      },
    ],
    chainId: creditcoinTestnet.id,
    query: {
      enabled: !!address && !!spender,
    },
  });

  return {
    rusdAllowance: data?.[0]?.result as bigint | undefined,
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
        chainId: creditcoinTestnet.id,
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
        chainId: creditcoinTestnet.id,
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
