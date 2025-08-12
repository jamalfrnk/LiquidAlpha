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
