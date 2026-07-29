import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { normalizeAddress } from './address';

describe('normalizeAddress', () => {
  it('checksums a valid EVM address regardless of input case', () => {
    const wallet = Wallet.createRandom();
    const lower = wallet.address.toLowerCase();
    expect(normalizeAddress(lower, 'evm')).toBe(wallet.address);
    expect(normalizeAddress(wallet.address.toUpperCase().replace('0X', '0x'), 'evm')).toBe(wallet.address);
  });

  it('rejects a malformed EVM address', () => {
    expect(() => normalizeAddress('not-an-address', 'evm')).toThrow('Invalid EVM address');
    expect(() => normalizeAddress('0x123', 'evm')).toThrow('Invalid EVM address');
  });

  it('passes through a valid Solana address (base58, decodes to 32 bytes)', () => {
    const { publicKey } = nacl.sign.keyPair();
    const address = bs58.encode(publicKey);
    expect(normalizeAddress(`  ${address}  `, 'solana')).toBe(address);
  });

  it('rejects a Solana address that is not valid base58 or the wrong length', () => {
    expect(() => normalizeAddress('not-base58-!!!', 'solana')).toThrow('Invalid Solana address');
    expect(() => normalizeAddress(bs58.encode(new Uint8Array(16)), 'solana')).toThrow('Invalid Solana address');
  });
});
