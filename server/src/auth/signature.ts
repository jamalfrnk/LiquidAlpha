import { verifyMessage } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import type { Chain } from './chain';

/**
 * Verifies a wallet signed `message` with the private key for `address` on
 * `chain`. Returns false on any malformed input rather than throwing, so
 * callers can treat "invalid signature" and "couldn't even parse the
 * signature" identically -- both mean the request is rejected.
 *
 * EVM signatures are the standard 0x-prefixed hex string from
 * personal_sign/eth_sign. Solana signatures are base58, matching what
 * wallet adapters (Phantom, etc.) return from signMessage.
 */
export function verifySignature(
  chain: Chain,
  address: string,
  message: string,
  signature: string,
): boolean {
  try {
    if (chain === 'evm') {
      const recovered = verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    }

    const publicKey = bs58.decode(address);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
  } catch {
    return false;
  }
}
