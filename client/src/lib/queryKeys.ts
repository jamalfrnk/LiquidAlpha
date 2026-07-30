/**
 * Centralized query-key factory -- every query key used anywhere in the
 * app is defined here, once, so invalidation and cache lookups can't drift
 * out of sync between features (a `useQuery` in one file and an
 * `invalidateQueries` call in another referencing hand-typed keys is how
 * cache bugs creep in).
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  marketData: {
    health: ['market-data', 'health'] as const,
    list: ['market-data', 'markets'] as const,
  },
  signals: {
    list: (params: { limit: number; offset: number }) => ['signals', 'list', params] as const,
  },
  execution: {
    orders: (params: { limit: number; offset: number }) => ['execution', 'orders', params] as const,
    positions: (params: { limit: number; offset: number }) => ['execution', 'positions', params] as const,
  },
  risk: {
    limits: ['risk', 'limits'] as const,
  },
};
