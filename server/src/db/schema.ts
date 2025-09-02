import { pgTable, uuid, varchar, numeric, timestamp, boolean } from 'drizzle-orm/pg-core';

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
 * The `users` table tracks application users for authentication purposes.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  address: varchar('address', { length: 64 }).notNull(),
  builderCode: varchar('builder_code', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
