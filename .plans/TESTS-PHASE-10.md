# Phase 10: DebateOrchestratorAgent Tests

## Goal
Test DebateOrchestratorAgent (759 LOC) — debate orchestration (3-phase process), persona outcome recording, score computation, pattern detection, and confidence dampening. Design doc 020.

## Status: DONE

## Failure Triage Protocol

When a test fails, do NOT assume the test is wrong. Follow this order:

1. **Harness/mock bug** — Is the test setup incorrect? Wrong mock return value, missing table, wrong field name in the harness? Fix the test infrastructure.
2. **Implementation bug** — Does the agent code deviate from the design doc spec? Read the design doc and compare to the implementation. If the code is wrong, fix the code to match the spec and note the fix in the design doc.
3. **Design doc gap** — Is the spec ambiguous or missing a case? Ask the user, then update the spec.

**Design doc**: `docs/design-docs/done/020/` (020-1-spec.md through 020-7-memory.md) — Multi-persona debate, orchestration, scoring, and confidence dampening

**Agent source**: `src/agents/debate-orchestrator-agent.ts`

Always read the relevant design doc section before concluding a test is wrong. The tests are spec-driven — they verify documented behavior.

## Prerequisites
- Phase 7-9 completed (all mocks in place)
- LLMAnalysisAgent mock via registerMockAgent (not module-level)

## Setup Changes

### 1. Add fixtures to `test/harness/fixtures.ts`

```ts
export const samplePersonaConfigs: PersonaConfig[] = [
	{
		id: 'aggressive', name: 'Aggressive Trader',
		systemPrompt: 'You are an aggressive momentum trader.',
		traits: ['momentum', 'high-risk'], riskTolerance: 'high',
	},
	{
		id: 'conservative', name: 'Conservative Analyst',
		systemPrompt: 'You are a conservative value investor.',
		traits: ['value', 'low-risk'], riskTolerance: 'low',
	},
	{
		id: 'technical', name: 'Technical Analyst',
		systemPrompt: 'You focus on chart patterns and indicators.',
		traits: ['technical', 'patterns'], riskTolerance: 'medium',
	},
];

export const sampleDebateConfig: DebateConfig = {
	personas: samplePersonaConfigs,
	rounds: 2,
	moderatorPrompt: 'You are a neutral moderator synthesizing diverse views.',
};
```

### 2. Create `test/harness/mock-llm-agent.ts`

Mock LLMAnalysisAgent used by DebateOrchestrator and PipelineOrchestrator:

```ts
export function createMockLLMAgent(overrides?: Record<string, unknown>) {
	return {
		analyzeAsPersona: vi.fn().mockImplementation(async (persona: PersonaConfig) => ({
			personaId: persona.id,
			action: 'buy',
			confidence: 0.8,
			rationale: `${persona.name} analysis`,
			keyPoints: ['point 1', 'point 2'],
		})),
		runDebateRound: vi.fn().mockImplementation(
			async (_session: unknown, roundNumber: number, personas: PersonaConfig[]) => ({
				roundNumber,
				responses: personas.map((p) => ({
					personaId: p.id,
					respondingTo: personas.filter((o) => o.id !== p.id).map((o) => o.id),
					content: `${p.name} debate response`,
					revisedConfidence: 0.75,
					revisedAction: 'buy',
				})),
			}),
		),
		synthesizeConsensus: vi.fn().mockResolvedValue({
			action: 'buy', confidence: 0.85, rationale: 'Consensus rationale',
			dissent: null, entryPrice: 150, targetPrice: 165, stopLoss: 142,
			positionSizePct: 5, risks: [],
		}),
		validateRisk: vi.fn().mockResolvedValue({
			approved: true, adjustedPositionSize: null,
			warnings: [], rationale: 'Risk approved',
		}),
		analyze: vi.fn().mockResolvedValue({
			id: 'analysis-001', userId: 'test-user-123', symbol: 'AAPL',
			timestamp: new Date().toISOString(),
			recommendation: {
				action: 'buy', confidence: 0.8, rationale: 'test',
				entry_price: 150, target_price: 165, stop_loss: 142,
				position_size_pct: 5, timeframe: 'swing', risks: [],
			},
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.005 },
			model: 'gpt-4o', provider: 'openai',
		}),
		...overrides,
	};
}
```

### 3. Create `test/harness/create-test-debate-agent.ts`

Factory function:
- `Object.create(DebateOrchestratorAgent.prototype)`
- In-memory SQLite + `createSqlTag`
- Set `name = 'test-user-123:AAPL'` (userId:symbol)
- Set `env` with `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `LLMAnalysisAgent: Symbol('LLMAnalysisAgent')`
- Wire `state`/`setState`/`initialState` with default DebateOrchestratorState
- Call `agent.onStart()` to create all debate tables (7+ tables)
- Register mock LLM agent via `registerMockAgent(agent.env.LLMAnalysisAgent, createMockLLMAgent())`
- Return `{ agent, db, stateHistory, mockLLM }`

### 4. Create test files

```
test/agents/
├── debate-orchestration.test.ts  # Tests 106-120
├── debate-outcomes.test.ts       # Tests 121-127
└── debate-scoring.test.ts        # Tests 128-134
```

## Tests

### debate-orchestration.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 106 | `onStart creates debate tables` | PRAGMA table_info for debate_sessions, persona_analyses, debate_rounds, debate_responses, consensus_results, persona_outcomes, persona_scores, persona_patterns |
| 107 | `runDebate creates session with status 'analyzing'` | After runDebate, `SELECT * FROM debate_sessions WHERE id = sessionId` has status transitioning through analyzing→debating→synthesizing→completed |
| 108 | `Phase 1: calls analyzeAsPersona per persona` | `mockLLM.analyzeAsPersona` called 3 times (one per persona) |
| 109 | `Phase 1: stores analyses in persona_analyses` | `SELECT * FROM persona_analyses WHERE session_id = ?` has 3 rows |
| 110 | `Phase 1: emits messages via onMessage` | onMessage callback called with persona analysis messages |
| 111 | `Phase 2: runs N debate rounds` | `mockLLM.runDebateRound` called `config.rounds` (2) times |
| 112 | `Phase 2: stores rounds + responses` | debate_rounds has 2 rows, debate_responses has 2*3=6 rows |
| 113 | `Phase 3: calls synthesizeConsensus` | `mockLLM.synthesizeConsensus` called once |
| 114 | `Phase 3: stores consensus result` | `SELECT * FROM consensus_results WHERE session_id = ?` has row |
| 115 | `runDebate returns completed session + consensus` | Result has { session: { id, status: 'completed' }, consensus: { action, confidence } } |
| 116 | `runDebate updates state (totalDebates, activeDebateId)` | state.totalDebates incremented, state.activeDebateId back to null |
| 117 | `runDebate on error: session 'failed', errorCount++` | Mock analyzeAsPersona rejecting → session status 'failed', state.errorCount incremented |
| 118 | `runDebate re-throws original error` | The thrown error is the same error from the mock |
| 119 | `runDebate applies confidence dampening` | Insert persona_scores with known calibration → verify analyses passed to synthesizeConsensus have dampened confidence |
| 120 | `runDebate builds persona comparison table` | Verify synthesizeConsensus receives personaComparison array with correct fields |

### debate-outcomes.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 121 | `recordPersonaOutcome inserts for all personas` | After recording, persona_outcomes has N rows (one per persona analysis in the session) |
| 122 | `evaluateCorrectness: buy correct when pnl > 0` | Record outcome with action 'buy', pnl > 0 → was_correct = 1 |
| 123 | `evaluateCorrectness: hold correct when abs(pnl) < threshold` | Record outcome with hold, pnl 0.005 → was_correct = 1 (threshold 0.01) |
| 124 | `recordPersonaOutcome triggers recomputeScores` | After recording, persona_scores table has rows for each window (30, 90, 180) |
| 125 | `getPersonaScores returns for windowDays` | Insert persona_scores rows → getPersonaScores(30) returns mapped results |
| 126 | `getPersonaPatterns filters by personaId` | Insert patterns for 2 personas → getPersonaPatterns('aggressive') returns only that persona's patterns |
| 127 | `getPersonaPatterns with symbol filter` | Insert patterns → getPersonaPatterns('aggressive', 'AAPL') returns symbol-filtered results |

### debate-scoring.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 128 | `recomputeScores: winRate, avgPnl, stddev, sharpe` | Insert 10 outcomes → verify computed values match manual calculation |
| 129 | `recomputeScores: calibration with >= 5 outcomes` | Insert 5+ outcomes with varying confidence/correctness → calibration is not null |
| 130 | `recomputeScores: deletes when no outcomes` | Insert then delete all outcomes → persona_scores row removed |
| 131 | `updatePatterns: symbol patterns with >= 5 samples` | Insert 5+ outcomes for same symbol → persona_patterns has symbol pattern row |
| 132 | `updatePatterns: action patterns with >= 5 samples` | Insert 5+ outcomes with same action → persona_patterns has action pattern row |
| 133 | `applyConfidenceDampening: 1.0/0.8/0.5 by calibration` | Test the dampening function: good (calibration >= 0.5) → 1.0x, fair (0.2-0.5) → 0.8x, poor (< 0.2) → 0.5x |
| 134 | `getUserId extracts from name` | Agent name 'test-user-123:AAPL' → getUserId returns 'test-user-123' |

**Note on tests 128-134**: Some of these test private methods. The approach is to test through the public API:
- recomputeScores/updatePatterns: triggered via `recordPersonaOutcome` → verify via SQLite queries
- applyConfidenceDampening: verify via `runDebate` with pre-inserted persona_scores
- getUserId: verify indirectly via `runDebate` which calls `getLLMAgent` with userId

For tests 133-134, if testing indirectly is too complex, consider testing through:
- 133: Pre-insert scores with known calibration, run debate, check dampened values passed to synthesizeConsensus
- 134: Verify that `getAgentByName` is called with correct userId extracted from agent name

## Mocking Strategy

- LLMAnalysisAgent mocked via `registerMockAgent` (from setup.ts pattern)
- `createMockLLMAgent()` provides all callable methods as vi.fn()
- `onMessage` callback is `vi.fn()` in RunDebateParams
- Real SQLite for all debate tables
- Pre-insert persona_outcomes for scoring tests

## Key Source References
- Agent: `src/agents/debate-orchestrator-agent.ts` (759 LOC)
- Types: `packages/data-ops/src/agents/debate/types.ts`, `packages/data-ops/src/agents/memory/types.ts`
- RunDebateParams interface at lines 30-41

## Verification
```bash
pnpm run test --filter data-service -- test/agents/debate-orchestration.test.ts test/agents/debate-outcomes.test.ts test/agents/debate-scoring.test.ts
```
All 29 tests pass. Cumulative: 120.
