export const LiquidationEngineABI = [
  {
    type: 'function',
    name: 'liquidate',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'batchLiquidate',
    inputs: [{ name: 'vaultIds', type: 'uint256[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Liquidated',
    inputs: [
      { name: 'vaultId', type: 'uint256', indexed: true },
      { name: 'liquidator', type: 'address', indexed: true },
      { name: 'collateralAmount', type: 'uint256', indexed: false },
      { name: 'debtAmount', type: 'uint256', indexed: false },
    ],
  },
] as const;
