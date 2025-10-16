import { useReadContracts } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { MockOracleABI } from '@/lib/abis/MockOracle';

/**
 * Hook to get oracle data
 */
export function useOracle() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.ORACLE,
        abi: MockOracleABI,
        functionName: 'getPrice',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.ORACLE,
        abi: MockOracleABI,
        functionName: 'isFresh',
        chainId: creditcoinTestnet.id,
      },
    ],
    allowFailure: true,
  });

  return {
    price: data?.[0]?.status === 'success' ? (data?.[0]?.result as bigint) : undefined,
    isFresh: data?.[1]?.result as boolean | undefined,
    lastUpdateTime: undefined,
    isLoading,
    refetch,
  };
}
