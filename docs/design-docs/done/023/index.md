# Phase 23: Extended User Settings — Index

> Extract hardcoded agent and display parameters into user-configurable settings on the `user_trading_config` table.

Adds 6 new columns to the existing `user_trading_config` Postgres table: proposal timeout, LLM temperature, LLM max tokens, score windows, and confidence display thresholds. Replaces hardcoded values across session-agent, pipeline-orchestrator-agent, debate-orchestrator-agent, llm-analysis-agent, trade-proposal-card, and window-selector with per-user config reads. Extends the trading settings UI with an "Advanced" section grouped into Proposals, AI Model, and Display categories.

## Current State

| Setting | Current Location | Hardcoded Value |
|---------|-----------------|-----------------|
| Proposal timeout | session-agent.ts (line 658), pipeline-orchestrator-agent.ts (line 472) | 900s / 900_000ms |
| LLM temperature | llm-analysis-agent.ts (8 call sites, lines 112-416) | 0.2 - 0.5 per task type |
| LLM max tokens | llm-analysis-agent.ts (8 call sites, lines 113-417) | 500 - 2000 per task type |
| Score windows | debate-orchestrator-agent.ts (line 472), pipeline-orchestrator-agent.ts (line 398), window-selector.tsx (line 10), performance-handlers.ts (line 9) | [30, 90, 180] |
| Confidence high threshold | trade-proposal-card.tsx (line 117) | 0.7 |
| Confidence medium threshold | trade-proposal-card.tsx (line 119) | 0.4 |

## Target State

All 6 values stored in `user_trading_config` (Postgres), read at point-of-use, validated by Zod, editable in the trading settings page under a new "Advanced" section.

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [023-1-spec.md](./023-1-spec.md) | Overview, Goals, Non-Goals, Settings Specification, Type Definitions |
| 2 | [023-2-data.md](./023-2-data.md) | Drizzle Table Changes, Migration, Zod Schema Changes |
| 3 | [023-3-logic.md](./023-3-logic.md) | Agent Integration, Temperature Scaling, Config Propagation |
| 4 | [023-4-api.md](./023-4-api.md) | API Changes, Server Functions |
| 5 | [023-5-ui.md](./023-5-ui.md) | Settings Form, Advanced Section, Component Changes |
| 6 | [023-6-ops.md](./023-6-ops.md) | Migration Steps, Implementation Order, Verification |
