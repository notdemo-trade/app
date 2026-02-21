# notdemo.trade

> AI trading bot that watches social media, makes trade recommendations 24/7, and lets you approve them from your phone - bring your own broker account and customize the strategy.

## Overview

**notdemo.trade** is a multi-tenant SaaS platform on Cloudflare infrastructure. Each user gets their own AI-powered trading agent that operates independently using their own API keys and capital.

## Architecture

Built on **Cloudflare Workers** with global edge deployment.

### Monorepo Structure

| Package | Technology | Purpose | Production |
|---------|-----------|---------|------------|
| `packages/data-ops` | Drizzle + Zod | DB schemas, queries, validation | — |
| `apps/data-service` | Hono | REST API on CF Workers | `api.notdemo.trade` |
| `apps/user-application` | TanStack Start | SSR frontend on CF Workers | `notdemo.trade` |

### Infrastructure
- **Database**: Neon Postgres
- **Auth**: Better Auth (multi-tenancy)
- **Deployment**: Independent component deployment to Cloudflare edge

## MVP — Trading Agent Foundation

Current implementation: recommendation engine (no trade execution yet).

### Technical Analysis Agent (Phase 005)
Per-user per-symbol agent computing SMA/EMA/RSI/MACD/BB/ATR indicators via Durable Objects with scheduled execution.

### LLM Analysis Agent (Phase 006)
Per-user on-demand LLM reasoning across multiple providers (OpenAI, Anthropic, Google, xAI, DeepSeek). Consumes TA signals.

### Orchestrator Agent (Phase 012)
Coordinates TA + LLM into trade recommendations. Approval-only mode — stores recommendations in Postgres + agent-local SQLite.

### Supported Assets
- **Stocks**: Traditional equities
- **Crypto**: 24/7 trading (BTC, ETH, SOL)
- **Options**: Strategies with delta targeting

### Approval Modes
- **Manual Mode**: Approve trades via Telegram
- **Autonomous Mode**: Auto-execution with configurable risk limits

## Roadmap

Features planned but not yet implemented:

- **Signal Gathering** (Phase 004): StockTwits, Twitter, SEC filings
- **Trade Execution**: Broker integration (Alpaca) for order placement
- **Strategy Templates** (Phase 012): Shareable prompt engineering approaches
- **Trade Journal** (Phase 013): Outcome tracking and pattern extraction
- **Leaderboards** (Phase 014): Two-tier (funded/paper) with asset class breakdown
- **Safety Guardrails**: Kill switches, position limits, daily loss caps, staleness detection

Full specs in `/docs/roadmap/`.

## BYOK (Bring Your Own Keys)

Users provide their own:
- **Trading API**: Alpaca (planned)
- **LLM API**: Choice of provider
- **Capital**: Own broker account

Eliminates platform billing complexity.

## Business Model

**Freemium + BYOK**

- Users pay LLM providers directly
- No vendor lock-in (open core architecture)

### Target Audience
Retail algorithmic traders seeking institutional-grade infrastructure without building from scratch.
