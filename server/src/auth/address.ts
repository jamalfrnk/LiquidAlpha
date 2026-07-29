import { getAddress } from 'ethers';
import bs58 from 'bs58';
import type { Chain } from './chain';

/**
 * Normalizes a wallet address to a canonical form and validates it's
 * well-formed for the given chain. Throws on anything invalid rather than
 * silently accepting a malformed address that would just fail signature
 * verification later with a less clear error.
 *
 * EVM: returns the EIP-55 checksummed form, so the same address always maps
 * to the same `users.address` row regardless of the case a client sends.
 * Solana: base58 addresses are case-sensitive, so only whitespace is
 * trimmed -- but the decoded length is checked to reject garbage input.
 */
export function normalizeAddress(address: string, chain: Chain): string {
  if (chain === 'evm') {
    try {
      return getAddress(address);
    } catch {
      throw new Error('Invalid EVM address');
    }
  }

  const trimmed = address.trim();
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(trimmed);
  } catch {
    throw new Error('Invalid Solana address');
  }
  if (decoded.length !== 32) {
    throw new Error('Invalid Solana address');
  }
  return trimmed;
}
