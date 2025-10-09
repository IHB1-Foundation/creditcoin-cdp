import { useReadContracts } from 'wagmi';
import { CONTRACTS } from '@/lib/config';
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
        functionName: 'price',
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
    ],
  });

  return {
    price: data?.[0]?.result as bigint | undefined,
    isFresh: data?.[1]?.result as boolean | undefined,
    lastUpdateTime: data?.[2]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}
