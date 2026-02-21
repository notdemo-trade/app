# Design Docs

Active design docs with full 6-part splits (spec, data, logic, API, UI, ops).

## Doc Structure

| # | Part | Purpose |
|---|------|---------|
| 1 | Spec | Overview, goals, features, type definitions |
| 2 | Data Model | DB schema, Drizzle, Zod schemas, migrations |
| 3 | Business Logic | Services, clients, queries, crons |
| 4 | API & Server Fns | HTTP handlers, server functions |
| 5 | Frontend & UI | Query hooks, components, pages |
| 6 | Ops & Verification | Impl order, verification, security, decisions |

## Not Implemented

- [001: Project Foundation](./001/index.md) — Auth, bearer tokens, staging deploy
- [002: Credentials Configuration](./002/index.md) — BYOK encrypted Alpaca + LLM keys
- [003: Account Portfolio View](./003/index.md) — Positions, P&L, orders dashboard

## MVP (current)

Build order: Phase 5 → 6 → 12

| Order | Phase | What |
|-------|-------|------|
| 1 | [005: Technical Analysis Agent](./005/index.md) | TechnicalAnalysisAgent per userId:symbol. SMA/EMA/RSI/MACD/BB/ATR |
| 2 | [006: LLM Analysis Agent](./006/index.md) | LLMAnalysisAgent per user. Multi-provider LLM reasoning, on-demand |
| 3 | [012: Orchestrator Agent](./012/index.md) | Coordinates TA + LLM → recommendations (no trade execution) |

## Roadmap

See [/docs/roadmap/](../roadmap/index.md) for future phases.
