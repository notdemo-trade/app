# notdemo.trade

> AI trading bot that watches social media, makes trade recommendations 24/7, and lets you approve them from your phone - bring your own broker account and customize the strategy.

## Overview

**notdemo.trade** is a multi-tenant SaaS platform on Cloudflare infrastructure. Each user gets their own AI-powered trading agent that operates independently using their own API keys and capital.

## Core Trading Loop

The platform continuously monitors multiple signal sources:
- **Social Media**: StockTwits, Reddit, Twitter (optional)
- **Official Sources**: SEC filings
- **Analysis**: Aggregates sentiment and momentum indicators

Uses LLM analysis (OpenAI, Anthropic, Google, xAI, DeepSeek) to generate trade recommendations. Users can:
- **Manual Mode**: Approve trades via Telegram
- **Autonomous Mode**: Enable auto-execution with configurable risk limits

### Supported Assets
- **Stocks**: Traditional equities
- **Crypto**: 24/7 trading (BTC, ETH, SOL)
- **Options**: Strategies with delta targeting

## Architecture

Built on **Cloudflare Workers** with global edge deployment.

### Monorepo Structure

| Package | Technology | Purpose | Production |
|---------|-----------|---------|------------|
| `packages/data-ops` | Drizzle + Zod | DB schemas, queries, validation | — |
| `apps/data-service` | Hono | REST API on CF Workers | `api.notdemo.trade` |
| `apps/user-application` | TanStack Start | SSR frontend on CF Workers | `notdemo.trade` |

### Infrastructure
- **State Management**: Durable Objects (per-user agent state)
- **Database**: Neon Postgres
- **Auth**: Better Auth (multi-tenancy)
- **Deployment**: Independent component deployment to Cloudflare edge

## Unique Features

### Strategy Templates
Shareable templates for custom prompt engineering approaches. Users can publish/fork signal analysis strategies.

### Anonymous Leaderboards
Two-tier system with asset class breakdown:
- **Tier 1**: Funded accounts
- **Tier 2**: Paper traders
- **Breakdown**: Stocks, crypto, options

### Trade Journal
Tracks outcomes for learning and pattern extraction.

### Safety Guardrails
- Kill switches
- Position limits
- Daily loss caps
- Staleness detection

### BYOK (Bring Your Own Keys)
Users provide their own:
- **Trading API**: Alpaca
- **LLM API**: Choice of provider
- **Capital**: Own broker account

Eliminates platform billing complexity.

## Business Model

**Freemium + BYOK**

- Users pay LLM providers directly
- No vendor lock-in (open core architecture)

### Target Audience
Retail algorithmic traders seeking institutional-grade infrastructure without building from scratch.