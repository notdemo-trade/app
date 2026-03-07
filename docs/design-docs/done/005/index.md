# Phase 5: Technical Analysis Agent — Index

> TechnicalAnalysisAgent: per-user per-symbol Cloudflare Agent

Standalone agent computing SMA/EMA/RSI/MACD/BB/ATR from Alpaca market data. One instance per `{userId}:{symbol}`. Scheduled recalculation, signals written to shared PG. Orchestrator calls `getSignals()` via RPC.

## Agent Topology

| Agent | Instance | Scope | Data Source |
|-------|----------|-------|-------------|
| TechnicalAnalysisAgent | `{userId}:{symbol}` | per-user per-symbol | Alpaca Market Data API |

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [005-1-spec.md](./005-1-spec.md) | Overview, Goals, Agent Definition, Type Definitions |
| 2 | [005-2-data.md](./005-2-data.md) | Agent SQLite State, Shared PG Schema, Zod Schemas |
| 3 | [005-3-logic.md](./005-3-logic.md) | TechnicalAnalysisAgent impl, Market Data Provider, TA Calculations, Signal Detection |
| 4 | [005-4-api.md](./005-4-api.md) | Hono handlers (proxy to agent RPC), Server Functions |
| 5 | [005-5-ui.md](./005-5-ui.md) | TA Dashboard, Chart components, useAgent hook |
| 6 | [005-6-ops.md](./005-6-ops.md) | Wrangler config (1 DO), Implementation order, Verification |
