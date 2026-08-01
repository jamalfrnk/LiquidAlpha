import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { ApiError } from '../../lib/api';
import { fetchMe, requestNonce, verifySignature, logout as logoutRequest } from './api';
import { connectEvmWallet, signMessage } from './wallet';
import { useEip6963Providers, walletLabel, type EIP6963ProviderDetail } from './eip6963';
import type { AuthUser } from './types';

const SELECTED_WALLET_RDNS_KEY = 'liquidalpha:selectedWalletRdns';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isConnecting: boolean;
  connectError: string | null;
  /** Non-null after an accountsChanged event invalidated the session -- see WALLET-001. */
  accountChangedNotice: string | null;
  dismissAccountChangedNotice: () => void;
  /** Every EVM provider currently detected via EIP-6963. */
  eip6963Providers: EIP6963ProviderDetail[];
  /**
   * The connected wallet's current chain, informational only -- this is a
   * paper-trading platform, so a chain change never forces a network
   * switch or blocks anything; it's exposed purely for display.
   */
  chainId: string | null;
  login: (providerDetail: EIP6963ProviderDetail) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const eip6963Providers = useEip6963Providers();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [accountChangedNotice, setAccountChangedNotice] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [selectedRdns, setSelectedRdns] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(SELECTED_WALLET_RDNS_KEY),
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: fetchMe,
    retry: false,
    // Auth session state doesn't get stale on its own timer -- it's only
    // ever invalidated explicitly by login()/logout() below.
    staleTime: Infinity,
    // A 401 here just means "not logged in", not a transient failure --
    // don't let react-query treat it as an error state to retry/surface.
    throwOnError: false,
  });
  const user = data?.user ?? null;

  // The provider backing the current session, if it's still detectable via
  // EIP-6963 on this page load -- re-attached automatically after a
  // refresh (browser refresh restores the session cookie without a new
  // signature; this just re-establishes lifecycle listeners on top of it,
  // it never re-authenticates).
  const activeProviderDetail = selectedRdns
    ? (eip6963Providers.find((p) => p.info.rdns === selectedRdns) ?? null)
    : null;

  useEffect(() => {
    if (!activeProviderDetail || !user) return;
    const { provider } = activeProviderDetail;

    // Attaching a chainChanged listener only reports *future* changes --
    // read the current value once up front so `chainId` isn't null until
    // the first switch.
    provider.request({ method: 'eth_chainId' }).then(
      (id) => setChainId(id as string),
      () => {
        /* best-effort only -- an unresponsive provider here shouldn't block anything */
      },
    );

    function handleAccountsChanged(accounts: unknown) {
      const list = accounts as string[];
      if (list.length === 0) {
        // The wallet itself disconnected/locked -- same end state as our own logout.
        void logout();
        return;
      }
      const newAddress = list[0];
      if (!user || newAddress.toLowerCase() === user.address.toLowerCase()) return;
      // A different account is now active in the wallet than the one this
      // session was authenticated as -- the old identity is no longer
      // valid for it. Clear the session client-side rather than silently
      // keep showing data for the address the user is no longer using.
      setAccountChangedNotice(
        'Your active wallet account changed. Sign a new one-time message to continue as this address.',
      );
      queryClient.setQueryData(queryKeys.auth.me, { user: null });
      queryClient.clear();
    }

    function handleDisconnect() {
      void logout();
    }

    // Informational only -- paper trading has no on-chain execution to
    // protect, so a chain switch never blocks anything or forces a
    // network change; the UI can display it, nothing more.
    function handleChainChanged(newChainId: unknown) {
      setChainId(newChainId as string);
    }

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('disconnect', handleDisconnect);
    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('disconnect', handleDisconnect);
      provider.removeListener('chainChanged', handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- logout is stable (closes over refs only); re-subscribing on it would churn listeners every render for no benefit.
  }, [activeProviderDetail, user, queryClient]);

  async function login(providerDetail: EIP6963ProviderDetail) {
    // Guards duplicate/concurrent connect attempts (e.g. a fast double
    // click) -- without this, two overlapping `eth_requestAccounts` calls
    // can race in some wallets.
    if (isConnecting) return;

    setIsConnecting(true);
    setConnectError(null);
    setAccountChangedNotice(null);
    try {
      const walletName = walletLabel(providerDetail.info);
      const address = await connectEvmWallet(providerDetail.provider, walletName);
      const { message } = await requestNonce(address, 'evm');
      const signature = await signMessage(providerDetail.provider, address, message);
      const { user } = await verifySignature(address, 'evm', signature);
      queryClient.setQueryData(queryKeys.auth.me, { user });
      setSelectedRdns(providerDetail.info.rdns);
      window.localStorage.setItem(SELECTED_WALLET_RDNS_KEY, providerDetail.info.rdns);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to connect wallet';
      setConnectError(message);
    } finally {
      // Always resolves, success or failure -- the UI can never get stuck
      // showing "Connecting…" forever.
      setIsConnecting(false);
    }
  }

  async function logout() {
    await logoutRequest();
    queryClient.setQueryData(queryKeys.auth.me, { user: null });
    queryClient.clear();
    setSelectedRdns(null);
    window.localStorage.removeItem(SELECTED_WALLET_RDNS_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isConnecting,
        connectError,
        accountChangedNotice,
        dismissAccountChangedNotice: () => setAccountChangedNotice(null),
        eip6963Providers,
        chainId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
