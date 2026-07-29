import type { Chain } from './chain';

export interface SignMessageParams {
  domain: string;
  address: string;
  chain: Chain;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * Builds the exact message a wallet is asked to sign, SIWE-inspired
 * (https://eips.ethereum.org/EIPS/eip-4361) but simplified for a dual
 * EVM/Solana app. `domain` is bound into the message specifically so a
 * signature obtained by a phishing site presenting this same text under a
 * different origin cannot be replayed against this server -- the server
 * reconstructs this string itself from stored nonce state rather than
 * trusting whatever message text a client sends back, so the domain check
 * is real, not just decorative.
 */
export function buildSignMessage(params: SignMessageParams): string {
  const { domain, address, chain, nonce, issuedAt, expiresAt } = params;
  return [
    `${domain} wants you to sign in with your account:`,
    address,
    '',
    `URI: https://${domain}`,
    `Chain: ${chain}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join('\n');
}
