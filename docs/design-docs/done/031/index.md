# Phase 31: Fix Short Position Handling in Exit Logic -- Index

> Fix three bugs where short position handling is incorrect or missing: exit proposal dedup, exit reason classification, and debate session symbol propagation.

Short positions use the opposite action from long positions (buy-to-close vs. sell-to-close), but several code paths in `session-agent.ts` and `debate-orchestrator-agent.ts` assume long-only logic. This causes duplicate exit proposals for shorts, misclassified exit reasons in outcome tracking, and missing symbol context in debate session results.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| Exit proposal dedup guard | `session-agent.ts` line 1129-1132 | Hardcodes `action = 'sell'` -- only catches long exit proposals |
| `determineExitReason()` | `session-agent.ts` lines 1214-1228 | Uses long-side price comparisons for all positions |
| `getDebateSession()` | `debate-orchestrator-agent.ts` line 461 | Returns `symbol: ''` instead of the actual ticker |

## Impact

1. **Duplicate exit proposals**: Every 5-minute tracking cycle that detects a stop-loss or target-hit on a short position creates a new exit proposal because the dedup guard only checks for `action = 'sell'` pending proposals, while short exits use `action = 'buy'`.
2. **Misclassified exit reasons**: When a short position's exit order fills at the stop-loss price (above entry), `determineExitReason()` applies long-side logic (`filledAvgPrice <= stopLoss`) which evaluates to `false`. The exit is classified as `manual_close` instead of `stop_loss`. Similarly, a short target-hit (price below target) is misclassified.
3. **Missing debate symbol**: `DebateSession.symbol` is always an empty string, losing the ticker context for any downstream consumer of the debate result.

## Target State

- Exit proposal dedup correctly uses the position-side-aware exit action (`'sell'` for longs, `'buy'` for shorts)
- `determineExitReason()` applies the correct price comparison direction based on whether the original entry was a buy (long) or sell (short)
- `getDebateSession()` receives and returns the actual symbol from `RunDebateParams`

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [031-1-spec.md](./031-1-spec.md) | Overview, Goals/Non-Goals, Bug Analysis, Comparison with Correct Code |
| 2 | [031-2-data.md](./031-2-data.md) | Data Structures, DO SQLite Schema, Type Definitions |
| 3 | [031-3-logic.md](./031-3-logic.md) | Fix Details, Code Changes, Side-Aware Logic |
| 4 | [031-4-api.md](./031-4-api.md) | Affected Callables, Message Flow, No API Changes |
| 5 | [031-5-ui.md](./031-5-ui.md) | No UI Changes, Frontend Impact Assessment |
| 6 | [031-6-ops.md](./031-6-ops.md) | Implementation Order, Verification, Rollback |
