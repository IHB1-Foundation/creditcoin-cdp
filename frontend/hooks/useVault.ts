import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS } from '@/lib/config';
import { VaultManagerABI } from '@/lib/abis/VaultManager';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

export interface Vault {
  owner: string;
  collateral: bigint;
  debt: bigint;
  timestamp: bigint;
}

/**
 * Hook to get user's vaults
 */
export function useUserVaults() {
  const { address } = useAccount();

  const { data: vaultIds = [], isLoading, refetch } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getUserVaults',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  return { vaultIds: vaultIds as bigint[], isLoading, refetch };
}

/**
 * Hook to get vault data
 */
export function useVaultData(vaultId: bigint | undefined) {
  const { data: vault, isLoading, refetch } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVault',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: {
      enabled: vaultId !== undefined,
    },
  });

  const { data: ratio } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultCollateralRatio',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: {
      enabled: vaultId !== undefined && vault !== undefined,
    },
  });

  const { data: canLiquidate } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'canLiquidate',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: {
      enabled: vaultId !== undefined && vault !== undefined,
    },
  });

  return {
    vault: vault as Vault | undefined,
    collateralRatio: ratio as bigint | undefined,
    canLiquidate: canLiquidate as boolean | undefined,
    isLoading,
    refetch,
  };
}

/**
 * Hook to open a vault
 */
export function useOpenVault() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const openVault = async (collateralAmount: bigint, debtAmount: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'openVault',
        args: [collateralAmount, debtAmount],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    openVault,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to adjust vault
 */
export function useAdjustVault() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const adjustVault = async (vaultId: bigint, collateralDelta: bigint, debtDelta: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'adjustVault',
        args: [vaultId, collateralDelta, debtDelta],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    adjustVault,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to close vault
 */
export function useCloseVault() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const closeVault = async (vaultId: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'closeVault',
        args: [vaultId],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    closeVault,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
    error,
  };
}

/**
 * Hook to get protocol parameters
 */
export function useProtocolParams() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'minCollateralRatio',
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'borrowingFee',
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'redemptionFee',
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'totalDebt',
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'totalCollateral',
      },
    ],
  });

  return {
    mcr: data?.[0]?.result as bigint | undefined,
    borrowingFee: data?.[1]?.result as bigint | undefined,
    redemptionFee: data?.[2]?.result as bigint | undefined,
    totalDebt: data?.[3]?.result as bigint | undefined,
    totalCollateral: data?.[4]?.result as bigint | undefined,
    isLoading,
  };
}
