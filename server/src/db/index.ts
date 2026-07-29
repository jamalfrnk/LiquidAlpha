import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { env } from '../config/env';

/**
 * Initializes and exports a configured Drizzle database instance.
 *
 * DATABASE_URL is validated at startup by config/env.ts, so it's guaranteed
 * to exist here without a non-null assertion.
 */
const client = new Client({
  connectionString: env.DATABASE_URL,
});

// Create the drizzle database instance with the PostgreSQL client.
export const db = drizzle(client);

/**
 * Connects to the PostgreSQL database. This should be called during application startup
 * before executing any queries. If the connection fails, an exception will be thrown.
 */
export async function connectDb(): Promise<void> {
  await client.connect();
}
