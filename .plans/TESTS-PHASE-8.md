# Phase 8: TechnicalAnalysisAgent Tests

## Goal
Test TechnicalAnalysisAgent (171 LOC) — identity parsing, scheduled analysis, indicator computation, signal detection, bar caching, and PostgreSQL writes. Design doc 005.

## Status: DONE

## Failure Triage Protocol

When a test fails, do NOT assume the test is wrong. Follow this order:

1. **Harness/mock bug** — Is the test setup incorrect? Wrong mock return value, missing table, wrong field name in the harness? Fix the test infrastructure.
2. **Implementation bug** — Does the agent code deviate from the design doc spec? Read the design doc and compare to the implementation. If the code is wrong, fix the code to match the spec and note the fix in the design doc.
3. **Design doc gap** — Is the spec ambiguous or missing a case? Ask the user, then update the spec.

**Design doc**: `docs/design-docs/done/005/` (005-1-spec.md through 005-6-ops.md)
**Agent source**: `src/agents/technical-analysis-agent.ts`

Always read the relevant design doc section before concluding a test is wrong. The tests are spec-driven — they verify documented behavior.

## Prerequisites
- Phase 7 completed (setup.ts updated)
- New mocks in setup.ts for market-data-bars, technicals, signal, ta-config

## Setup Changes

### 1. Add mocks to `test/setup.ts`

```ts
vi.mock('@repo/data-ops/market-data-bars', () => ({
	getBarsForSymbol: vi.fn().mockResolvedValue([]),
}));

vi.mock('@repo/data-ops/providers/technicals', () => ({
	computeTechnicals: vi.fn().mockReturnValue({
		price: 150.0,
		rsi: 55,
		macd: { macd: 1.2, signal: 0.8, histogram: 0.4 },
		bollingerBands: { upper: 160, middle: 150, lower: 140 },
		sma20: 148,
		sma50: 145,
		sma200: 140,
		atr: 3.5,
		volume: { current: 1000000, average: 800000, ratio: 1.25 },
	}),
	detectSignals: vi.fn().mockReturnValue([
		{ type: 'rsi_oversold', direction: 'bullish', strength: 0.7, description: 'RSI below 30' },
	]),
}));

vi.mock('@repo/data-ops/signal', () => ({
	insertSignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@repo/data-ops/ta-config', () => ({
	getTaConfig: vi.fn().mockResolvedValue({
		defaultBarsToFetch: 200,
		minBarsRequired: 50,
		rsiPeriod: 14,
		macdFast: 12,
		macdSlow: 26,
		macdSignal: 9,
		bollingerPeriod: 20,
		bollingerStdDev: 2,
	}),
}));
```

### 2. Add fixtures to `test/harness/fixtures.ts`

```ts
/** 60+ sample bars for TA tests */
export const sampleBars: Bar[] = Array.from({ length: 65 }, (_, i) => ({
	t: new Date(2024, 0, i + 1).toISOString(),
	o: 145 + Math.sin(i / 5) * 5,
	h: 148 + Math.sin(i / 5) * 5,
	l: 142 + Math.sin(i / 5) * 5,
	c: 146 + Math.sin(i / 5) * 5,
	v: 1000000 + i * 10000,
	n: 5000 + i * 100,
	vw: 146 + Math.sin(i / 5) * 5,
}));

export const sampleIndicators = {
	price: 150.0, rsi: 55,
	macd: { macd: 1.2, signal: 0.8, histogram: 0.4 },
	bollingerBands: { upper: 160, middle: 150, lower: 140 },
	sma20: 148, sma50: 145, sma200: 140, atr: 3.5,
	volume: { current: 1000000, average: 800000, ratio: 1.25 },
};

export const sampleSignals = [
	{ type: 'rsi_oversold', direction: 'bullish', strength: 0.7, description: 'RSI below 30' },
	{ type: 'macd_crossover', direction: 'bullish', strength: 0.6, description: 'MACD crossed signal' },
];
```

### 3. Create `test/harness/create-test-ta-agent.ts`

Factory function:
- `Object.create(TechnicalAnalysisAgent.prototype)`
- In-memory SQLite + `createSqlTag`
- Set `name = 'test-user-123:AAPL'` (userId:symbol format)
- Set `env` with `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- Wire `state`/`setState`/`initialState` with default TAAgentState
- Wire `scheduleEvery`, `getSchedules`, `cancelSchedule` (track schedules)
- Call `agent.onStart()` to create tables and parse identity
- Return `{ agent, db, schedules, stateHistory }`

### 4. Create test files

```
test/agents/
├── ta-analysis.test.ts       # Tests 64-73
└── ta-edge-cases.test.ts     # Tests 74-79
```

## Tests

### ta-analysis.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 64 | `onStart parses userId:symbol from name, creates tables` | `agent.state.symbol === 'AAPL'`, tables exist via PRAGMA |
| 65 | `onStart schedules analysis every 300s` | Schedule with callback 'runScheduledAnalysis', when: 300 |
| 66 | `analyze computes and stores indicators` | After analyze, `SELECT * FROM indicators` has row with JSON data |
| 67 | `analyze stores signals in detected_signals` | After analyze, `SELECT * FROM detected_signals` has rows matching mock signals |
| 68 | `analyze caches bars in bars table` | After analyze with sampleBars, `SELECT COUNT(*) FROM bars` equals bars.length |
| 69 | `analyze writes signals to PostgreSQL via insertSignal` | `insertSignal` called N times (once per signal) with correct params |
| 70 | `analyze updates state (lastComputeAt, signalCount)` | state.lastComputeAt is string, state.signalCount matches signals.length |
| 71 | `analyze returns AnalysisResult with all fields` | Result has { symbol, timeframe, indicators, signals, bars } |
| 72 | `analyze with configOverride skips getTaConfig` | Pass configOverride → `getTaConfig` NOT called |
| 73 | `analyze with pre-supplied bars skips fetch` | Pass bars param → `getBarsForSymbol` NOT called |

### ta-edge-cases.test.ts

| # | Test | What to verify |
|---|------|----------------|
| 74 | `analyze throws when bars < minBarsRequired (50)` | Pass 10 bars → throws with message containing count |
| 75 | `getSignals returns from detected_signals DESC, limit 20` | Insert 25 signals manually → returns 20 in DESC order |
| 76 | `getSignals with since filters by detected_at` | Insert signals at different timestamps → since filter works |
| 77 | `getIndicators returns parsed JSON` | Insert JSON indicator → getIndicators returns parsed object |
| 78 | `getIndicators returns null when empty` | No indicators → returns null |
| 79 | `scheduled analysis catches error, increments errorCount` | Make analyze throw → state.errorCount incremented |

## Mocking Strategy

- `vi.mock` at module level for `getBarsForSymbol`, `computeTechnicals`, `detectSignals`, `insertSignal`, `getTaConfig`
- Per-test: configure mock return values via `vi.mocked(fn).mockReturnValue(...)` or `mockResolvedValue(...)`
- Real SQLite for bars/indicators/detected_signals table verification
- `initDatabase` already mocked globally (no-op)

## Key Source References
- Agent: `src/agents/technical-analysis-agent.ts` (171 LOC)
- Types: `packages/data-ops/src/agents/ta/types.ts`

## Verification
```bash
pnpm run test --filter data-service -- test/agents/ta-analysis.test.ts test/agents/ta-edge-cases.test.ts
```
All 16 tests pass. Cumulative: 78.
