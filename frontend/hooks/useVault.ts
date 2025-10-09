import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS } from '@/lib/config';
import { VaultManagerABI } from '@/lib/abis/VaultManager';
import { toast } from 'react-hot-toast';
import { formatError } from '@/lib/utils';

export interface VaultBasic {
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
  const { data: vaultBasic, isLoading, refetch } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultBasic',
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
      enabled: vaultId !== undefined && vaultBasic !== undefined,
    },
  });

  const { data: canLiquidate } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'canLiquidate',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: {
      enabled: vaultId !== undefined && vaultBasic !== undefined,
    },
  });

  const { data: interest } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultInterest',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: {
      enabled: vaultId !== undefined,
    },
  });

  return {
    vault: vaultBasic as VaultBasic | undefined,
    collateralRatio: ratio as bigint | undefined,
    canLiquidate: canLiquidate as boolean | undefined,
    interestRate: interest as bigint | undefined,
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

  const openVault = async (collateralAmount: bigint, debtAmount: bigint, interestRate: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'openVault',
        args: [collateralAmount, debtAmount, interestRate],
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
 * Hook to update vault interest rate
 */
export function useUpdateInterest() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const updateInterest = async (vaultId: bigint, newRate: bigint) => {
    try {
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'updateInterestRate',
        args: [vaultId, newRate],
      });
    } catch (err: any) {
      toast.error(formatError(err));
      throw err;
    }
  };

  return {
    updateInterest,
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
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'getTotalDebtCurrent',
      },
    ],
  });

  return {
    mcr: data?.[0]?.result as bigint | undefined,
    borrowingFee: data?.[1]?.result as bigint | undefined,
    redemptionFee: data?.[2]?.result as bigint | undefined,
    totalDebt: data?.[3]?.result as bigint | undefined,
    totalCollateral: data?.[4]?.result as bigint | undefined,
    totalDebtCurrent: data?.[5]?.result as bigint | undefined,
    isLoading,
  };
}

/**
 * Hook to read system interest stats
 */
export function useInterestStats() {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getInterestStats',
  });

  // data is tuple [minRate, maxRate, avgRate, count]
  return {
    minRate: (data as any)?.[0] as bigint | undefined,
    maxRate: (data as any)?.[1] as bigint | undefined,
    avgRate: (data as any)?.[2] as bigint | undefined,
    weightedAvgRate: (data as any)?.[3] as bigint | undefined,
    activeVaultCount: (data as any)?.[4] as bigint | undefined,
    isLoading,
    refetch,
  };
}
