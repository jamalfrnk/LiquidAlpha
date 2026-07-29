import { pgTable, uuid, varchar, numeric, timestamp, boolean, index } from 'drizzle-orm/pg-core';

/**
 * The `markets` table stores current market data for each trading pair we support.
 * Each record is identified by a UUID and includes the symbol, price, volume, 24h change, and update timestamp.
 */
export const markets = pgTable('markets', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  change24h: numeric('change_24h').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * The `signals` table stores generated trading signals for a given asset. Each signal has
 * a confidence score and an active flag indicating whether the signal is still valid.
 */
export const signals = pgTable('signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  asset: varchar('asset', { length: 10 }).notNull(),
  signalType: varchar('signal_type', { length: 50 }).notNull(),
  confidence: numeric('confidence').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * The `priceHistory` table stores historical price points for each asset. This table is used for
 * computing technical indicators such as moving averages, RSI, and MACD. We include a `timestamp`
 * column to indicate when the price was recorded.
 */
export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  price: numeric('price').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

/**
 * The `users` table tracks application users, identified by wallet address.
 * `address` is unique -- one row per wallet -- and `chain` disambiguates the
 * address namespace (EVM addresses and Solana addresses never collide in
 * practice, but the column keeps that assumption explicit rather than
 * implicit). `builderCode` is a referral/attribution label only, not a
 * substitute for `id` as an ownership key.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  address: varchar('address', { length: 64 }).notNull().unique(),
  chain: varchar('chain', { length: 16 }).notNull(),
  builderCode: varchar('builder_code', { length: 64 }).notNull(),
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
    userId: uuid('user_id').notNull(),
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
export const performance = pgTable('performance', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  signalId: uuid('signal_id').notNull(),
  pnl: numeric('pnl').notNull(),
  isOpen: boolean('is_open').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
