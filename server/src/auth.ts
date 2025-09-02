import type { Request, Response } from 'express';
import { db } from './db/index';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config as loadEnv } from 'dotenv';

// Load environment variables from .env into process.env
loadEnv();

const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-secret';

/**
 * Interface representing a user record in the database.
 */
export interface User {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
}

/**
 * Registers a new user by hashing the password and storing the user in the database.
 * Returns a JWT on success.
 *
 * @param req - Express request containing `email` and `password` in the body
 * @param res - Express response used to send the result
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Missing email or password' });
    return;
  }
  // Check if the user already exists
  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: 'User already exists' });
    return;
  }
  // Hash the password for secure storage
  const hashed = await bcrypt.hash(password, 10);
  await db.insert(users).values({ email, password: hashed });
  // Retrieve the user to get the generated ID
  const rows = await db.select().from(users).where(eq(users.email, email));
  const user = rows[0] as any;
  // Generate a JWT for the new user
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
}

/**
 * Logs in an existing user by verifying the password against the stored hash.
 * Returns a JWT on success.
 *
 * @param req - Express request containing `email` and `password` in the body
 * @param res - Express response used to send the result
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Missing email or password' });
    return;
  }
  const rows = await db.select().from(users).where(eq(users.email, email));
  if (rows.length === 0) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const user = rows[0] as any;
  // Compare the provided password with the stored hash
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  // Generate a JWT for the authenticated user
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
}
