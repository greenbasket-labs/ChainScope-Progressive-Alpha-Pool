# ChainScope — Progressive Alpha Pool

**A standalone research component for observing newly discovered Solana tokens over time.**

ChainScope is a broader research direction focused on collecting blockchain/token behavior as evidence. This repository contains one small, configurable research component rather than the complete ChainScope platform.

## Research Pipeline

```text
DexScreener discovery
        ↓
Configurable entry filters
        ↓
Progressive observation
        ↓
Per-timeframe rule scoring
        ↓
Continue observation / expire
```

The important design choice is that a token is **not automatically discarded simply because it scores below a timeframe threshold**. It can continue into the next observation stage until the configured research age expires.

## Configuration

Edit `src/config/default-config.json` to control:

- polling interval
- maximum research age
- entry rules
- timeframe requirements
- enabled rules and values

Starter values are configuration, not hardcoded research conclusions. Where the research specification did not provide a value, the starter configuration uses a neutral `0` rather than inventing one.

## Run Locally

```bash
npm install
npm run dev
```

For the production-style proxy:

```bash
npm run build
npm start
```

## Render

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

## Deliberate Scope

This component does **not** include:
- live trading
- wallets
- AI
- Telegram
- portfolio management
- journaling
- additional data providers
- a broader scoring model beyond configured rule counts

That narrow scope is intentional: the component is for research observation, not an all-in-one trading platform.

## Relationship to ChainScope

Think of this repository as one reusable research engine/component inside the larger ChainScope direction.

**Evidence first. Conclusions later.**