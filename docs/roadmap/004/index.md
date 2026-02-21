# Phase 4: Signal Gathering Agents — Index

> Multi-agent architecture: StockTwitsAgent, TwitterAgent, SecFilingsAgent, FredAgent

> **Post-MVP**: These agents plug into the existing orchestrator. Deploy DOs + enable entitlements → orchestrator's `gatherSignals()` picks them up automatically. No orchestrator code changes needed.

Each signal source is a standalone Cloudflare Agent with its own SQLite state, scheduled ingestion, and `@callable()` RPC. All agents write to shared PG `signals` + `raw_events` tables. Orchestrator pulls signals via `getAgentByName()`.

## Agent Topology

| Agent | Instance | Scope | Data Source |
|-------|----------|-------|-------------|
| StockTwitsAgent | `{userId}` | per-user | StockTwits API |
| TwitterAgent | `{userId}` | per-user | X/Twitter API |
| SecFilingsAgent | `{ticker}` | shared | financialdatasets.ai (filings + insider trades) |
| FredAgent | `{seriesId}` | shared | FRED API (macro indicators) |

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [004-1-spec.md](./004-1-spec.md) | Overview, Goals, Agent Definitions, Type Definitions |
| 2 | [004-2-data.md](./004-2-data.md) | Shared PG Schema, Agent SQLite State, Zod Schemas |
| 3 | [004-3-logic.md](./004-3-logic.md) | StockTwitsAgent, TwitterAgent, SecFilingsAgent, FredAgent implementations |
| 4 | [004-4-api.md](./004-4-api.md) | Hono handlers (proxy to agents via RPC), Server Functions |
| 5 | [004-5-ui.md](./004-5-ui.md) | WatchlistManager, SignalFeed, useAgent hooks |
| 6 | [004-6-ops.md](./004-6-ops.md) | Wrangler config (4 DOs), Implementation order, Verification |
