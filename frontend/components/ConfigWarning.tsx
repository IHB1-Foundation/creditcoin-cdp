'use client';

import { CONTRACTS, creditcoinTestnet } from '@/lib/config';

function isZero(addr: `0x${string}`) {
  return addr === '0x' || addr === '0x0000000000000000000000000000000000000000';
}

export function ConfigWarning() {
  const unset: string[] = [];
  if (isZero(CONTRACTS.WCTC)) unset.push('WCTC');
  if (isZero(CONTRACTS.RUSD)) unset.push('RUSD');
  if (isZero(CONTRACTS.VAULT_MANAGER)) unset.push('VaultManager');
  if (isZero(CONTRACTS.STABILITY_POOL)) unset.push('StabilityPool');
  if (isZero(CONTRACTS.LIQUIDATION_ENGINE)) unset.push('LiquidationEngine');
  if (isZero(CONTRACTS.ORACLE)) unset.push('Oracle');
  if (isZero(CONTRACTS.TREASURY)) unset.push('Treasury');

  if (unset.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 mt-4">
      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
        <p className="font-medium">Contracts not configured</p>
        <p className="mt-1">Missing addresses for: {unset.join(', ')}. Set NEXT_PUBLIC_* in .env with chainId {creditcoinTestnet.id}.</p>
      </div>
    </div>
  );
}

