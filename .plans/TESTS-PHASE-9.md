# Phase 9: LLMAnalysisAgent Tests

## Goal
Test LLMAnalysisAgent (965 LOC) — analyze, classifyEvent, generateReport, persona analysis, debate rounds, consensus synthesis, risk validation, usage tracking, and provider resolution. Design docs 006 + 020.

## Status: DONE

## Failure Triage Protocol

When a test fails, do NOT assume the test is wrong. Follow this order:

1. **Harness/mock bug** — Is the test setup incorrect? Wrong mock return value, missing table, wrong field name in the harness? Fix the test infrastructure.
2. **Implementation bug** — Does the agent code deviate from the design doc spec? Read the design doc and compare to the implementation. If the code is wrong, fix the code to match the spec and note the fix in the design doc.
3. **Design doc gap** — Is the spec ambiguous or missing a case? Ask the user, then update the spec.

**Design docs**:
- `docs/design-docs/done/006/` (006-1-spec.md through 006-6-ops.md) — LLM analysis
- `docs/design-docs/done/020/` (020-1-spec.md through 020-7-memory.md) — Multi-persona debate & consensus

**Agent source**: `src/agents/llm-analysis-agent.ts`

Always read the relevant design doc section before concluding a test is wrong. The tests are spec-driven — they verify documented behavior.

## Prerequisites
- Phase 7-8 completed (setup.ts with technicals + market-data mocks)
- New mocks in setup.ts for llm-analysis, enhanced providers/llm mock

## Setup Changes

### 1. Update `@repo/data-ops/providers/llm` mock in `test/setup.ts`

Replace the existing simple mock with a richer one:

```ts
vi.mock('@repo/data-ops/providers/llm', () => ({
	createLLMProvider: vi.fn().mockReturnValue({
		complete: vi.fn().mockResolvedValue({
			content: JSON.stringify({
				action: 'buy', confidence: 0.8, rationale: 'test',
				entry_price: 150, target_price: 165, stop_loss: 142,
				position_size_pct: 5, timeframe: 'swing', risks: ['market risk'],
			}),
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		}),
	}),
	estimateCost: vi.fn().mockReturnValue(0.005),
	TRADE_RECOMMENDATION_PROMPT: 'Recommend: ',
	RESEARCH_REPORT_PROMPT: 'Report: ',
	EVENT_CLASSIFICATION_PROMPT: 'Classify: ',
	PERSONA_ANALYSIS_PROMPT: 'Persona: ',
	DEBATE_ROUND_PROMPT: 'Debate: ',
	CONSENSUS_SYNTHESIS_PROMPT: 'Consensus: ',
	RISK_VALIDATION_PROMPT: 'Risk: ',
}));
```

### 2. Add mock for `@repo/data-ops/llm-analysis` in `test/setup.ts`

```ts
vi.mock('@repo/data-ops/llm-analysis', () => ({
	insertAnalysis: vi.fn().mockResolvedValue(undefined),
	updateUsage: vi.fn().mockResolvedValue(undefined),
}));
```

### 3. Create `test/harness/create-test-llm-agent.ts`

Factory function:
- `Object.create(LLMAnalysisAgent.prototype)`
- In-memory SQLite + `createSqlTag`
- Set `name = 'test-user-123'`
- Set `env` with `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `CREDENTIALS_ENCRYPTION_KEY: 'test-key'`, `AI: {}` (workers-ai binding stub)
- Wire `state`/`setState`/`initialState` with default LLMAgentState
- Call `agent.onStart()` to create usage_log and provider_config tables
- Return `{ agent, db, stateHistory }`

Helper: `getMockLLMProvider()` — returns the mock `complete` fn from `createLLMProvider` for per-test configuration.

### 4. Create `test/harness/mock-llm-provider.ts`

Utility to create configurable LLM mock responses:

```ts
export function createMockComplete(overrides?: Record<string, unknown>) {
	return vi.fn().mockResolvedValue({
		content: JSON.stringify({
			action: 'buy', confidence: 0.8, rationale: 'test',
			entry_price: 150, target_price: 165, stop_loss: 142,
			position_size_pct: 5, timeframe: 'swing', risks: [],
			...overrides,
		}),
		usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
	});
}

export function createMalformedComplete() {
	return vi.fn().mockResolvedValue({
		content: 'not valid json {{{',
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
	});
}
```

### 5. Create test files

```
test/agents/
├── llm-analysis.test.ts      # Tests 80-92: core analyze, classifyEvent, generateReport, getUsage
├── llm-persona.test.ts       # Tests 93-98: analyzeAsPersona, runDebateRound, synthesizeConsensus
├── llm-risk.test.ts           # Tests 99-100: validateRisk
└── llm-provider.test.ts      # Tests 101-105: setProviderConfig, resolution chain
```

## Tests

### llm-analysis.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 80 | `onStart creates usage_log and provider_config tables` | PRAGMA table_info for both tables |
| 81 | `analyze returns recommendation with all fields` | Result has { id, userId, symbol, timestamp, recommendation, usage, model, provider } |
| 82 | `analyze with includeResearch makes two LLM calls` | `complete()` called twice when `request.includeResearch = true` |
| 83 | `analyze logs usage to usage_log` | After analyze, `SELECT * FROM usage_log` has row with tokens/cost |
| 84 | `analyze writes to PG via insertAnalysis` | `insertAnalysis` called once with result |
| 85 | `analyze updates state (totalAnalyses, totalTokens)` | state.totalAnalyses incremented, state.totalTokens increased |
| 86 | `analyze safe defaults on JSON parse failure` | Mock complete returns malformed JSON → recommendation.action === 'hold', confidence === 0.1 |
| 87 | `analyze clamps positionSizePct to [1,10]` | Mock complete returns `position_size_pct: 50` → clamped to 10; returns 0 → clamped to 1 |
| 88 | `classifyEvent returns typed result` | Result has { event_type, symbols, summary, confidence } |
| 89 | `classifyEvent clamps confidence to [0,1]` | Mock returns confidence 5.0 → clamped to 1; returns -1 → clamped to 0 |
| 90 | `generateReport returns report string` | Result has { report } as string |
| 91 | `getUsage aggregates within date range` | Insert usage_log rows, getUsage(30) returns SUM of tokens and cost |
| 92 | `getUsage returns zeros when empty` | No rows → { totalTokens: 0, totalCostUsd: 0 } |

### llm-persona.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 93 | `analyzeAsPersona safe defaults on parse failure` | Malformed JSON → { action: 'hold', confidence: 0.1, rationale contains 'Failed' } |
| 94 | `analyzeAsPersona validates action to buy/sell/hold` | Mock returns `action: 'yolo'` → normalized to 'hold' |
| 95 | `runDebateRound calls LLM for each persona` | Pass 3 personas → complete() called 3 times |
| 96 | `runDebateRound returns DebateRound shape` | Result has { roundNumber, responses } with correct persona IDs |
| 97 | `synthesizeConsensus normalizes positionSizePct` | Mock returns `positionSizePct: 0.05` → normalized via normalizePositionSizePct |
| 98 | `synthesizeConsensus safe defaults on parse failure` | Malformed JSON → { action: 'hold', confidence: 0.1 } |

### llm-risk.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 99 | `validateRisk returns RiskValidation shape` | Result has { approved, adjustedPositionSize, warnings, rationale } |
| 100 | `validateRisk safe defaults on parse failure` | Malformed JSON → { approved: false, warnings: ['Risk validation parsing error'] } |

### llm-provider.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 101 | `setProviderConfig persists to table` | After call, `SELECT * FROM provider_config` has row |
| 102 | `provider resolution: cached config first` | Insert provider_config row → resolveProviderConfig uses it, `getCredential` called for that provider |
| 103 | `provider resolution: falls to workers-ai last` | Mock `getCredential` returns null for all → uses workers-ai with AI binding |
| 104 | `provider resolution: throws when none available` | This test needs to verify the loop behavior — mock getCredential null + no workers-ai fallback. Note: looking at the code, workers-ai is last in the loop and doesn't need credentials, so it always succeeds. This test may need adjustment — the agent always falls back to workers-ai. Verify this is actually the case by reading the provider resolution code (lines 521-576). If workers-ai always works, this test should verify workers-ai is used as fallback instead. |
| 105 | `analyze throws when no credentials` | This tests the full flow where provider resolution fails — only possible if we remove workers-ai from the providers list. May need to test via a different mechanism. |

**Note on tests 104-105**: The code at lines 549-556 shows workers-ai is the last provider in the loop and it doesn't check credentials — it just returns with `aiBinding`. So the `throw new Error('No LLM provider available')` at line 575 is only reachable if the for-loop somehow skips workers-ai. In practice, workers-ai always provides a fallback. Tests 104-105 should verify:
- 104: `provider resolution uses workers-ai as ultimate fallback` — all credentials null → result has provider 'workers-ai'
- 105: Optionally remove or adjust — could test that when cached config has an invalid provider and credential is null, it still falls through to workers-ai

## Mocking Strategy

- `createLLMProvider` returns `{ complete: vi.fn() }` — configure per-test
- `insertAnalysis`, `updateUsage` are vi.fn() — verify called
- `estimateCost` returns fixed value
- `resolveTaskLLMParams` passthrough (already in setup.ts)
- `getCredential` already mocked globally; override per-test for provider resolution tests
- Real SQLite for usage_log and provider_config verification

## Key Source References
- Agent: `src/agents/llm-analysis-agent.ts` (965 LOC)
- Types: `packages/data-ops/src/agents/llm/types.ts`, `packages/data-ops/src/agents/debate/types.ts`
- Helpers: `src/agents/session-agent-helpers.ts` (normalizePositionSizePct)

## Verification
```bash
pnpm run test --filter data-service -- test/agents/llm-analysis.test.ts test/agents/llm-persona.test.ts test/agents/llm-risk.test.ts test/agents/llm-provider.test.ts
```
All 26 tests pass. Cumulative: 94.
