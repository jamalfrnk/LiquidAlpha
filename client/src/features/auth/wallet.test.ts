import { describe, it, expect, vi } from 'vitest';
import { connectEvmWallet, getCurrentAccounts } from './wallet';
import type { EIP1193Provider } from './eip6963';

function fakeProvider(overrides: Partial<EIP1193Provider> = {}): EIP1193Provider {
  return {
    request: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

describe('connectEvmWallet', () => {
  it('returns the first account on success', async () => {
    const provider = fakeProvider({ request: vi.fn().mockResolvedValue(['0xABC']) });

    const address = await connectEvmWallet(provider, 'MetaMask');

    expect(address).toBe('0xABC');
    expect(provider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });

  it('throws a specific, recoverable message when the account request is rejected (EIP-1193 code 4001)', async () => {
    const rejection = Object.assign(new Error('User rejected'), { code: 4001 });
    const provider = fakeProvider({ request: vi.fn().mockRejectedValue(rejection) });

    await expect(connectEvmWallet(provider, 'MetaMask')).rejects.toThrow(
      'Connection request cancelled. Liquid Alpha did not receive access to your wallet.',
    );
  });

  it('re-throws a non-rejection error unchanged (not misreported as a user cancellation)', async () => {
    const provider = fakeProvider({ request: vi.fn().mockRejectedValue(new Error('network error')) });

    await expect(connectEvmWallet(provider, 'MetaMask')).rejects.toThrow('network error');
  });

  it('throws a wallet-specific "no account returned" message when the wallet approves but returns no accounts', async () => {
    const provider = fakeProvider({ request: vi.fn().mockResolvedValue([]) });

    await expect(connectEvmWallet(provider, 'Rabby')).rejects.toThrow(
      'Rabby was detected, but no EVM account was returned.',
    );
  });
});

describe('getCurrentAccounts', () => {
  it('calls eth_accounts (silent, no permission prompt) rather than eth_requestAccounts', async () => {
    const provider = fakeProvider({ request: vi.fn().mockResolvedValue(['0xDEF']) });

    const accounts = await getCurrentAccounts(provider);

    expect(accounts).toEqual(['0xDEF']);
    expect(provider.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
  });
});
