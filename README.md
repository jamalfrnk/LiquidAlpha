# LiquidAlpha

LiquidAlpha is a comprehensive trading signal dashboard for the Hyperliquid ecosystem. It connects to Hyperliquid's API to fetch real-time market data, generates trading signals (e.g., price spikes or volume changes), and exposes these signals via a web dashboard and API.

## Features

- Real-time market feed (BTC, ETH, SOL)
- AI-powered trading signals with confidence scores
- REST API endpoints for markets, signals, user config, and statistics
- WebSocket server for live updates
- React-based frontend with dark trading theme
- Integration with Hyperliquid builder codes for monetization
- Supports PostgreSQL via Neon and Drizzle ORM

## Development

This repository contains two main parts:

- `server/`: Node.js backend built with Express.js, TypeScript, Drizzle ORM, and WebSocket.
- `client/`: React frontend built with Vite and Tailwind CSS.

See the individual README sections in each folder for instructions.
