import { useReadContracts } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { PushOracleABI } from '@/lib/abis/PushOracle';

/**
 * Hook to get oracle data
 */
export function useOracle() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.ORACLE,
        abi: PushOracleABI,
        functionName: 'getPrice',
      },
      {
        address: CONTRACTS.ORACLE,
        abi: PushOracleABI,
        functionName: 'isFresh',
      },
      {
        address: CONTRACTS.ORACLE,
        abi: PushOracleABI,
        functionName: 'lastUpdateTime',
      },
      {
        // Fallback to raw stored price if getPrice() reverts due to staleness
        address: CONTRACTS.ORACLE,
        abi: PushOracleABI,
        functionName: 'price',
      },
    ],
    chainId: creditcoinTestnet.id,
    allowFailure: true,
  });

  return {
    price:
      // Prefer fresh price
      (data?.[0]?.status === 'success' ? (data?.[0]?.result as bigint) : undefined) ??
      // Fallback to stored price even if stale
      (data?.[3]?.status === 'success' ? (data?.[3]?.result as bigint) : undefined),
    isFresh: data?.[1]?.result as boolean | undefined,
    lastUpdateTime: data?.[2]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}
