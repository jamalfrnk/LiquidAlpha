export const CHAINS = ['evm', 'solana'] as const;
export type Chain = (typeof CHAINS)[number];

export function isChain(value: string): value is Chain {
  return (CHAINS as readonly string[]).includes(value);
}
