# ChainScope — Progressive Alpha Pool

Small standalone research pool: **DexScreener discovery → configurable entry filters → progressive observation → per-timeframe rule score → continue → expire**.

A timeframe can score below its required score without removing the token. The token remains active and moves to the next timeframe. Only the maximum research age expires it.

## Configuration

Edit `src/config/default-config.json`.

- `pool.polling_interval_seconds`
- `pool.maximum_research_minutes`
- `entry_rules`
- each timeframe's `required_score`
- each timeframe's enabled rules and values

The starter timeframe values are seeded from the research ranges supplied for this project. They are configuration, not evaluator constants. Where the research supplied `?`, the starter config uses neutral `0` values rather than inventing missing data.

## Local development

```bash
npm install
npm run dev
```

For the production-style DexScreener proxy:

```bash
npm run build
npm start
```

## Render

Build command: `npm install && npm run build`

Start command: `npm start`

The server uses DexScreener only and needs no database or authentication.

## Scope

No trading, wallets, AI, Telegram, portfolio, journal, scoring model beyond configured rule counts, or other providers.
