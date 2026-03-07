# Phase 12: Orchestrator Agent — Index

> OrchestratorAgent: per-user coordinator of sub-agents

Central agent that owns the analysis loop. Coordinates sub-agents via `getAgentByName()` RPC, aggregates signals, manages entitlements. Strategy templates stored here, passed to LLMAnalysisAgent per-request.

## MVP Scope

MVP orchestrator coordinates **only TA + LLM agents** → produces **recommendations** (no trade execution). Signal agents (Phase 4), approval flow (Phase 10/11), and order execution (Phase 8) plug in later.

```
MVP: Phase 5 → Phase 6 → Phase 12
```

## MVP Agent Topology

| Agent | Instance | Scope | Role |
|-------|----------|-------|------|
| OrchestratorAgent | `{userId}` | per-user | Coordinates TA + LLM |
| TechnicalAnalysisAgent | `{userId}:{symbol}` | per-user:symbol | Computes indicators |
| LLMAnalysisAgent | `{userId}` | per-user | Produces recommendations |

## MVP Inter-Agent Communication

```
OrchestratorAgent({userId})
  ├─ getAgentByName("TechnicalAnalysisAgent", `${userId}:${symbol}`).getSignals()
  └─ getAgentByName("LLMAnalysisAgent", userId).analyze({ signals, strategy })
```

## Progressive Enhancement

| Phase | Adds to Orchestrator |
|-------|---------------------|
| Phase 8 | `proposeTradeFromRecommendation()`, `executeOrder()` |
| Phase 9 | Policy engine validation before execution |
| Phase 10 | `executeApproval()`, `processExpiredApprovals()`, approval_timeouts table |
| Phase 11 | Telegram notification dispatch in trade proposal flow |
| Phase 4 | `gatherSignals()` schedule, signal agent RPC calls |
| Phase 7 | Strategy template customization UI |

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [012-1-spec.md](./012-1-spec.md) | Overview, Goals, Agent Definition, Entitlements, Type Definitions |
| 2 | [012-2-data.md](./012-2-data.md) | Agent SQLite State (config, entitlements), Shared PG Schema, Zod Schemas |
| 3 | [012-3-logic.md](./012-3-logic.md) | OrchestratorAgent impl, Signal collection, Recommendation logging |
| 4 | [012-4-api.md](./012-4-api.md) | Hono handlers, useAgent hook (WebSocket), Server Functions |
| 5 | [012-5-ui.md](./012-5-ui.md) | Agent dashboard, Status panel, Trade controls |
| 6 | [012-6-ops.md](./012-6-ops.md) | Wrangler config (all DOs), Implementation order, Verification |
