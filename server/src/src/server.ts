import express from 'express';
import cors from 'cors';
import { connectDb, db } from './db/index';
import { markets, signals } from './db/schema';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

// Connect to the database
connectDb().catch((err) => {
  console.error('Database connection failed:', err);
});

// GET /api/markets - return all market data
app.get('/api/markets', async (req, res) => {
  try {
    const data = await db.select().from(markets);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

// GET /api/signals - return all signals
app.get('/api/signals', async (req, res) => {
  try {
    const data = await db.select().from(signals);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// POST /api/signals - create a new signal
app.post('/api/signals', async (req, res) => {
  try {
    const { asset, signalType, confidence } = req.body;
    if (!asset || !signalType || confidence === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await db.insert(signals).values({
      asset,
      signalType,
      confidence,
      active: true,
    });
    res.status(201).json({ message: 'Signal created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create signal' });
  }
});

// GET /api/stats - simple stats about signals
app.get('/api/stats', async (req, res) => {
  try {
    const allSignals = await db.select().from(signals);
    const totalSignals = allSignals.length;
    const activeSignals = allSignals.filter((s) => s.active).length;
    res.json({ totalSignals, activeSignals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

const port = process.env.PORT || 3001;
app.listen(Number(port), () => {
  console.log(`Server listening on port ${port}`);
});
