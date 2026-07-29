import { pgTable, uuid, varchar, numeric, timestamp, boolean, index, pgEnum } from 'drizzle-orm/pg-core';

/**
 * The `markets` table holds the *current* snapshot for each trading pair --
 * one row per symbol, updated in place. `symbol` is unique specifically so
 * ingestion can upsert rather than insert: this table used to gain a new
 * row every ~10s forever (the same unbounded-growth bug price_history had,
 * GH F-7), and worse, "current price" was being approximated by
 * `ORDER BY updated_at DESC LIMIT 50` across all symbols combined, which
 * stops reliably returning one row per symbol as soon as enough history
 * accumulates. Historical time-series data belongs in `price_history`,
 * which already models it correctly (append-only, queried with a bounded
 * per-symbol limit).
 */
export const markets = pgTable('markets', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  change24h: numeric('change_24h').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * A signal's lifecycle, replacing a single boolean `active` flag (or, worse,
 * a free-text `status` column reused across unrelated entities -- the
 * pattern found in the Replit reference app's signals/activities/positions
 * tables). Distinct signal, order, and position lifecycles should each get
 * their own enum when those entities exist; conflating them into one
 * generic column is exactly what made the Replit schema hard to reason
 * about.
 */
export const signalStatusEnum = pgEnum('signal_status', [
  'DRAFT',
  'PUBLISHED',
  'ACTIVE',
  'TRIGGERED',
  'EXPIRED',
  'CANCELLED',
  'INVALIDATED',
]);

/**
 * The `signals` table stores generated trading signals for a given asset. Each signal has
 * a confidence score and a `status` reflecting where it is in its lifecycle.
 */
export const signals = pgTable(
  'signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    asset: varchar('asset', { length: 10 }).notNull(),
    signalType: varchar('signal_type', { length: 50 }).notNull(),
    confidence: numeric('confidence').notNull(),
    status: signalStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    statusCreatedAtIdx: index('signals_status_created_at_idx').on(table.status, table.createdAt),
  }),
);

/**
 * The `priceHistory` table stores historical price points for each asset. This table is used for
 * computing technical indicators such as moving averages, RSI, and MACD. We include a `timestamp`
 * column to indicate when the price was recorded.
 */
export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    symbol: varchar('symbol', { length: 10 }).notNull(),
    price: numeric('price').notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    symbolTimestampIdx: index('price_history_symbol_timestamp_idx').on(table.symbol, table.timestamp),
  }),
);

/**
 * The `users` table tracks application users, identified by wallet address.
 * `address` is unique -- one row per wallet -- and `chain` disambiguates the
 * address namespace (EVM addresses and Solana addresses never collide in
 * practice, but the column keeps that assumption explicit rather than
 * implicit). `builderCode` is a unique referral/attribution label only,
 * never a substitute for `id` as an ownership key -- every FK in this
 * schema points at `users.id`, not `builderCode`.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  address: varchar('address', { length: 64 }).notNull().unique(),
  chain: varchar('chain', { length: 16 }).notNull(),
  builderCode: varchar('builder_code', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * The `authNonces` table backs the wallet-signature login flow: a nonce is
 * issued per (address, chain) and must be presented back, signed, before it
 * expires. Consuming a nonce deletes its row, making replay of the same
 * nonce impossible; `expiresAt` bounds how long an issued-but-unused nonce
 * stays valid, closing the gap where an old, never-consumed nonce would
 * otherwise remain valid forever.
 */
export const authNonces = pgTable(
  'auth_nonces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    address: varchar('address', { length: 64 }).notNull(),
    chain: varchar('chain', { length: 16 }).notNull(),
    nonce: varchar('nonce', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    addressChainIdx: index('auth_nonces_address_chain_idx').on(table.address, table.chain),
  }),
);

/**
 * The `sessions` table gives JWT-based sessions real server-side revocation.
 * A session row is created at login; its `id` becomes the JWT's `jti` claim.
 * `requireAuth` checks both the JWT's own signature/expiry AND that the
 * corresponding session row is neither expired nor revoked -- so logout, or
 * an admin-initiated revocation, actually invalidates the token instead of
 * just clearing a cookie the client could resend.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
  }),
);

/**
 * The `performance` table records historical performance metrics for our signals,
 * including the profit/loss percentage of a given signal over time and whether
 * the trade is currently open. This can be used to backtest and validate the signal engine.
 */
export const performance = pgTable(
  'performance',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    pnl: numeric('pnl').notNull(),
    isOpen: boolean('is_open').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('performance_user_id_idx').on(table.userId),
  }),
);
