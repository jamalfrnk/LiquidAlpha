import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { ApiError } from '../../lib/api';
import { fetchMe, requestNonce, verifySignature, logout as logoutRequest } from './api';
import { connectEvmWallet, signMessage } from './wallet';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isConnecting: boolean;
  connectError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

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

  async function login() {
    setIsConnecting(true);
    setConnectError(null);
    try {
      const address = await connectEvmWallet();
      const { message } = await requestNonce(address, 'evm');
      const signature = await signMessage(address, message);
      const { user } = await verifySignature(address, 'evm', signature);
      queryClient.setQueryData(queryKeys.auth.me, { user });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to connect wallet';
      setConnectError(message);
    } finally {
      setIsConnecting(false);
    }
  }

  async function logout() {
    await logoutRequest();
    queryClient.setQueryData(queryKeys.auth.me, { user: null });
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        isLoading,
        isConnecting,
        connectError,
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
