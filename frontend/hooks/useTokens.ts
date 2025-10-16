import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBalance, useChainId, usePublicClient } from 'wagmi';
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
        chainId: creditcoinTestnet.id,
      },
    ],
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
        chainId: creditcoinTestnet.id,
      },
    ],
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
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const approve = async (token: 'wctc' | 'rusd', spender: `0x${string}`, amount: bigint) => {
    try {
      if (!spender || !/^0x[0-9a-fA-F]{40}$/.test(spender)) {
        throw new Error('Invalid spender address');
      }
      if (!address) {
        throw new Error('Wallet not connected');
      }
      if (chainId && creditcoinTestnet.id && chainId !== creditcoinTestnet.id) {
        throw new Error('Wrong network: switch to configured testnet');
      }
      const tokenAddress = token === 'wctc' ? CONTRACTS.WCTC : CONTRACTS.RUSD;
      const abi = token === 'wctc' ? WCTCABI : ERC20ABI;

      // Direct approval with safe patterns (no simulation to avoid RPC issues)
      const max = (1n << 256n) - 1n;
      try {
        // Conservative, highly-compatible sequence: zero then max
        // Some tokens require zeroing before setting any non-zero allowance.
        const gasZero = await publicClient.estimateContractGas({ address: tokenAddress, abi: abi as any, functionName: 'approve', args: [spender, 0n], account: address as any });
        await writeContract({ address: tokenAddress, abi, functionName: 'approve', args: [spender, 0n], chainId: creditcoinTestnet.id, gas: gasZero * 2n });
      } catch (_) {
        // ignore zeroing failures; proceed to set max
      }
      const gasMax = await publicClient.estimateContractGas({ address: tokenAddress, abi: abi as any, functionName: 'approve', args: [spender, max], account: address as any });
      await writeContract({ address: tokenAddress, abi, functionName: 'approve', args: [spender, max], chainId: creditcoinTestnet.id, gas: gasMax * 2n });
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
