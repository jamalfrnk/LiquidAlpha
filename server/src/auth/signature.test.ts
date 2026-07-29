import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { verifySignature } from './signature';

describe('verifySignature (evm)', () => {
  it('accepts a real signature from the claimed address', async () => {
    const wallet = Wallet.createRandom();
    const message = 'sign in please';
    const signature = await wallet.signMessage(message);
    expect(verifySignature('evm', wallet.address, message, signature)).toBe(true);
  });

  it('rejects a signature from a different wallet', async () => {
    const wallet = Wallet.createRandom();
    const impostor = Wallet.createRandom();
    const message = 'sign in please';
    const signature = await impostor.signMessage(message);
    expect(verifySignature('evm', wallet.address, message, signature)).toBe(false);
  });

  it('rejects a valid signature over a different (tampered) message', async () => {
    const wallet = Wallet.createRandom();
    const signature = await wallet.signMessage('original message');
    expect(verifySignature('evm', wallet.address, 'tampered message', signature)).toBe(false);
  });

  it('rejects garbage input instead of throwing', () => {
    expect(verifySignature('evm', '0xnotanaddress', 'msg', 'not-a-signature')).toBe(false);
  });
});

describe('verifySignature (solana)', () => {
  it('accepts a real detached signature from the claimed keypair', () => {
    const { publicKey, secretKey } = nacl.sign.keyPair();
    const address = bs58.encode(publicKey);
    const message = 'sign in please';
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), secretKey));
    expect(verifySignature('solana', address, message, signature)).toBe(true);
  });

  it('rejects a signature from a different keypair', () => {
    const { publicKey: claimedPublicKey } = nacl.sign.keyPair();
    const { secretKey: impostorSecretKey } = nacl.sign.keyPair();
    const address = bs58.encode(claimedPublicKey);
    const message = 'sign in please';
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), impostorSecretKey));
    expect(verifySignature('solana', address, message, signature)).toBe(false);
  });

  it('rejects garbage input instead of throwing', () => {
    expect(verifySignature('solana', 'not-base58', 'msg', 'also-not-base58')).toBe(false);
  });
});
