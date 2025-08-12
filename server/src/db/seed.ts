import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { markets, signals } from './schema';
import 'dotenv/config';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  await client.connect();
  const db = drizzle(client);

  // Insert initial market rows
  await db.insert(markets).values([
    { symbol: 'BTC', price: 0, volume: 0, change24h: 0 },
    { symbol: 'ETH', price: 0, volume: 0, change24h: 0 },
    { symbol: 'SOL', price: 0, volume: 0, change24h: 0 },
  ]);

  console.log('Seed data inserted');
  await client.end();
}

seed().catch((err) => {
  console.error(err);
});
