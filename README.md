# LiquidAlpha

LiquidAlpha is a real‑time trading signal dashboard and API for the **Hyperliquid** blockchain ecosystem.  It provides AI‑powered trading signals, risk‑managed trade parameters and live market data via a modern web interface.  The system is designed to be modular so that the backend can run independently of the frontend, and all server code is written in TypeScript for type safety and clarity.

## Features

* **Real‑time market feed** – fetches live prices for major assets (BTC, ETH, SOL) via the Hyperliquid API and broadcasts updates to all connected clients using WebSockets.
* **AI‑powered signals** – generates trading signals with a granular confidence score using multiple technical indicators.  The current implementation calculates trending and momentum indicators (EMA50/EMA200, MACD and RSI) and scores signals from 0–100.
* **Risk management** – attaches stop‑loss and take‑profit levels based on a simple ATR approximation and enforces a minimum 1:2 risk‑reward ratio when creating signals.
* **REST API and WebSocket** – exposes REST endpoints for markets, signals, configuration and performance metrics, and a WebSocket endpoint for live updates.
* **Database integration** – persists users, markets, price history, signals and performance statistics using PostgreSQL and the [Drizzle ORM](https://orm.drizzle.team/).  Example schema definitions can be found in `server/src/db/schema.ts`.
* **Multi‑wallet support** – designed to integrate with EVM wallets (MetaMask, Rabby and WalletConnect via Reown) and Solana wallets (Phantom).  Authentication is signature‑based; private keys are never sent to the server.

## Repository structure

```
LiquidAlpha/
│
├── README.md             – this file
└── server/               – Node.js/Express backend
    ├── package.json      – npm scripts and dependencies
    ├── tsconfig.json     – TypeScript compiler configuration
    ├── drizzle.config.ts – database migration configuration
    ├── .env.example      – template for environment variables
    └── src/
        ├── db/           – database connection and schema definitions
        ├── auth.ts       – user registration and login helpers
        ├── price‑history.ts – price history persistence and retrieval
        ├── performance.ts – recording and retrieving user PnL
        ├── indicators.ts – technical indicator calculations (EMA, MACD, etc.)
        ├── technical‑analysis.ts – signal generation engine
        ├── hyperliquid‑real.ts – Hyperliquid API wrapper with Zod validation
        ├── server.ts     – Express server and WebSocket integration
        └── bootstrap.ts  – global error handlers and helper utilities
```

> **Note**: A client folder is not included in this repository.  The frontend is planned to be built separately using React 18, Radix/shadcn UI components, Tailwind CSS and TanStack Query for state management.  The backend can be developed and tested independently using the REST and WebSocket endpoints described below.

## Getting started

The server uses Node.js with TypeScript and PostgreSQL.  To run the backend locally you will need a PostgreSQL database available and the following environment variables defined (see `.env.example` for details):

```
# Required environment variables
DATABASE_URL=postgresql://user:password@localhost:5432/liquidalpha
JWT_SECRET=your‑jwt‑secret

# Optional environment variables
PORT=3001           # HTTP server port (default 3001)
COINGECKO_API_KEY=… # optional CoinGecko key for market data
HYPERLIQUID_API_KEY=… # optional Hyperliquid key for premium endpoints
```

Install dependencies and run the development server:

```bash
cd LiquidAlpha/server
npm install
npm run dev   # Runs the Express server with ts-node-dev
```

The server will start on `http://localhost:3001` and automatically connect to the database.  By default it will fetch price data from CoinGecko every 10 seconds and broadcast updates via WebSocket.  REST endpoints are available under `/api`.

### Database migrations

Drizzle is used for type‑safe schema definitions.  The schema lives in `server/src/db/schema.ts`.  Migrations can be generated and pushed to your database using `drizzle-kit`.  Run the following commands in the `server` folder:

```bash
npm run generate   # Generate migration SQL from schema definitions
npm run migrate    # Push the migration to your database
```

### Important scripts

* `npm run dev` – run the development server with automatic reloads.
* `npm run build` – compile the TypeScript files into plain JavaScript.
* `npm start` – run the compiled server from the `dist` folder.

## API overview

The following endpoints are available on the backend.  See the individual function definitions in `server/src/server.ts` for response formats.

| Method | Endpoint                    | Description |
|-------|-----------------------------|-------------|
| GET   | `/api/markets`              | Returns an array of market snapshots (symbol, price, volume, 24h change). |
| GET   | `/api/signals`              | Returns all generated signals.  Filtered queries can be added in future versions. |
| POST  | `/api/signals/generate`     | Triggers the signal generator for a given symbol and returns the generated signal. |
| GET   | `/api/stats`                | Returns summary statistics such as total and active signals. |
| GET   | `/api/funding/:symbol`      | Returns the current funding rate for a symbol using the Hyperliquid API wrapper. |

The WebSocket server listens on the same host at port `8080`.  It emits `marketUpdate` messages whenever fresh market data is fetched and `newSignal` messages whenever a new signal is created.

## Development guidelines

* **Type safety** – all modules are written in TypeScript and exported types are documented where appropriate.
* **Error handling** – asynchronous route handlers should use the `wrapAsync` pattern shown in `server/src/bootstrap.ts` to ensure that promise rejections are caught and passed to Express’s error middleware.
* **Modularity** – each module has a single responsibility: indicator calculations live in `indicators.ts`, signal generation lives in `technical‑analysis.ts`, etc.  Do not mix database access, business logic and HTTP handling in the same file.
* **Documentation** – add JSDoc comments to functions and types so that the intended behaviour is clear to other developers.  This repository strives to be self‑documenting, but additional inline comments are welcome.

## References

The design and architecture of LiquidAlpha are based on the detailed specification in the document **“LiquidAlpha – Complete Platform Overview”** provided with this repository.  For further information on the planned frontend and advanced analytics features, refer to the original document.
