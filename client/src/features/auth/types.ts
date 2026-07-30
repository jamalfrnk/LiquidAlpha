export type Chain = 'evm' | 'solana';

export interface AuthUser {
  id: string;
  address: string;
  chain: Chain;
  builderCode: string;
}
