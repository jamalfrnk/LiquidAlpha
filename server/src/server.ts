import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { WebSocketServer } from 'ws';
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

// WebSocket server for real-time updates
const wss = new WebSocketServer({ port: 8080 });

// Broadcast helper: send JSON to all connected clients
function broadcast(payload: any) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

// Fetch market data from CoinGecko and update DB
async function updateMarketData() {
  try {
    const response = await axios.get(
      'https://pro-api.coingecko.com/api/v3/simple/price',
      {
        headers: {
          'x-cg-pro-api-key': process.env.COINGECKO_API_KEY,
        },
        params: {
          ids: 'bitcoin,ethereum,solana',
          vs_currencies: 'usd',
          include_24hr_change: 'true',
        },
      }
    );

    const data = response.data;
    const rows = [
      {
        symbol: 'BTC',
        price: data.bitcoin.usd,
        volume: 0,
        change24h: data.bitcoin.usd_24h_change,
      },
      {
        symbol: 'ETH',
        price: data.ethereum.usd,
        volume: 0,
        change24h: data.ethereum.usd_24h_change,
      },
      {
        symbol: 'SOL',
        price: data.solana.usd,
        volume: 0,
        change24h: data.solana.usd_24h_change,
      },
    ];

    // Reset the markets table and insert fresh rows
    await db.delete(markets).execute();
    await db.insert(markets).values(rows);

    // Broadcast the market update
    broadcast({ type: 'marketUpdate', data: rows });
  } catch (err) {
    console.error('Failed to update market data:', err);
  }
}

// Start market updates immediately and every 10 seconds
updateMarketData();
setInterval(updateMarketData, 10000);

// GET all market data
app.get('/api/markets', async (_req, res) => {
  try {
    const data = await db.select().from(markets);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

// GET all signals
app.get('/api/signals', async (_req, res) => {
  try {
    const data = await db.select().from(signals);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// POST new signal
app.post('/api/signals', async (req, res) => {
  try {
    const { asset, signalType, confidence } = req.body;
    if (!asset || !signalType || confidence === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newSignal = {
      asset,
      signalType,
      confidence,
      active: true,
    };

    await db.insert(signals).values(newSignal);

    // Broadcast new signal event
    broadcast({ type: 'newSignal', data: newSignal });

    res.status(201).json({ message: 'Signal created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create signal' });
  }
});

// GET simple stats
app.get('/api/stats', async (_req, res) => {
  try {
    const allSignals = await db.select().from(signals);
    const totalSignals = allSignals.length;
    const activeSignals = allSignals.filter((s: any) => s.active).length;

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
