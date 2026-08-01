export type Chain = 'evm' | 'solana';

/** 'guest' for a server-managed practice session with no wallet (AUTH-GUEST-001); 'wallet' otherwise. */
export type UserKind = 'wallet' | 'guest';

export interface AuthUser {
  id: string;
  address: string;
  chain: Chain;
  builderCode: string;
  kind: UserKind;
}
