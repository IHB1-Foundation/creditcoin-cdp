import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, creditcoinTestnet } from '@/lib/config';
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
    chainId: creditcoinTestnet.id,
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
  const { data: vaultBasicRaw, isLoading, refetch } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultBasic',
    args: vaultId !== undefined ? [vaultId] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: vaultId !== undefined,
    },
  });
  // Normalize vault struct result from wagmi (can be array or named object)
  let vaultBasic: VaultBasic | undefined = undefined;
  if (vaultBasicRaw !== undefined) {
    const vb: any = vaultBasicRaw as any;
    if (Array.isArray(vb) && vb.length >= 4) {
      vaultBasic = {
        owner: vb[0] as string,
        collateral: vb[1] as bigint,
        debt: vb[2] as bigint,
        timestamp: vb[3] as bigint,
      };
    } else if (vb && typeof vb === 'object' && 'owner' in vb && 'collateral' in vb && 'debt' in vb && 'timestamp' in vb) {
      vaultBasic = vb as VaultBasic;
    }
  }

  const { data: ratio } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultCollateralRatio',
    args: vaultId !== undefined ? [vaultId] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: vaultId !== undefined && vaultBasic !== undefined,
    },
  });

  const { data: canLiquidate } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'canLiquidate',
    args: vaultId !== undefined ? [vaultId] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: vaultId !== undefined && vaultBasic !== undefined,
    },
  });

  const { data: interest } = useReadContract({
    address: CONTRACTS.VAULT_MANAGER,
    abi: VaultManagerABI,
    functionName: 'getVaultInterest',
    args: vaultId !== undefined ? [vaultId] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: vaultId !== undefined,
    },
  });

  return {
    vault: vaultBasic,
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
      // Use native path: collateralAmount is sent as msg.value
      await writeContract({
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'openVaultNative',
        args: [debtAmount, interestRate],
        value: collateralAmount,
        chainId: creditcoinTestnet.id,
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
      // Native first for collateral if positive, then handle debt change
      if (collateralDelta > 0n) {
        await writeContract({
          address: CONTRACTS.VAULT_MANAGER,
          abi: VaultManagerABI,
          functionName: 'depositCollateralNative',
          args: [vaultId],
          value: collateralDelta,
          chainId: creditcoinTestnet.id,
        });
      } else if (collateralDelta < 0n) {
        await writeContract({
          address: CONTRACTS.VAULT_MANAGER,
          abi: VaultManagerABI,
          functionName: 'withdrawCollateralNative',
          args: [vaultId, BigInt(-collateralDelta)],
          chainId: creditcoinTestnet.id,
        });
      }
      if (debtDelta !== 0n) {
        await writeContract({
          address: CONTRACTS.VAULT_MANAGER,
          abi: VaultManagerABI,
          functionName: 'adjustVault',
          args: [vaultId, 0n, debtDelta],
          chainId: creditcoinTestnet.id,
        });
      }
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
        functionName: 'closeVaultNative',
        args: [vaultId],
        chainId: creditcoinTestnet.id,
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
        chainId: creditcoinTestnet.id,
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
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'liquidationRatio',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'borrowingFee',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'redemptionFee',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'totalDebt',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'totalCollateral',
        chainId: creditcoinTestnet.id,
      },
      {
        address: CONTRACTS.VAULT_MANAGER,
        abi: VaultManagerABI,
        functionName: 'getTotalDebtCurrent',
        chainId: creditcoinTestnet.id,
      },
    ],
  });

  return {
    mcr: data?.[0]?.result as bigint | undefined,
    liquidationRatio: data?.[1]?.result as bigint | undefined,
    borrowingFee: data?.[2]?.result as bigint | undefined,
    redemptionFee: data?.[3]?.result as bigint | undefined,
    totalDebt: data?.[4]?.result as bigint | undefined,
    totalCollateral: data?.[5]?.result as bigint | undefined,
    totalDebtCurrent: data?.[6]?.result as bigint | undefined,
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
    chainId: creditcoinTestnet.id,
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
