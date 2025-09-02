import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

// Load environment variables from .env file
loadEnv();

/**
 * Initializes and exports a configured Drizzle database instance.
 *
 * The 'drizzle-orm' library uses a PostgreSQL client. The environment variable DATABASE_URL
 * must be defined in the .env file. The non-null assertion '!' ensures TypeScript knows
 * that the variable exists at runtime.
 */
const client = new Client({
'connectionString': process.env.DATABASE_URL!,
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
