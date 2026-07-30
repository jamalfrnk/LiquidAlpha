import { QueryClient } from '@tanstack/react-query';

/**
 * The single QueryClient for the whole app. Replit's reference app ran
 * two independently-configured QueryClient instances at once (a real bug,
 * not just duplication -- inconsistent caching/auth behavior depending on
 * which one a given component happened to use). There is exactly one here,
 * created once, imported everywhere.
 *
 * Defaults are deliberately moderate; individual queries override
 * staleTime/refetchInterval per how fast their data actually changes
 * (market prices vs. risk limits vs. auth session are not the same rate
 * of change) rather than one aggressive setting applied to everything.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
