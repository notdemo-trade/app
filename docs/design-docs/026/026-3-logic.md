# Phase 26: Fix Position Size Units Mismatch — Part 3: Logic

## Normalization Utility

### New function in `apps/data-service/src/agents/session-agent-helpers.ts`

```ts
/**
 * Normalize a position size percentage to whole-number convention (5 = 5%).
 *
 * The TradeProposal.positionSizePct field and execution math (cash * pct / 100)
 * expect whole-number percentages. Config values use fractions (0.05 = 5%).
 * LLM outputs typically use whole numbers (5 = 5%) but may return fractions.
 *
 * Heuristic: values in (0, 1) exclusive are treated as fractions and multiplied by 100.
 * Values >= 1 are treated as already-whole-number percentages.
 *
 * Edge cases:
 * - 0 returns 0 (no position)
 * - 0.5 returns 50 (50% of cash -- valid but extreme)
 * - 1.0 returns 1 (1% -- ambiguous, but 100% would be an extreme config that
 *   should arrive as config * 100 = 100, not as raw 1.0)
 * - 5 returns 5 (5% -- already correct)
 * - 100 returns 100 (100% -- exit proposal convention)
 */
export function normalizePositionSizePct(value: number): number {
	if (value > 0 && value < 1) {
		return value * 100;
	}
	return value;
}
```

This function is deliberately simple. The heuristic is sound because:
- Config fractions are always < 1 (max Zod validation is 1.0, typical values are 0.03-0.10)
- LLM `position_size_pct` is clamped to 1-10 in `parseRecommendation()`
- LLM `positionSizePct` (consensus) is typically 1-10 per prompt instructions
- The only path where a value naturally falls in (0, 1) is a config fraction or an LLM returning a fraction

---

## Change 1: Fix debate proposal creation

### File: `apps/data-service/src/agents/session-agent.ts`

**Location:** `createProposal()` method, approximately line 835.

### Current code:

```ts
const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    threadId,
    symbol,
    action: consensus.action as 'buy' | 'sell',
    confidence: consensus.confidence,
    rationale: consensus.rationale,
    entryPrice: consensus.entryPrice,
    targetPrice: consensus.targetPrice,
    stopLoss: consensus.stopLoss,
    qty: null,
    notional: null,
    positionSizePct: consensus.positionSizePct ?? config.positionSizePctOfCash,
    risks: consensus.risks,
    warnings,
    // ...
};
```

### Updated code:

```ts
const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    threadId,
    symbol,
    action: consensus.action as 'buy' | 'sell',
    confidence: consensus.confidence,
    rationale: consensus.rationale,
    entryPrice: consensus.entryPrice,
    targetPrice: consensus.targetPrice,
    stopLoss: consensus.stopLoss,
    qty: null,
    notional: null,
    positionSizePct: normalizePositionSizePct(
        consensus.positionSizePct ?? config.positionSizePctOfCash * 100,
    ),
    risks: consensus.risks,
    warnings,
    // ...
};
```

### Why both `* 100` and `normalizePositionSizePct()`?

- `config.positionSizePctOfCash * 100` converts the known-fraction config value to a whole number. This is an explicit, guaranteed-correct conversion at the boundary.
- `normalizePositionSizePct()` wraps the entire expression as a safety net for the case where `consensus.positionSizePct` is non-null but happens to be a fraction (e.g., LLM returned `0.05` instead of `5`). In the common case where consensus provides a whole number (e.g., `5`), the normalizer returns it unchanged.

### Import addition:

```ts
import { normalizePositionSizePct } from './session-agent-helpers';
```

---

## Change 2: Pass user config to pipeline and fix pipeline fallback

### File: `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`

**Location:** `RunPipelineParams` interface (line 24) and `buildProposal()` method (line 468).

### 2a: Extend `RunPipelineParams`

```ts
// Current:
export interface RunPipelineParams {
    symbol: string;
    strategyId: string;
    strategy: StrategyTemplate;
    onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
    llmPrefs?: { temperature: number; maxTokens: number };
    proposalTimeoutSec?: number;
    scoreWindows?: number[];
    portfolioContext?: PortfolioContext;
}

// Updated:
export interface RunPipelineParams {
    symbol: string;
    strategyId: string;
    strategy: StrategyTemplate;
    onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
    llmPrefs?: { temperature: number; maxTokens: number };
    proposalTimeoutSec?: number;
    scoreWindows?: number[];
    portfolioContext?: PortfolioContext;
    /** User's configured position size as a fraction (0.0-1.0). Converted to whole-number pct internally. */
    positionSizePctOfCash?: number;
}
```

### 2b: Fix `buildProposal()`

```ts
// Current:
private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
    const rec = ctx.recommendation;
    if (!rec) throw new Error('No recommendation available for proposal');
    const positionSizePct = ctx.riskValidation?.adjustedPositionSize ?? rec.position_size_pct ?? 5;
    // ...
}

// Updated:
private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
    const rec = ctx.recommendation;
    if (!rec) throw new Error('No recommendation available for proposal');
    const rawPct = ctx.riskValidation?.adjustedPositionSize
        ?? rec.position_size_pct
        ?? (params.positionSizePctOfCash !== undefined
            ? params.positionSizePctOfCash * 100
            : 5);
    const positionSizePct = normalizePositionSizePct(rawPct);
    // ...
}
```

### Import addition:

```ts
import { normalizePositionSizePct } from './session-agent-helpers';
```

### Fallback chain (in priority order):

1. `ctx.riskValidation?.adjustedPositionSize` -- LLM risk manager's adjusted size (now normalized)
2. `rec.position_size_pct` -- LLM analysis recommendation (clamped 1-10 by `parseRecommendation()`)
3. `params.positionSizePctOfCash * 100` -- user's config (fraction converted to whole number)
4. `5` -- hardcoded default (only if user has no config at all)

---

## Change 3: Pass config from session-agent to pipeline

### File: `apps/data-service/src/agents/session-agent.ts`

**Location:** `runPipelineAnalysis()` method, approximately line 538.

### Current code:

```ts
const result = (await pipeline.runPipeline({
    symbol,
    strategyId: config.activeStrategyId,
    strategy,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    proposalTimeoutSec: config.proposalTimeoutSec,
    scoreWindows: config.scoreWindows,
    portfolioContext,
})) as RunPipelineResult;
```

### Updated code:

```ts
const result = (await pipeline.runPipeline({
    symbol,
    strategyId: config.activeStrategyId,
    strategy,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    proposalTimeoutSec: config.proposalTimeoutSec,
    scoreWindows: config.scoreWindows,
    portfolioContext,
    positionSizePctOfCash: config.positionSizePctOfCash,
})) as RunPipelineResult;
```

---

## Change 4: Normalize risk validation output

### File: `apps/data-service/src/agents/llm-analysis-agent.ts`

**Location:** `parseRiskValidation()` function, approximately line 676.

### Current code:

```ts
function parseRiskValidation(content: string): RiskValidation {
    try {
        const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
        return {
            approved: parsed.approved === true,
            adjustedPositionSize:
                typeof parsed.adjustedPositionSize === 'number' ? parsed.adjustedPositionSize : null,
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
            rationale: String(parsed.rationale || 'No risk rationale'),
        };
    } catch {
        // ...
    }
}
```

### Updated code:

```ts
function parseRiskValidation(content: string): RiskValidation {
    try {
        const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
        return {
            approved: parsed.approved === true,
            adjustedPositionSize:
                typeof parsed.adjustedPositionSize === 'number'
                    ? normalizePositionSizePct(parsed.adjustedPositionSize)
                    : null,
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
            rationale: String(parsed.rationale || 'No risk rationale'),
        };
    } catch {
        // ...
    }
}
```

### Import:

The `normalizePositionSizePct` function is defined in `session-agent-helpers.ts`. Since `llm-analysis-agent.ts` is a separate agent, we need to decide where to place the utility:

**Option A**: Export from `session-agent-helpers.ts`, import in both files.
**Option B**: Move to a shared `agents/utils.ts` file.

Recommendation: **Option A** for minimal file changes. `session-agent-helpers.ts` is already imported by agents that need helper functions, and the function is small. If a shared utils file already exists, use that instead.

---

## Change 5: Normalize consensus parsing output (defense in depth)

### File: `apps/data-service/src/agents/llm-analysis-agent.ts`

**Location:** `parseConsensusResult()` function, approximately line 644.

### Current code:

```ts
positionSizePct: typeof parsed.positionSizePct === 'number' ? parsed.positionSizePct : null,
```

### Updated code:

```ts
positionSizePct: typeof parsed.positionSizePct === 'number'
    ? normalizePositionSizePct(parsed.positionSizePct)
    : null,
```

This is defense in depth. The LLM consensus prompt asks for 1-10, but LLMs are non-deterministic. If the moderator LLM returns `0.05` instead of `5`, the normalizer catches it before the value reaches `createProposal()`.

---

## Execution path remains unchanged

### File: `apps/data-service/src/agents/session-agent.ts`, line 603-606

```ts
if (!qty && !notional && proposal.positionSizePct) {
    const account = await broker.getAccount();
    notional = Math.round(account.cash * (proposal.positionSizePct / 100) * 100) / 100;
}
```

This code is correct and should NOT be changed. After the fixes above:
- Debate fallback: `config.positionSizePctOfCash (0.05) * 100 = 5` --> `$100k * (5 / 100) = $5,000`
- Pipeline: `rec.position_size_pct (5)` --> `$100k * (5 / 100) = $5,000`
- Pipeline with user config: `config (0.05) * 100 = 5` --> `$100k * (5 / 100) = $5,000`
- Exit proposal: `positionSizePct: 100` --> uses `qty` directly, not this path

---

## Exit proposal remains unchanged

### File: `apps/data-service/src/agents/session-agent.ts`, line 1168

```ts
positionSizePct: 100,
```

Exit proposals set `qty` directly (the full position quantity), so the `positionSizePct` value is informational (means "close 100% of position"). The execution path checks `qty` first and skips the notional calculation. No change needed.

---

## Summary of all changes

| File | Change | Lines |
|------|--------|-------|
| `apps/data-service/src/agents/session-agent-helpers.ts` | Add `normalizePositionSizePct()` export | +15 |
| `apps/data-service/src/agents/session-agent.ts` | Import `normalizePositionSizePct`, fix debate proposal `positionSizePct` | ~3 |
| `apps/data-service/src/agents/session-agent.ts` | Pass `positionSizePctOfCash` to pipeline call | +1 |
| `apps/data-service/src/agents/pipeline-orchestrator-agent.ts` | Add `positionSizePctOfCash` to `RunPipelineParams` | +2 |
| `apps/data-service/src/agents/pipeline-orchestrator-agent.ts` | Import `normalizePositionSizePct`, fix `buildProposal()` fallback chain | ~5 |
| `apps/data-service/src/agents/llm-analysis-agent.ts` | Import `normalizePositionSizePct`, normalize risk validation output | ~3 |
| `apps/data-service/src/agents/llm-analysis-agent.ts` | Normalize consensus parsing output | ~2 |

**Total: ~30 lines changed across 4 files. No new files.**

---

## Data Flow After Fix

### Debate mode (consensus provides value):

```
LLM consensus: positionSizePct = 5 (whole number)
    |
    +-- normalizePositionSizePct(5) = 5  (>= 1, unchanged)
    |
    v
TradeProposal.positionSizePct = 5
    |
    v
handleTradeDecision(): $100k * (5 / 100) = $5,000  [CORRECT]
```

### Debate mode (consensus null, config fallback):

```
config.positionSizePctOfCash = 0.05 (fraction)
    |
    +-- 0.05 * 100 = 5
    +-- normalizePositionSizePct(5) = 5
    |
    v
TradeProposal.positionSizePct = 5
    |
    v
handleTradeDecision(): $100k * (5 / 100) = $5,000  [CORRECT, was $50]
```

### Pipeline mode (LLM provides value):

```
rec.position_size_pct = 5 (clamped 1-10)
    |
    +-- normalizePositionSizePct(5) = 5
    |
    v
TradeProposal.positionSizePct = 5
    |
    v
handleTradeDecision(): $100k * (5 / 100) = $5,000  [CORRECT]
```

### Pipeline mode (LLM null, user config fallback):

```
config.positionSizePctOfCash = 0.05 (fraction)
    |
    +-- 0.05 * 100 = 5
    +-- normalizePositionSizePct(5) = 5
    |
    v
TradeProposal.positionSizePct = 5
    |
    v
handleTradeDecision(): $100k * (5 / 100) = $5,000  [CORRECT, was using hardcoded 5]
```

### Pipeline mode (risk validation adjusts):

```
riskValidation.adjustedPositionSize = 3 (from LLM, already normalized in parseRiskValidation)
    |
    +-- normalizePositionSizePct(3) = 3
    |
    v
TradeProposal.positionSizePct = 3
    |
    v
handleTradeDecision(): $100k * (3 / 100) = $3,000  [CORRECT]
```

### LLM returns fraction (edge case):

```
LLM consensus: positionSizePct = 0.05 (fraction, unexpected)
    |
    +-- normalizePositionSizePct(0.05) = 5  (< 1, converted)
    |
    v
TradeProposal.positionSizePct = 5
    |
    v
handleTradeDecision(): $100k * (5 / 100) = $5,000  [CORRECT]
```
