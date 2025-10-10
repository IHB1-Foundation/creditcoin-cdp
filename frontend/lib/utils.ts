import { type ClassValue, clsx } from 'clsx';
import { formatUnits, parseUnits } from 'viem';

/**
 * Utility function for merging Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a BigInt to a human-readable string
 */
export function formatBigInt(value: bigint, decimals: number = 18, displayDecimals: number = 4): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);

  if (num === 0) return '0';
  if (num < 0.0001) return '< 0.0001';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

/**
 * Convert a BigInt token amount to a plain, non-localized decimal string suitable for input fields.
 * Does not include thousands separators and preserves full precision unless maxDecimals is provided.
 */
export function formatForInput(value: bigint, decimals: number = 18, maxDecimals?: number): string {
  let s = formatUnits(value, decimals);
  if (maxDecimals === undefined) return s;
  const [intPart, fracPart = ''] = s.split('.');
  if (maxDecimals <= 0) return intPart;
  return fracPart.length ? `${intPart}.${fracPart.slice(0, maxDecimals)}` : intPart;
}

/**
 * Format a BigInt compactly (e.g., 12.3K, 4.5M)
 */
export function formatCompactBigInt(value: bigint, decimals: number = 18): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(num);
}

/**
 * Parse a string to BigInt
 */
export function parseToBigInt(value: string, decimals: number = 18): bigint {
  try {
    if (!value || value === '') return BigInt(0);
    return parseUnits(value, decimals);
  } catch {
    return BigInt(0);
  }
}

/**
 * Format USD amount
 */
export function formatUSD(value: bigint, decimals: number = 18): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format percentage
 */
export function formatPercentage(value: bigint, precision: bigint = BigInt(1e18)): string {
  const num = Number(value * BigInt(10000) / precision) / 100;
  return `${num.toFixed(2)}%`;
}

/**
 * Calculate collateral ratio
 */
export function calculateCollateralRatio(
  collateral: bigint,
  debt: bigint,
  price: bigint,
  precision: bigint = BigInt(1e18)
): bigint {
  if (debt === BigInt(0)) return BigInt(0);
  const collateralValue = (collateral * price) / precision;
  return (collateralValue * precision) / debt;
}

/**
 * Calculate liquidation price
 */
export function calculateLiquidationPrice(
  collateral: bigint,
  debt: bigint,
  mcr: bigint,
  precision: bigint = BigInt(1e18)
): bigint {
  if (collateral === BigInt(0)) return BigInt(0);
  return (debt * mcr) / collateral;
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Shorten address
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get health status based on collateral ratio
 */
export function getHealthStatus(ratio: bigint, mcr: bigint): {
  status: 'healthy' | 'warning' | 'danger';
  label: string;
  color: string;
} {
  const MCR_BUFFER = BigInt(1.1e18); // 110% for warning

  if (ratio >= mcr + MCR_BUFFER) {
    return { status: 'healthy', label: 'Healthy', color: 'text-success' };
  } else if (ratio >= mcr) {
    return { status: 'warning', label: 'At Risk', color: 'text-warning' };
  } else {
    return { status: 'danger', label: 'Liquidatable', color: 'text-error' };
  }
}

/**
 * Format transaction error
 */
export function formatError(error: any): string {
  if (!error) return 'Unknown error';

  // Handle common errors
  if (error.message?.includes('User rejected')) {
    return 'Transaction rejected by user';
  }
  if (error.message?.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  }
  if (error.message?.includes('StalePrice')) {
    return 'Oracle price is stale. Please try again.';
  }
  if (error.message?.includes('InsufficientCollateralRatio')) {
    return 'Insufficient collateral ratio';
  }
  if (error.message?.includes('Unauthorized')) {
    return 'Unauthorized action';
  }

  // Return shortened error message
  const msg = error.message || error.toString();
  return msg.length > 100 ? msg.slice(0, 100) + '...' : msg;
}
