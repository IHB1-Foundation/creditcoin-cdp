import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
import { LiquidationEngineABI } from '@/lib/abis/LiquidationEngine';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

/**
 * Hook to liquidate a vault
 */
export function useLiquidate() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const liquidate = async (vaultId: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.LIQUIDATION_ENGINE,
        abi: LiquidationEngineABI,
        functionName: 'liquidate',
        args: [vaultId],
        chainId: creditcoinTestnet.id,
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    liquidate,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}
