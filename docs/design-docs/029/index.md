# Phase 29: Risk Management Config Enforcement — Index

> Enforce the risk management fields that `EffectiveConfig` already resolves but no code path actually checks: trade-size caps, position limits, daily loss circuit breaker, cooldown, market-hours gate, ticker filtering, and short-selling block.

`resolveEffectiveConfig()` in `packages/data-ops/src/agents/session/resolve-config.ts` merges risk-management fields from `trading_config > session_config > strategy > defaults` into `EffectiveConfig`. Users can configure these values through the trading config UI. However, none of the resolved values are enforced anywhere in the analysis or execution pipeline. The system reads the config, carries it through the call chain, and then ignores it.

## Current State

| Field | Type | Default | Resolved In | Enforced | Location in `session-agent.ts` |
|-------|------|---------|-------------|----------|-------------------------------|
| `maxNotionalPerTrade` | `number` | 5000 | `resolveEffectiveConfig()` | No | Not referenced in `handleTradeDecision()` |
| `maxPositions` | `number` | 10 | `resolveEffectiveConfig()` | No | Not referenced in `handleTradeDecision()` |
| `maxPositionValue` | `number` | 5000 | `resolveEffectiveConfig()` | No | Not referenced in `handleTradeDecision()` |
| `maxDailyLossPct` | `number` | 0.02 | `resolveEffectiveConfig()` | No | Not referenced anywhere |
| `cooldownMinutesAfterLoss` | `number` | 30 | `resolveEffectiveConfig()` | No | Not referenced anywhere |
| `allowShortSelling` | `boolean` | false | `resolveEffectiveConfig()` | Warning only | `createProposal()` line 814 adds a warning but does not block |
| `tradingHoursOnly` | `boolean` | true | `resolveEffectiveConfig()` | No | `runOutcomeTrackingCycle()` checks `clock.isOpen` for tracking, but `runScheduledCycle()` and `triggerAnalysis()` do not |
| `tickerBlacklist` | `string[]` | [] | `resolveEffectiveConfig()` | No | Not referenced in `triggerAnalysis()` |
| `tickerAllowlist` | `string[] \| null` | null | `resolveEffectiveConfig()` | No | Not referenced in `triggerAnalysis()` |

## Target State

- All nine risk fields are enforced at the appropriate pipeline stage
- Pre-analysis guards in `triggerAnalysis()` / `runScheduledCycle()` prevent wasted LLM calls
- Pre-execution guards in `handleTradeDecision()` prevent rule-violating trades
- Short-selling attempts are blocked (not just warned) when `allowShortSelling` is false
- All enforcement produces clear log/state messages explaining why an action was skipped or rejected

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [029-1-spec.md](./029-1-spec.md) | Overview, Goals/Non-Goals, Impact Analysis, Enforcement Points |
| 2 | [029-2-data.md](./029-2-data.md) | Config Fields Reference, Data Dependencies, No Schema Changes |
| 3 | [029-3-logic.md](./029-3-logic.md) | Pre-Analysis Guards, Pre-Execution Guards, Helper Methods |
| 4 | [029-4-api.md](./029-4-api.md) | No API Changes, Observability via State, Error Response Shapes |
| 5 | [029-5-ui.md](./029-5-ui.md) | No UI Changes, Future Consideration: Enforcement Log |
| 6 | [029-6-ops.md](./029-6-ops.md) | Implementation Order, Verification Criteria, File Change Summary |
