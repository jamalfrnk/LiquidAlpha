import { describe, it, expect } from 'vitest';
import { buildSignMessage } from './message';

describe('buildSignMessage', () => {
  const base = {
    domain: 'example.com',
    address: '0xAbC1234567890000000000000000000000000000',
    chain: 'evm' as const,
    nonce: 'deadbeef',
    issuedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-01T00:05:00.000Z'),
  };

  it('embeds every field the caller must be able to verify later', () => {
    const message = buildSignMessage(base);
    expect(message).toContain('example.com wants you to sign in');
    expect(message).toContain(base.address);
    expect(message).toContain('URI: https://example.com');
    expect(message).toContain('Chain: evm');
    expect(message).toContain('Nonce: deadbeef');
    expect(message).toContain('Issued At: 2026-01-01T00:00:00.000Z');
    expect(message).toContain('Expiration Time: 2026-01-01T00:05:00.000Z');
  });

  it('is deterministic -- same params always produce the same string', () => {
    expect(buildSignMessage(base)).toBe(buildSignMessage({ ...base }));
  });

  it('changes when the domain changes, so a phishing-site message never matches', () => {
    const a = buildSignMessage(base);
    const b = buildSignMessage({ ...base, domain: 'evil.com' });
    expect(a).not.toBe(b);
  });

  it('changes when the nonce changes, so an old signed message cannot be replayed for a new nonce', () => {
    const a = buildSignMessage(base);
    const b = buildSignMessage({ ...base, nonce: 'different' });
    expect(a).not.toBe(b);
  });
});
