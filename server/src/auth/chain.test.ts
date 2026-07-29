import { describe, it, expect } from 'vitest';
import { isChain } from './chain';

describe('isChain', () => {
  it('accepts the supported chains', () => {
    expect(isChain('evm')).toBe(true);
    expect(isChain('solana')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isChain('bitcoin')).toBe(false);
    expect(isChain('')).toBe(false);
  });
});
