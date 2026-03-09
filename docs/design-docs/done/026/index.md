# Phase 26: Fix Position Size Units Mismatch — Index

> Fix a units inconsistency in `positionSizePct` that causes debate-mode trades to be 100x smaller than intended and pipeline-mode to ignore user-configured position sizing.

The `positionSizePct` field is used throughout the codebase in two incompatible conventions: fractions (0.05 = 5%) in config/defaults/strategies, and whole-number percentages (5 = 5%) in LLM prompts, LLM response parsing, and execution. When debate-mode consensus falls back to config values, the fraction (0.05) is divided by 100 in execution, producing a position 100x too small. Pipeline mode also bypasses the user's configured `positionSizePctOfCash` entirely, falling back to a hardcoded `5`.

## Current State

| Layer | Location | Convention | Value for "5%" |
|-------|----------|-----------|----------------|
| Config defaults | `defaults.ts:68` | Fraction | `0.05` |
| Strategy templates | `session-agent-helpers.ts:231,239,247` | Fraction | `0.03`, `0.05`, `0.1` |
| Config resolution | `resolve-config.ts:25-26` | Fraction | Inherits from strategy/config |
| Session config SQL | `session-agent.ts:1262` | Fraction | `DEFAULT 0.05` |
| PostgreSQL trading config | `trading-config/table.ts` | Fraction | `0.10` default |
| LLM analysis prompt | `prompts.ts:10` | Whole number | `1-10` |
| LLM analysis parsing | `llm-analysis-agent.ts:737` | Whole number | Clamped `1-10` |
| Consensus prompt | `prompts.ts:63` | Whole number | `1-10` |
| Consensus parsing | `llm-analysis-agent.ts:658` | Whole number | Raw from LLM |
| Risk validation output | `llm-analysis-agent.ts:681` | Unknown | Raw from LLM |
| Pipeline fallback | `pipeline-orchestrator-agent.ts:471` | Whole number | `5` |
| Execution math | `session-agent.ts:605` | **Expects** whole number | Divides by 100 |
| Exit proposal | `session-agent.ts:1168` | Whole number | `100` |
| Strategy context display | `llm-analysis-agent.ts:580` | **Converts** fraction to whole | `* 100` |

## The Bug

**Debate mode fallback path:**

```
config.positionSizePctOfCash = 0.05  (fraction convention)
    |
    v
consensus.positionSizePct ?? config.positionSizePctOfCash = 0.05
    |
    v
session-agent.ts:605 → account.cash * (0.05 / 100) = $50 on $100k
    |
    Expected: $5,000 on $100k (100x too small)
```

**Pipeline mode bypass:**

```
RunPipelineParams has no positionSizePctOfCash field
    |
    v
buildProposal() falls back to rec.position_size_pct ?? 5
    |
    v
User's config.positionSizePctOfCash is never consulted
```

## Target State

- All `positionSizePct` values on `TradeProposal` use **whole-number percentages** (5 = 5%)
- Execution math (`/ 100`) remains correct and unchanged
- LLM prompts, parsing, and hardcoded fallbacks stay in whole-number convention (no changes)
- Config/strategy values (fractions) are converted to whole numbers at the boundary where they enter `TradeProposal`
- Pipeline mode receives and uses user's configured position size
- Normalization guard catches ambiguous LLM outputs

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [026-1-spec.md](./026-1-spec.md) | Overview, Goals/Non-Goals, Root Cause Analysis, Solution Design |
| 2 | [026-2-data.md](./026-2-data.md) | Data Layer — No schema changes needed |
| 3 | [026-3-logic.md](./026-3-logic.md) | Logic changes: session-agent, pipeline-orchestrator, normalization |
| 4 | [026-4-api.md](./026-4-api.md) | API Layer — No changes needed |
| 5 | [026-5-ui.md](./026-5-ui.md) | UI Layer — No changes needed |
| 6 | [026-6-ops.md](./026-6-ops.md) | Implementation order, verification, rollback |
