import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthProvider';
import type { EIP1193Provider } from './eip6963';

const SELECTED_WALLET_RDNS_KEY = 'liquidalpha:selectedWalletRdns';

vi.mock('./api', () => ({
  fetchMe: vi.fn(),
  requestNonce: vi.fn(),
  verifySignature: vi.fn(),
  logout: vi.fn().mockResolvedValue({ success: true }),
}));

import { fetchMe } from './api';

function TestConsumer() {
  const { user, accountChangedNotice, chainId } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? user.address : 'none'}</div>
      <div data-testid="notice">{accountChangedNotice ?? 'none'}</div>
      <div data-testid="chainId">{chainId ?? 'none'}</div>
    </div>
  );
}

function fakeMetaMaskProvider(): { provider: EIP1193Provider; handlers: Map<string, (...args: unknown[]) => void> } {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const provider: EIP1193Provider = {
    // AuthProvider reads eth_chainId once on attach (chainChanged handling) --
    // give it a real resolved value so that call doesn't reject/hang in tests
    // that don't care about chain state.
    request: vi.fn().mockResolvedValue('0x1'),
    on: (event, listener) => {
      handlers.set(event, listener as (...args: unknown[]) => void);
    },
    removeListener: (event) => {
      handlers.delete(event);
    },
  };
  return { provider, handlers };
}

function announceMetaMask(provider: EIP1193Provider) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid: '1', rdns: 'io.metamask', name: 'MetaMask', icon: '' }, provider },
    }),
  );
}

describe('AuthProvider: accountsChanged lifecycle (WALLET-001)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears the session and shows a re-sign notice when the wallet reports a different active account', async () => {
    window.localStorage.setItem(SELECTED_WALLET_RDNS_KEY, 'io.metamask');
    vi.mocked(fetchMe).mockResolvedValue({
      user: { id: '1', address: '0xORIGINAL', chain: 'evm', builderCode: 'x' },
    });

    const { provider, handlers } = fakeMetaMaskProvider();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    announceMetaMask(provider);

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('0xORIGINAL'));
    // The provider's accountsChanged listener is only attached once both
    // the provider is discovered *and* a user is loaded -- confirms it
    // actually got wired up before we rely on invoking it below.
    await waitFor(() => expect(handlers.has('accountsChanged')).toBe(true));

    handlers.get('accountsChanged')!(['0xDIFFERENT']);

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(screen.getByTestId('notice').textContent).toBe(
      'Your active wallet account changed. Sign a new one-time message to continue as this address.',
    );
  });

  it('does not clear the session or show a notice when accountsChanged reports the same address (case-insensitive)', async () => {
    window.localStorage.setItem(SELECTED_WALLET_RDNS_KEY, 'io.metamask');
    vi.mocked(fetchMe).mockResolvedValue({
      user: { id: '1', address: '0xSAME', chain: 'evm', builderCode: 'x' },
    });

    const { provider, handlers } = fakeMetaMaskProvider();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    announceMetaMask(provider);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('0xSAME'));
    await waitFor(() => expect(handlers.has('accountsChanged')).toBe(true));

    handlers.get('accountsChanged')!(['0xsame']); // same address, different case

    // Give any (incorrect) state change a moment to happen, then assert it didn't.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('user').textContent).toBe('0xSAME');
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('reads the chain once on attach and updates it, informationally, on chainChanged -- never blocking or clearing the session', async () => {
    window.localStorage.setItem(SELECTED_WALLET_RDNS_KEY, 'io.metamask');
    vi.mocked(fetchMe).mockResolvedValue({
      user: { id: '1', address: '0xSAME', chain: 'evm', builderCode: 'x' },
    });

    const { provider, handlers } = fakeMetaMaskProvider();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    announceMetaMask(provider);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('0xSAME'));
    // The initial eth_chainId read (mocked to '0x1' in fakeMetaMaskProvider) resolves asynchronously.
    await waitFor(() => expect(screen.getByTestId('chainId').textContent).toBe('0x1'));

    await waitFor(() => expect(handlers.has('chainChanged')).toBe(true));
    handlers.get('chainChanged')!('0x89'); // e.g. switched to Polygon

    await waitFor(() => expect(screen.getByTestId('chainId').textContent).toBe('0x89'));
    // Purely informational -- session and user are untouched by a chain change.
    expect(screen.getByTestId('user').textContent).toBe('0xSAME');
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });
});
