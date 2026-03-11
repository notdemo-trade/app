# Phase 11: PipelineOrchestratorAgent Tests

## Goal
Test PipelineOrchestratorAgent (679 LOC) — 6-step pipeline orchestration, proposal generation, outcome recording, score computation, and error handling. Design doc 020.

## Status: DONE

## Failure Triage Protocol

When a test fails, do NOT assume the test is wrong. Follow this order:

1. **Harness/mock bug** — Is the test setup incorrect? Wrong mock return value, missing table, wrong field name in the harness? Fix the test infrastructure.
2. **Implementation bug** — Does the agent code deviate from the design doc spec? Read the design doc and compare to the implementation. If the code is wrong, fix the code to match the spec and note the fix in the design doc.
3. **Design doc gap** — Is the spec ambiguous or missing a case? Ask the user, then update the spec.

**Design doc**: `docs/design-docs/done/020/` (020-1-spec.md through 020-7-memory.md) — Pipeline orchestration, outcome tracking, scoring

**Agent source**: `src/agents/pipeline-orchestrator-agent.ts`

Always read the relevant design doc section before concluding a test is wrong. The tests are spec-driven — they verify documented behavior.

## Prerequisites
- Phase 7-10 completed (all mocks and harness files in place)
- Reuses mock-llm-agent.ts from Phase 10

## Setup Changes

### 1. Add fixtures to `test/harness/fixtures.ts`

```ts
export const sampleRecommendation = {
	action: 'buy' as const, confidence: 0.85, rationale: 'Strong buy signal',
	entry_price: 150, target_price: 165, stop_loss: 142,
	position_size_pct: 5, timeframe: 'swing', risks: ['market risk'],
};

export const sampleRiskValidation = {
	approved: true, adjustedPositionSize: null,
	warnings: [], rationale: 'Risk approved',
};

export const sampleStrategy: StrategyTemplate = {
	id: 'moderate', name: 'Moderate Growth',
	riskTolerance: 'medium', positionSizeBias: 0.5,
	preferredTimeframe: '1Day',
	analysisFocus: ['momentum', 'value'],
	customPromptSuffix: '',
};
```

### 2. Create mock-ta-agent.ts (or inline in mock-llm-agent.ts)

```ts
export function createMockTAAgent(overrides?: Record<string, unknown>) {
	return {
		analyze: vi.fn().mockResolvedValue({
			symbol: 'AAPL', timeframe: '1Day',
			indicators: sampleIndicators,
			signals: sampleSignals,
			bars: sampleBars,
		}),
		getSignals: vi.fn().mockResolvedValue(sampleSignals),
		getIndicators: vi.fn().mockResolvedValue(sampleIndicators),
		...overrides,
	};
}
```

### 3. Create mock-broker-agent.ts (or inline)

```ts
export function createMockBrokerAgent(overrides?: Record<string, unknown>) {
	return {
		getAccount: vi.fn().mockResolvedValue({
			id: 'account-001', currency: 'USD', cash: 100_000,
			portfolioValue: 100_000, buyingPower: 200_000,
			daytradeCount: 0, status: 'ACTIVE',
		}),
		getPositions: vi.fn().mockResolvedValue([]),
		getClock: vi.fn().mockResolvedValue({ isOpen: true, nextOpenAt: 0, nextCloseAt: 0 }),
		placeOrder: vi.fn().mockResolvedValue({ id: 'order-001', filledQty: 10, filledAvgPrice: 150 }),
		getOrderHistory: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}
```

### 4. Create `test/harness/create-test-pipeline-agent.ts`

Factory function:
- `Object.create(PipelineOrchestratorAgent.prototype)`
- In-memory SQLite + `createSqlTag`
- Set `name = 'test-user-123:AAPL'` (userId:symbol)
- Set `env` with:
  - `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
  - `TechnicalAnalysisAgent: Symbol('TechnicalAnalysisAgent')`
  - `LLMAnalysisAgent: Symbol('LLMAnalysisAgent')`
  - `AlpacaBrokerAgent: Symbol('AlpacaBrokerAgent')`
- Wire `state`/`setState`/`initialState` with default PipelineOrchestratorState
- Call `agent.onStart()` to create pipeline tables (4 tables)
- Register all 3 mock agents via registerMockAgent
- Return `{ agent, db, stateHistory, mockTA, mockLLM, mockBroker }`

### 5. Create test files

```
test/agents/
├── pipeline-orchestration.test.ts  # Tests 135-153
├── pipeline-outcomes.test.ts       # Tests 157-164
└── pipeline-proposal.test.ts       # Tests 154-156
```

## Tests

### pipeline-orchestration.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 135 | `onStart creates pipeline tables` | PRAGMA table_info for pipeline_sessions, pipeline_steps, pipeline_outcomes, pipeline_scores |
| 136 | `runPipeline creates session + 6 steps` | After runPipeline, pipeline_sessions has 1 row, pipeline_steps has 6 rows |
| 137 | `Step 1: fetch_market_data calls getBarsForSymbol` | `getBarsForSymbol` called with (symbol, '1Day', 200) |
| 138 | `Step 2: technical_analysis calls TA.analyze` | `mockTA.analyze` called with ('1Day', bars) |
| 139 | `Step 3: fetch_enrichment skips when no dataFeeds` | When `params.dataFeeds` is undefined → `getEnrichmentForSymbol` NOT called, message emitted saying 'skipping' |
| 140 | `Step 3: fetch_enrichment fetches when enabled` | When `params.dataFeeds = { fundamentals: true }` → `getEnrichmentForSymbol` called |
| 141 | `Step 4: llm_analysis calls LLM.analyze` | `mockLLM.analyze` called with request containing symbol, signals, indicators |
| 142 | `Step 5: risk_validation calls LLM.validateRisk` | `mockLLM.validateRisk` called; `mockBroker.getPositions` and `mockBroker.getAccount` called |
| 143 | `Step 6: generates proposal when risk approved` | riskValidation.approved = true, action = 'buy', confidence above threshold → proposal returned |
| 144 | `Step 6: no proposal when risk rejected` | riskValidation.approved = false → result.proposal is null |
| 145 | `Step 6: no proposal when action is 'hold'` | recommendation.action = 'hold' → result.proposal is null, message says 'hold' |
| 146 | `Step 6: no proposal when confidence below threshold` | recommendation.confidence = 0.5 < threshold 0.7 → no proposal |
| 147 | `Steps update status pending→running→completed` | After pipeline, `SELECT * FROM pipeline_steps ORDER BY step_order` → all status 'completed', started_at and completed_at set |
| 148 | `Emits messages per step` | onMessage called at least 2× per step (starting + completed) → 12+ calls |
| 149 | `Completed: session 'completed', state updated` | pipeline_sessions status = 'completed', state.totalPipelines incremented, state.activePipelineId = null |
| 150 | `Failed step: session 'failed', proposal null` | Mock getBarsForSymbol rejecting → session 'failed', proposal null |
| 151 | `Failed step: errorCount incremented` | After failure, state.errorCount incremented |
| 152 | `Step 2 fails when no bars` | getBarsForSymbol returns [] → TA step gets empty bars → context check: bars is empty array, TA analyze still called with empty bars. Actually looking at the code: step 1 sets ctx.bars, step 2 checks `if (!ctx.bars)` — if step 1 sets it to empty array, truthy check passes. The error should come from TA agent throwing on insufficient bars. |
| 153 | `Step 4 fails when no signals` | Make TA return null signals/indicators → LLM step throws 'No signals/indicators available' |

### pipeline-proposal.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 154 | `buildProposal uses adjustedPositionSize` | riskValidation.adjustedPositionSize = 3 → proposal.positionSizePct = 3 (priority over rec) |
| 155 | `buildProposal normalizes positionSizePct` | riskValidation.adjustedPositionSize = 0.05 → normalized to 5 |
| 156 | `buildProposal sets expiresAt from timeout` | proposalTimeoutSec = 600 → expiresAt ≈ now + 600*1000 |

### pipeline-outcomes.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 157 | `recordStepOutcome inserts row` | After recordStepOutcome, pipeline_outcomes has row with all fields |
| 158 | `recordStepOutcome: buy correct when pnl > 0` | action 'buy', pnl > 0 → was_correct = 1 |
| 159 | `recordStepOutcome triggers recompute` | After recording, pipeline_scores has rows for each window |
| 160 | `recordStepOutcome returns early when session not found` | Non-existent session ID → no error, no row inserted |
| 161 | `getPipelineScores returns for windowDays` | Insert pipeline_scores rows → getPipelineScores(30) returns mapped results |
| 162 | `recompute: winRate, avgPnl, sharpe` | Insert 10 outcomes → verify computed values |
| 163 | `recompute: deletes when no outcomes` | No outcomes for window → pipeline_scores row removed |
| 164 | `getUserId extracts from name` | Agent name 'test-user-123:AAPL' → getUserId returns 'test-user-123' (verify indirectly via getAgentByName call) |

## Mocking Strategy

- 3 agents via `registerMockAgent`: TA (createMockTAAgent), LLM (createMockLLMAgent), Broker (createMockBrokerAgent)
- `getBarsForSymbol` mocked at module level (from Phase 8 setup.ts addition)
- `getEnrichmentForSymbol` already mocked at module level
- `onMessage` callback as `vi.fn()` in RunPipelineParams
- Real SQLite for pipeline tables
- Pre-insert pipeline_sessions + pipeline_outcomes for scoring tests

## Key Source References
- Agent: `src/agents/pipeline-orchestrator-agent.ts` (679 LOC)
- Types: `packages/data-ops/src/agents/pipeline/types.ts`, `packages/data-ops/src/agents/session/types.ts`
- RunPipelineParams interface at lines 29-43
- PIPELINE_STEPS constant at lines 50-57

## Verification
```bash
pnpm run test --filter data-service -- test/agents/pipeline-orchestration.test.ts test/agents/pipeline-outcomes.test.ts test/agents/pipeline-proposal.test.ts
```
All 30 tests pass. Cumulative: 179.

## Final Verification (All Phases)
```bash
pnpm run test --filter data-service
```
All 179 tests pass.
