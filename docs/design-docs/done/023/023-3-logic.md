# Phase 23: Extended User Settings — Part 3: Logic

## Overview

This part covers how each agent and component reads the new config values, replacing hardcoded constants. The key change patterns are:

1. **proposalTimeoutSec** -- pass from config to proposal creation in both session and pipeline agents.
2. **llmTemperature / llmMaxTokens** -- pass to LLMAnalysisAgent via a new parameter on each callable method.
3. **scoreWindows** -- pass to debate/pipeline orchestrators for score recalculation.
4. **confidenceDisplayHigh / confidenceDisplayMed** -- pass to frontend components via the config query.

---

## Config Propagation Path

```
user_trading_config (Postgres)
  |
  | getTradingConfig(userId)
  v
SessionAgent.loadEffectiveConfig()
  |
  |-- proposalTimeoutSec --> createProposal(), PipelineOrchestrator.runPipeline()
  |-- llmTemperature -----> LLMAnalysisAgent.analyze(), analyzeAsPersona(), etc.
  |-- llmMaxTokens -------> LLMAnalysisAgent.analyze(), analyzeAsPersona(), etc.
  |-- scoreWindows -------> DebateOrchestrator.recalculateScores(), PipelineOrchestrator.recalculateScores()
  |
  v
Frontend (via getUserTradingConfig server function)
  |-- confidenceDisplayHigh --> TradeProposalCard
  |-- confidenceDisplayMed ---> TradeProposalCard
  |-- scoreWindows -----------> WindowSelector, performance-handlers.ts
```

---

## 1. LLMAnalysisAgent Changes

File: `apps/data-service/src/agents/llm-analysis-agent.ts`

### New Parameter: LLM User Preferences

Add an optional `llmPrefs` parameter to all `@callable()` methods that make LLM calls. This avoids changing the agent's internal state and keeps the config flow explicit.

```ts
interface LLMUserPrefs {
  temperature: number;  // user's base temperature (0.0 - 1.0)
  maxTokens: number;    // user's base max tokens (200 - 4000)
}
```

### Method Changes

Each method that currently hardcodes `temperature` and `max_tokens` adds an optional `llmPrefs?: LLMUserPrefs` parameter as the last argument. When provided, the method uses `resolveTaskLLMParams()` to compute the effective values. When absent (backward compat), it falls back to the current hardcoded values.

#### analyze() (trade recommendation + optional research)

```ts
// Current (line 107-115)
const recResult = await llm.complete({
  messages: [...],
  temperature: 0.3,
  max_tokens: 800,
  response_format: { type: 'json_object' },
});

// New
const { temperature, maxTokens } = llmPrefs
  ? resolveTaskLLMParams(llmPrefs.temperature, llmPrefs.maxTokens, 'trade_recommendation')
  : { temperature: 0.3, maxTokens: 800 };

const recResult = await llm.complete({
  messages: [...],
  temperature,
  max_tokens: maxTokens,
  response_format: { type: 'json_object' },
});
```

The same pattern applies to the research report section within `analyze()`:

```ts
// Current (line 125-135)
const resResult = await llm.complete({
  messages: [...],
  temperature: 0.5,
  max_tokens: 2000,
});

// New
const resParams = llmPrefs
  ? resolveTaskLLMParams(llmPrefs.temperature, llmPrefs.maxTokens, 'research_report')
  : { temperature: 0.5, maxTokens: 2000 };

const resResult = await llm.complete({
  messages: [...],
  temperature: resParams.temperature,
  max_tokens: resParams.maxTokens,
});
```

#### Full Method Signature Changes

| Method | Current Signature | New Signature |
|--------|-------------------|---------------|
| `analyze` | `(request, userId)` | `(request, userId, llmPrefs?)` |
| `classifyEvent` | `(rawContent)` | `(rawContent, llmPrefs?)` |
| `generateReport` | `(symbol, context)` | `(symbol, context, llmPrefs?)` |
| `analyzeAsPersona` | `(persona, data, strategy, performanceContext?)` | `(persona, data, strategy, performanceContext?, llmPrefs?)` |
| `synthesizeConsensus` | `(analyses, debateRounds, moderatorPrompt, personaComparison?)` | `(analyses, debateRounds, moderatorPrompt, personaComparison?, llmPrefs?)` |
| `validateRisk` | `(symbol, recommendation, portfolio)` | `(symbol, recommendation, portfolio, llmPrefs?)` |
| `generateDebateResponse` | `(persona, session, roundNumber)` | `(persona, session, roundNumber, llmPrefs?)` |

All new parameters are optional -- callers that do not pass `llmPrefs` get the existing hardcoded behavior.

### Task Type Mapping

| Method | Task Type |
|--------|-----------|
| `analyze` (recommendation) | `trade_recommendation` |
| `analyze` (research) | `research_report` |
| `classifyEvent` | `event_classification` |
| `generateReport` | `report_generation` |
| `analyzeAsPersona` | `persona_analysis` |
| `synthesizeConsensus` | `consensus_synthesis` |
| `validateRisk` | `risk_validation` |
| `generateDebateResponse` | `debate_response` |

---

## 2. SessionAgent Changes

File: `apps/data-service/src/agents/session-agent.ts`

### Config Loading

The `loadEffectiveConfig()` method (from Phase 21) already reads `user_trading_config` from Postgres. The new columns are automatically included since `getTradingConfig()` returns all columns and `TradingConfig` type expands to include the new fields.

No changes to `loadEffectiveConfig()` itself -- the new fields flow through automatically.

### Passing LLM Prefs to Analysis

In `runAnalysisForSymbol()`, after loading the effective config, construct the `LLMUserPrefs` and pass it to all LLM agent calls:

```ts
// In runAnalysisForSymbol()
const effectiveConfig = await this.loadEffectiveConfig();
const llmPrefs: LLMUserPrefs = {
  temperature: effectiveConfig.llmTemperature ?? 0.3,
  maxTokens: effectiveConfig.llmMaxTokens ?? 1000,
};

// Pass to LLM agent
const analysis = await llmAgent.analyze(request, userId, llmPrefs);
```

### Passing proposalTimeoutSec to Proposal Creation

The session agent already reads `proposalTimeoutSec` from its DO SQLite `session_config`. With Phase 23, the PG `user_trading_config.proposal_timeout_sec` takes priority via `resolveEffectiveConfig()`.

Current code (line 658):
```ts
expiresAt: Date.now() + config.proposalTimeoutSec * 1000,
```

This already works correctly because `config` is the effective config. No change needed in session-agent.

### Passing Config to Orchestrators

When delegating to `DebateOrchestratorAgent` or `PipelineOrchestratorAgent`, pass the relevant config values:

```ts
// In runDebateAnalysis()
const debateResult = await debate.runDebate({
  // ...existing params...
  llmPrefs,
  proposalTimeoutSec: effectiveConfig.proposalTimeoutSec ?? 900,
  scoreWindows: effectiveConfig.scoreWindows ?? [30, 90, 180],
});
```

---

## 3. PipelineOrchestratorAgent Changes

File: `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`

### Proposal Timeout Fix

Current (line 472):
```ts
expiresAt: Date.now() + 900_000,
```

This is the primary bug -- the pipeline orchestrator ignores the config entirely and hardcodes 900 seconds. Change to:

```ts
expiresAt: Date.now() + (params.proposalTimeoutSec ?? 900) * 1000,
```

The `params` object passed to `runPipeline()` is extended to include `proposalTimeoutSec`.

### Score Windows

Current (line 398):
```ts
const windows: ScoreWindow[] = [30, 90, 180];
```

Change to:
```ts
const windows = params.scoreWindows ?? [30, 90, 180];
```

The `recalculateScores()` method (or its caller) receives the user's score windows.

### LLM Prefs Passthrough

The pipeline orchestrator calls `LLMAnalysisAgent.analyze()` and `LLMAnalysisAgent.validateRisk()`. Both calls need to forward `llmPrefs`:

```ts
// Step 3: LLM Analysis
const analysis = await llmAgent.analyze(request, userId, params.llmPrefs);

// Step 4: Risk Validation
const riskResult = await llmAgent.validateRisk(symbol, recommendation, portfolio, params.llmPrefs);
```

---

## 4. DebateOrchestratorAgent Changes

File: `apps/data-service/src/agents/debate-orchestrator-agent.ts`

### Score Windows

Current (line 472):
```ts
const windows: ScoreWindow[] = [30, 90, 180];
```

Same change as pipeline orchestrator:
```ts
const windows = params.scoreWindows ?? [30, 90, 180];
```

### LLM Prefs Passthrough

All LLM agent calls in the debate flow forward `llmPrefs`:

```ts
// Initial analysis
const analysis = await llmAgent.analyzeAsPersona(persona, data, strategy, perfContext, params.llmPrefs);

// Debate rounds
const response = await llmAgent.runDebateRound(persona, session, roundNumber, params.llmPrefs);

// Consensus
const consensus = await llmAgent.synthesizeConsensus(analyses, rounds, prompt, comparison, params.llmPrefs);
```

---

## 5. Performance Handlers Changes

File: `apps/data-service/src/hono/handlers/performance-handlers.ts`

### Dynamic Window Validation

Current (line 9):
```ts
const VALID_WINDOWS = new Set([30, 90, 180]);
```

Change to read the user's configured windows:

```ts
performanceRouter.get('/scores', async (c) => {
  const userId = c.get('userId');
  const rawWindow = c.req.query('window');

  // Read user's configured windows
  const tradingConfig = await getTradingConfig(userId);
  const userWindows: number[] = tradingConfig?.scoreWindows ?? [30, 90, 180];
  const validWindows = new Set(userWindows);

  const windowDays = validWindows.has(Number(rawWindow))
    ? Number(rawWindow)
    : userWindows[0]; // default to first configured window

  // ...rest unchanged...
});
```

### Import

Add `getTradingConfig` import from `@repo/data-ops/trading-config`.

---

## 6. ScoreWindow Type Changes

File: `packages/data-ops/src/agents/memory/types.ts`

Current:
```ts
export type ScoreWindow = 30 | 90 | 180;
```

Change to:
```ts
export type ScoreWindow = number;
```

This is a widening change -- all existing code that uses `ScoreWindow` continues to work. The fixed union was always an arbitrary constraint.

File: `packages/data-ops/src/agents/memory/schema.ts`

Current:
```ts
export const ScoreWindowSchema = z.union([z.literal(30), z.literal(90), z.literal(180)]);
```

Change to:
```ts
export const ScoreWindowSchema = z.number().int().min(7).max(365);
```

---

## 7. Frontend Config Access

The frontend already has `getUserTradingConfig` server function that returns the full `TradingConfig`. The new fields are automatically included. Components that need the new values use the existing `useQuery` pattern:

```ts
// In any component
const { data: config } = useQuery({
  queryKey: ['trading-config'],
  queryFn: () => getUserTradingConfig(),
});

// Access new fields
const highThreshold = config?.confidenceDisplayHigh ?? 0.7;
const medThreshold = config?.confidenceDisplayMed ?? 0.4;
const windows = config?.scoreWindows ?? [30, 90, 180];
```

The details of component-level changes are covered in Part 5 (UI).

---

## File Change Summary

| File | Action | Key Changes |
|------|--------|-------------|
| `apps/data-service/src/agents/llm-analysis-agent.ts` | MODIFY | Add `llmPrefs?` param to 7 methods, use `resolveTaskLLMParams()` |
| `apps/data-service/src/agents/session-agent.ts` | MODIFY | Construct `llmPrefs` from config, pass to orchestrators |
| `apps/data-service/src/agents/pipeline-orchestrator-agent.ts` | MODIFY | Accept `proposalTimeoutSec`, `scoreWindows`, `llmPrefs` in params; remove hardcoded `900_000` |
| `apps/data-service/src/agents/debate-orchestrator-agent.ts` | MODIFY | Accept `scoreWindows`, `llmPrefs` in params; remove hardcoded `[30, 90, 180]` |
| `apps/data-service/src/hono/handlers/performance-handlers.ts` | MODIFY | Read user windows from config, replace hardcoded `VALID_WINDOWS` |
| `packages/data-ops/src/agents/memory/types.ts` | MODIFY | Widen `ScoreWindow` from union to `number` |
| `packages/data-ops/src/agents/memory/schema.ts` | MODIFY | Replace fixed union with `z.number().int().min(7).max(365)` |
