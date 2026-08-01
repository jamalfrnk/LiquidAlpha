import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEip6963Providers,
  walletLabel,
  isPhantomInstalledWithoutEvmProvider,
  type EIP6963ProviderDetail,
} from './eip6963';

function announce(detail: EIP6963ProviderDetail) {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
}

function fakeDetail(uuid: string, rdns: string, name: string): EIP6963ProviderDetail {
  return {
    info: { uuid, rdns, name, icon: '' },
    provider: {
      request: async () => [],
      on: () => {},
      removeListener: () => {},
    },
  };
}

interface WindowWithPhantom extends Window {
  phantom?: { solana?: unknown };
}

afterEach(() => {
  // Clean up window.phantom between tests since isPhantomInstalledWithoutEvmProvider reads it --
  // scoped at file level (not per-describe) so it applies across every describe block below.
  delete (window as WindowWithPhantom).phantom;
});

describe('useEip6963Providers', () => {
  it('dispatches a request event on mount so already-loaded wallets can announce', () => {
    let requested = false;
    const listener = () => {
      requested = true;
    };
    window.addEventListener('eip6963:requestProvider', listener);
    renderHook(() => useEip6963Providers());
    window.removeEventListener('eip6963:requestProvider', listener);

    expect(requested).toBe(true);
  });

  it('collects providers announced after mount, deduplicated by uuid', () => {
    const { result } = renderHook(() => useEip6963Providers());

    act(() => {
      announce(fakeDetail('1', 'io.metamask', 'MetaMask'));
      announce(fakeDetail('2', 'io.rabby', 'Rabby'));
      announce(fakeDetail('1', 'io.metamask', 'MetaMask')); // duplicate announcement, same uuid
    });

    expect(result.current).toHaveLength(2);
  });

  it('sorts providers by display label for stable rendering', () => {
    const { result } = renderHook(() => useEip6963Providers());

    act(() => {
      announce(fakeDetail('1', 'io.rabby', 'Rabby'));
      announce(fakeDetail('2', 'io.metamask', 'MetaMask'));
    });

    expect(result.current.map((p) => p.info.rdns)).toEqual(['io.metamask', 'io.rabby']);
  });
});

describe('walletLabel', () => {
  it('maps known rdns values to a stable display name', () => {
    expect(walletLabel({ uuid: '1', rdns: 'io.metamask', name: 'Something Else', icon: '' })).toBe('MetaMask');
    expect(walletLabel({ uuid: '2', rdns: 'io.rabby', name: 'Rabby Wallet', icon: '' })).toBe('Rabby');
    expect(walletLabel({ uuid: '3', rdns: 'app.phantom', name: 'Phantom', icon: '' })).toBe('Phantom');
  });

  it('falls back to the announced name for an unrecognized rdns', () => {
    expect(walletLabel({ uuid: '4', rdns: 'com.example.wallet', name: 'Example Wallet', icon: '' })).toBe(
      'Example Wallet',
    );
  });
});

describe('isPhantomInstalledWithoutEvmProvider', () => {
  it('is true when window.phantom.solana exists but no app.phantom EIP-6963 provider was announced', () => {
    (window as WindowWithPhantom).phantom = { solana: {} };

    expect(isPhantomInstalledWithoutEvmProvider([])).toBe(true);
  });

  it('is false when Phantom announced its EVM provider', () => {
    (window as WindowWithPhantom).phantom = { solana: {} };
    const providers = [fakeDetail('1', 'app.phantom', 'Phantom')];

    expect(isPhantomInstalledWithoutEvmProvider(providers)).toBe(false);
  });

  it('is false when Phantom is not installed at all', () => {
    expect(isPhantomInstalledWithoutEvmProvider([])).toBe(false);
  });
});
