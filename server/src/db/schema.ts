import { pgTable, uuid, varchar, numeric, timestamp, boolean } from 'drizzle-orm/pg-core';

export const markets = pgTable('markets', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  change24h: numeric('change_24h').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const signals = pgTable('signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  asset: varchar('asset', { length: 10 }).notNull(),
  signalType: varchar('signal_type', { length: 50 }).notNull(),
  confidence: numeric('confidence').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  price: numeric('price').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  address: varchar('address', { length: 64 }).notNull(),
  builderCode: varchar('builder_code', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const performance = pgTable('performance', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  pnl: numeric('pnl').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
