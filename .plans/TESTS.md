# SessionAgent TDD Test Plan — Master Reference

> **Implementation phases**: Split into self-contained docs to avoid context poisoning.
> Execute one phase per conversation.
>
> | Phase | File | Scope | Tests |
> |-------|------|-------|-------|
> | 1 | `TESTS-PHASE-1.md` | Infrastructure + Pure Helpers (Round 0) | 7 |
> | 2 | `TESTS-PHASE-2.md` | Test Harness + Session Lifecycle (Round 1) | 6 |
> | 3 | `TESTS-PHASE-3.md` | Risk Gates G1-G5 (Round 2) | 8 |
> | 4 | `TESTS-PHASE-4.md` | Execution Guards E1-E4 (Round 3) | 6 |
> | 5 | `TESTS-PHASE-5.md` | Proposals + Trade Execution (Rounds 4-5) | 12 |
> | 6 | `TESTS-PHASE-6.md` | Data + Outcomes + Reset (Rounds 6-8) | 12 |
> | **Total** | | | **51** |

## Context

The `data-service` has **zero test infrastructure** — no vitest, no test files, no test utilities. The SessionAgent (`apps/data-service/src/agents/session-agent.ts`, 1873 lines) is the most complex agent with risk gates, execution guards, proposal lifecycle, and outcome tracking. Setting up vitest and writing the first tests here establishes patterns for testing all other agents.

## Approach: Standard Vitest + better-sqlite3

Use plain `vitest` with `better-sqlite3` for in-memory SQLite, **not** `@cloudflare/vitest-pool-workers`. Rationale:
- The agent SDK + AIChatAgent + 12 DO namespace bindings make pool-workers setup high-risk
- The business logic (gates, guards, proposals, outcomes) is standard TypeScript + SQL
- `better-sqlite3` runs the exact same SQLite dialect as DO SQLite
- Mock only at system boundaries (external agents, PostgreSQL, Telegram)
- Fast test execution, no Workers runtime startup

## Infrastructure Setup

### 1. Install dependencies
```bash
pnpm add -D vitest better-sqlite3 @types/better-sqlite3 --filter data-service
```

### 2. Create `apps/data-service/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@repo/data-ops': path.resolve(__dirname, '../../packages/data-ops/src'),
    },
  },
})
```

### 3. Add scripts to `apps/data-service/package.json`
```json
"test": "vitest run",
"test:watch": "vitest"
```

### 4. Directory structure
```
apps/data-service/test/
├── setup.ts                           # Global vi.mock declarations
├── harness/
│   ├── create-test-agent.ts           # Agent shell factory
│   ├── sql-template.ts                # better-sqlite3 → sql template tag adapter
│   ├── mock-broker.ts                 # AlpacaBrokerAgent mock factory
│   └── mock-orchestrators.ts          # Debate/Pipeline mock factories
├── agents/
│   ├── session-lifecycle.test.ts      # Start/stop/config (Round 1)
│   ├── session-gates.test.ts          # Risk gates G1-G5 (Round 2)
│   ├── session-guards.test.ts         # Execution guards E1-E4 (Round 3)
│   ├── session-proposals.test.ts      # Proposal CRUD + lifecycle (Round 4)
│   ├── session-execution.test.ts      # Trade execution flow (Round 5)
│   ├── session-data.test.ts           # Data retrieval queries (Round 6)
│   ├── session-outcomes.test.ts       # Outcome tracking (Round 7)
│   └── session-reset.test.ts          # Reset flow (Round 8)
└── helpers/
    └── session-helpers.test.ts        # Pure helper functions (Round 0)
```

## Test Harness Design — Detailed Implementation

### `test/harness/sql-template.ts` — SQLite template tag adapter

Wraps `better-sqlite3` in-memory DB to match the DO `this.sql<T>` template tag API.

```ts
import Database from 'better-sqlite3';

export function createSqlTag(db: Database.Database) {
  return function sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ): T[] {
    // Build parameterized SQL: replace template slots with ? placeholders
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) query += '?';
    }
    query = query.trim();

    const isSelect = /^\s*(SELECT|PRAGMA)/i.test(query);
    const stmt = db.prepare(query);
    if (isSelect) {
      return stmt.all(...values) as T[];
    }
    stmt.run(...values);
    return [] as T[];
  };
}
```

### `test/harness/create-test-agent.ts` — Agent shell factory

Creates a SessionAgent instance with DO primitives replaced by in-memory equivalents.
Key: we use `Object.create(SessionAgent.prototype)` to get a bare instance, then assign
all the primitives the base class would normally provide.

```ts
import Database from 'better-sqlite3';
import { SessionAgent } from '@/agents/session-agent';
import { createSqlTag } from './sql-template';
import { createMockBroker } from './mock-broker';
import { createMockDebateOrchestrator, createMockPipelineOrchestrator } from './mock-orchestrators';

interface Schedule { id: string; callback: string; when: Date | number; type: 'once' | 'every' }

interface TestAgentOptions {
  brokerOverrides?: Record<string, unknown>;
  debateOverrides?: Record<string, unknown>;
  pipelineOverrides?: Record<string, unknown>;
  tradingConfig?: Record<string, unknown> | null;
}

export async function createTestAgent(options: TestAgentOptions = {}) {
  const db = new Database(':memory:');
  const sqlTag = createSqlTag(db);

  // Create agent via prototype to bypass constructor
  const agent = Object.create(SessionAgent.prototype) as SessionAgent;

  // --- Override DO primitives ---
  const schedules: Schedule[] = [];
  const stateHistory: unknown[] = [];

  Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
  Object.defineProperty(agent, 'name', { value: 'test-user-123', writable: true });

  // State management
  let currentState = { ...agent.initialState };
  Object.defineProperty(agent, 'state', {
    get: () => currentState,
    set: (v) => { currentState = v; },
  });
  (agent as any).setState = (newState: typeof currentState) => {
    currentState = newState;
    stateHistory.push({ ...newState });
  };

  // Scheduling (in-memory tracking)
  (agent as any).schedule = async (when: Date | number, callback: string) => {
    schedules.push({ id: crypto.randomUUID(), callback, when, type: 'once' });
  };
  (agent as any).scheduleEvery = async (sec: number, callback: string) => {
    schedules.push({ id: crypto.randomUUID(), callback, when: sec, type: 'every' });
  };
  (agent as any).getSchedules = () => [...schedules];
  (agent as any).cancelSchedule = async (id: string) => {
    const idx = schedules.findIndex(s => s.id === id);
    if (idx >= 0) schedules.splice(idx, 1);
  };

  // Chat persistence (no-op)
  (agent as any).saveMessages = async () => {};
  Object.defineProperty(agent, 'messages', { get: () => [], writable: true });

  // Broadcast (no-op, but tracked)
  const broadcasts: string[] = [];
  (agent as any).broadcast = (data: unknown) => { broadcasts.push(JSON.stringify(data)); };

  // --- Mock env ---
  const mockBroker = createMockBroker(options.brokerOverrides);
  const mockDebate = createMockDebateOrchestrator(options.debateOverrides);
  const mockPipeline = createMockPipelineOrchestrator(options.pipelineOverrides);

  Object.defineProperty(agent, 'env', {
    value: {
      DATABASE_HOST: 'test', DATABASE_USERNAME: 'test', DATABASE_PASSWORD: 'test',
      AlpacaBrokerAgent: Symbol('AlpacaBrokerAgent'),
      DebateOrchestratorAgent: Symbol('DebateOrchestratorAgent'),
      PipelineOrchestratorAgent: Symbol('PipelineOrchestratorAgent'),
      TechnicalAnalysisAgent: Symbol('TechnicalAnalysisAgent'),
      LLMAnalysisAgent: Symbol('LLMAnalysisAgent'),
    },
    writable: true,
  });

  // Initialize tables + seed defaults via onStart()
  await agent.onStart();

  return {
    agent,
    db,
    schedules,
    stateHistory,
    broadcasts,
    mocks: { broker: mockBroker, debate: mockDebate, pipeline: mockPipeline },
  };
}
```

### `test/harness/mock-broker.ts` — Broker mock factory

```ts
import { vi } from 'vitest';

export function createMockBroker(overrides?: Record<string, unknown>) {
  return {
    getAccount: vi.fn().mockResolvedValue({
      cash: 100_000, portfolioValue: 100_000, buyingPower: 200_000,
    }),
    getPositions: vi.fn().mockResolvedValue([]),
    getClock: vi.fn().mockResolvedValue({ isOpen: true }),
    getPortfolioHistory: vi.fn().mockResolvedValue({ profitLossPct: [0] }),
    placeOrder: vi.fn().mockResolvedValue({
      id: 'order-001', filledQty: 10, filledAvgPrice: 150.00,
    }),
    getOrderHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}
```

### `test/harness/mock-orchestrators.ts` — Debate/Pipeline mock factories

```ts
import { vi } from 'vitest';

export function createMockDebateOrchestrator(overrides?: Record<string, unknown>) {
  return {
    runDebate: vi.fn().mockResolvedValue({
      consensus: { action: 'buy', confidence: 0.85, rationale: 'test', positionSizePct: 5,
        entryPrice: 150, targetPrice: 165, stopLoss: 142, risks: [] },
      session: { id: 'debate-session-001', status: 'completed' },
    }),
    recordPersonaOutcome: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockPipelineOrchestrator(overrides?: Record<string, unknown>) {
  return {
    runPipeline: vi.fn().mockResolvedValue({
      proposal: null,
      session: { id: 'pipeline-session-001', status: 'completed' },
    }),
    recordStepOutcome: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
```

### `test/setup.ts` — Global module mocks

```ts
import { vi } from 'vitest';

// --- Mock 'agents' SDK ---
// Route getAgentByName to return the appropriate mock based on the namespace symbol
let mockRegistry: Map<symbol, unknown> = new Map();
export function registerMockAgent(namespace: symbol, mock: unknown) {
  mockRegistry.set(namespace, mock);
}
export function clearMockRegistry() { mockRegistry = new Map(); }

vi.mock('agents', () => ({
  callable: () => (_target: unknown, _ctx: unknown) => {},  // no-op TC39 decorator
  getAgentByName: vi.fn().mockImplementation(async (namespace: symbol) => {
    return mockRegistry.get(namespace) ?? {};
  }),
}));

// --- Mock data-ops modules ---
vi.mock('@repo/data-ops/database/setup', () => ({
  initDatabase: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('@repo/data-ops/trading-config', () => ({
  getTradingConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('@repo/data-ops/debate-persona', () => ({
  getDebatePersonas: vi.fn().mockResolvedValue([]),
  seedDefaultPersonas: vi.fn().mockResolvedValue([]),
}));

vi.mock('@repo/data-ops/agents/enrichment/queries', () => ({
  getEnrichmentForSymbol: vi.fn().mockResolvedValue({
    fundamentals: undefined, marketIntelligence: undefined, earnings: undefined,
  }),
}));

vi.mock('@repo/data-ops/credential', () => ({
  getCredential: vi.fn().mockResolvedValue({ apiKey: 'test', apiSecret: 'test' }),
}));

vi.mock('@repo/data-ops/providers/llm', () => ({
  createLanguageModel: vi.fn().mockReturnValue({}),
}));

vi.mock('@repo/data-ops/telegram', () => ({
  dispatchNotification: vi.fn().mockResolvedValue({ sent: false }),
  buildProposalMessage: vi.fn().mockReturnValue({ text: '', keyboard: [] }),
  buildProposalUpdatedMessage: vi.fn().mockReturnValue(''),
  buildRiskAlertMessage: vi.fn().mockReturnValue(''),
  buildTradeExecutedMessage: vi.fn().mockReturnValue(''),
  buildTradeFailedMessage: vi.fn().mockReturnValue(''),
}));

// --- Mock AIChatAgent base class ---
vi.mock('@cloudflare/ai-chat', () => ({
  AIChatAgent: class MockAIChatAgent {
    maxPersistedMessages = 500;
    initialState = {};
  },
}));
```

### `test/setup.ts` — Usage in tests

Each test file imports the registration helpers and wires mocks in `beforeEach`:

```ts
import { registerMockAgent, clearMockRegistry } from '../setup';
import { createTestAgent } from '../harness/create-test-agent';

let agent, mocks;

beforeEach(async () => {
  clearMockRegistry();
  const result = await createTestAgent();
  agent = result.agent;
  mocks = result.mocks;
  // Register mock agents by env namespace symbol
  registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker);
  registerMockAgent(agent.env.DebateOrchestratorAgent, mocks.debate);
  registerMockAgent(agent.env.PipelineOrchestratorAgent, mocks.pipeline);
  // TechnicalAnalysisAgent mock
  registerMockAgent(agent.env.TechnicalAnalysisAgent, {
    analyze: vi.fn().mockResolvedValue({ signals: [], indicators: {} }),
  });
});
```

## Test Rounds (TDD Vertical Slices)

### Round 0: Pure Helpers (tracer bullet for vitest itself)

**File**: `test/helpers/session-helpers.test.ts`
No agent shell needed — pure function imports only.

| # | Test | Verifies |
|---|------|----------|
| 1 | `rowToConfig converts SQL row to SessionConfig` | JSON parsing, field mapping, dataFeeds default |
| 2 | `rowToProposal converts SQL row to TradeProposal` | All field mappings, null handling, JSON arrays |
| 3 | `rowToThread hydrates thread with messages and proposal` | Composition of sub-objects |
| 4 | `rowToMessage parses sender and metadata JSON` | JSON parsing for sender, metadata |
| 5 | `rowToOutcome/rowToSnapshot map correctly` | Field mapping, type casting |
| 6 | `normalizePositionSizePct converts fractions to whole numbers` | 0.05→5, 5→5, 0→0 |
| 7 | `summarizeEnrichment builds readable summary` | Section assembly, edge cases |

Example test:
```ts
import { describe, expect, test } from 'vitest';
import { normalizePositionSizePct, rowToConfig } from '@/agents/session-agent-helpers';

describe('normalizePositionSizePct', () => {
  test('converts fractions to whole numbers', () => {
    expect(normalizePositionSizePct(0.05)).toBe(5);
    expect(normalizePositionSizePct(0.1)).toBe(10);
  });
  test('leaves whole numbers unchanged', () => {
    expect(normalizePositionSizePct(5)).toBe(5);
    expect(normalizePositionSizePct(10)).toBe(10);
  });
  test('handles zero', () => {
    expect(normalizePositionSizePct(0)).toBe(0);
  });
});

describe('rowToConfig', () => {
  test('converts SQL row to SessionConfig with JSON parsing', () => {
    const row = {
      orchestration_mode: 'debate', broker_type: 'AlpacaBrokerAgent',
      llm_provider: 'workers-ai', llm_model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      watchlist_symbols: '["AAPL","TSLA"]', analysis_interval_sec: 120,
      min_confidence_threshold: 0.7, position_size_pct: 0.05,
      active_strategy_id: 'moderate', debate_rounds: 2,
      proposal_timeout_sec: 900, data_feeds: null,
    };
    const config = rowToConfig(row);
    expect(config.watchlistSymbols).toEqual(['AAPL', 'TSLA']);
    expect(config.orchestrationMode).toBe('debate');
    expect(config.dataFeeds.technicalAnalysis).toBe(true); // default
  });
});
```

### Round 1: Session Lifecycle (tracer bullet for agent shell)

**File**: `test/agents/session-lifecycle.test.ts`
This round proves the full harness works end-to-end.

| # | Test | Verifies |
|---|------|----------|
| 8 | `getConfig returns default config after init` | SQL tables created, seed data, callable works |
| 9 | `start enables session and sets lastCycleAt` | State transition, schedule created |
| 10 | `stop disables session` | State transition, schedules cancelled |
| 11 | `getStatus returns state with pendingProposalCount` | SQL count query, state assembly |
| 12 | `updateConfig persists changes and preserves unchanged fields` | Partial update, reload verification |
| 13 | `updateConfig reschedules when interval changes and session enabled` | Schedule array inspection |

Example test (tracer bullet #8):
```ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { registerMockAgent, clearMockRegistry } from '../setup';
import { createTestAgent } from '../harness/create-test-agent';
import { DEFAULT_SESSION_CONFIG } from '@repo/data-ops/agents/session/defaults';

describe('SessionAgent lifecycle', () => {
  let agent: Awaited<ReturnType<typeof createTestAgent>>['agent'];
  let schedules: Awaited<ReturnType<typeof createTestAgent>>['schedules'];

  beforeEach(async () => {
    clearMockRegistry();
    const result = await createTestAgent();
    agent = result.agent;
    schedules = result.schedules;
    registerMockAgent(agent.env.AlpacaBrokerAgent, result.mocks.broker);
  });

  test('getConfig returns default config after init', () => {
    const config = agent.getConfig();
    expect(config.orchestrationMode).toBe(DEFAULT_SESSION_CONFIG.orchestrationMode);
    expect(config.watchlistSymbols).toEqual([]);
    expect(config.analysisIntervalSec).toBe(120);
  });

  test('start enables session and sets lastCycleAt', async () => {
    const state = await agent.start();
    expect(state.enabled).toBe(true);
    expect(state.lastCycleAt).toBeTypeOf('number');
    // Verify analysis cycle was scheduled
    expect(schedules.some(s => s.callback === 'runScheduledCycle')).toBe(true);
    expect(schedules.some(s => s.callback === 'runOutcomeTrackingCycle')).toBe(true);
  });

  test('stop disables session and cancels all schedules', async () => {
    await agent.start();
    const state = await agent.stop();
    expect(state.enabled).toBe(false);
    expect(schedules).toHaveLength(0);
  });
});
```

### Round 2: Risk Gates

**File**: `test/agents/session-gates.test.ts`

Gates are tested through `triggerAnalysis()` — the public @callable that runs the full gate chain.
Each test configures mocks + tradingConfig to trigger/bypass a specific gate, then asserts on `skipReason`.

| # | Test | Verifies |
|---|------|----------|
| 14 | `G1: skips when market closed + tradingHoursOnly` | Clock mock → skipReason |
| 15 | `G1: proceeds when market closed but tradingHoursOnly disabled` | No skip for hours |
| 16 | `G4: skips when daily loss exceeds maxDailyLossPct` | Portfolio history mock |
| 17 | `G4: proceeds when loss within limit` | No skip |
| 18 | `G5: skips during cooldown after loss` | Fake timers, resolved outcome with recent loss |
| 19 | `G5: proceeds when cooldown expired` | Time past window |
| 20 | `G2: filters blacklisted symbols` | Only non-blacklisted analyzed |
| 21 | `G3: filters symbols not in allowlist` | Only allowlisted analyzed |

Key setup: Gates require `loadEffectiveConfig()` which merges TradingConfig (from PG) + SessionConfig (from SQLite) + Strategy. Mock `getTradingConfig` to return specific risk limits:

```ts
import { getTradingConfig } from '@repo/data-ops/trading-config';

// Before each gate test, configure the tradingConfig mock:
vi.mocked(getTradingConfig).mockResolvedValue({
  tradingHoursOnly: true,       // G1
  maxDailyLossPct: 0.02,        // G4
  cooldownMinutesAfterLoss: 30, // G5
  tickerBlacklist: ['TSLA'],    // G2
  tickerAllowlist: null,        // G3 (null = no filter)
  // ... other fields with defaults
});
```

Example test (G1):
```ts
test('G1: skips when market closed and tradingHoursOnly enabled', async () => {
  // Configure broker to report market closed
  mocks.broker.getClock.mockResolvedValue({ isOpen: false });
  vi.mocked(getTradingConfig).mockResolvedValue({
    ...defaultTradingConfig,
    tradingHoursOnly: true,
  });

  // Set watchlist so we'd normally proceed
  await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

  const result = await agent.triggerAnalysis();
  expect(result.skipReason).toContain('Market is closed');
  expect(result.threadIds).toHaveLength(0);
});
```

Example test (G5 — uses fake timers):
```ts
test('G5: skips during cooldown after loss', async () => {
  vi.useFakeTimers();
  const now = Date.now();

  // Insert a recently resolved losing outcome
  agent.sql`INSERT INTO proposal_outcomes
    (id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
     symbol, action, entry_price, entry_qty, status, realized_pnl, resolved_at, created_at)
    VALUES ('o1', 'p1', 't1', 'debate', 's1', 'AAPL', 'buy', 150, 10, 'resolved',
            -50.00, ${now - 5 * 60_000}, ${now - 60 * 60_000})`;

  vi.mocked(getTradingConfig).mockResolvedValue({
    ...defaultTradingConfig,
    cooldownMinutesAfterLoss: 30,
  });
  mocks.broker.getClock.mockResolvedValue({ isOpen: true });
  await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

  const result = await agent.triggerAnalysis();
  expect(result.skipReason).toContain('Cooldown active');

  vi.useRealTimers();
});
```

### Round 3: Execution Guards

**File**: `test/agents/session-guards.test.ts`

Guards are tested through `approveProposal()`. Each test:
1. Inserts a pending proposal into SQLite directly
2. Configures tradingConfig with specific limits
3. Calls `approveProposal(proposalId)`
4. Asserts on the returned `{ status, message }`

| # | Test | Verifies |
|---|------|----------|
| 22 | `E1: rejects when notional > maxNotionalPerTrade` | Guard prevents execution |
| 23 | `E2: rejects when notional > maxPositionValue` | Guard prevents execution |
| 24 | `E3: rejects buy when max positions reached` | Position count check |
| 25 | `E3: allows sell even at max positions` | Sell bypass |
| 26 | `E4: rejects sell without position when short selling disabled` | No position + no short |
| 27 | `E4: allows sell without position when short selling enabled` | Proceeds to order |

Helper to insert test proposals:
```ts
function insertPendingProposal(agent: SessionAgent, overrides: Partial<TradeProposal> = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const threadId = overrides.threadId ?? crypto.randomUUID();
  const now = Date.now();

  // Insert the thread first (FK reference)
  agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
    VALUES (${threadId}, 'debate', ${overrides.symbol ?? 'AAPL'}, 'completed', ${now})`;

  agent.sql`INSERT INTO trade_proposals
    (id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
     qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
     outcome_status)
    VALUES (${id}, ${threadId}, ${overrides.symbol ?? 'AAPL'}, ${overrides.action ?? 'buy'},
     0.85, 'test rationale', 150, 165, 142,
     ${overrides.qty ?? null}, ${overrides.notional ?? 5000}, ${overrides.positionSizePct ?? 5},
     '[]', '[]', ${overrides.expiresAt ?? now + 900_000}, 'pending', ${now}, 'none')`;

  // Link thread to proposal
  agent.sql`UPDATE discussion_threads SET proposal_id = ${id} WHERE id = ${threadId}`;
  return id;
}
```

Example test (E4):
```ts
test('E4: rejects sell without position when short selling disabled', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue({
    ...defaultTradingConfig,
    allowShortSelling: false,
  });
  mocks.broker.getPositions.mockResolvedValue([]); // no positions

  const proposalId = insertPendingProposal(agent, { action: 'sell', symbol: 'AAPL' });
  const result = await agent.approveProposal(proposalId);

  expect(result.status).toBe('error');
  expect(result.message).toContain('Short selling is disabled');
});
```

### Round 4: Proposal Lifecycle

**File**: `test/agents/session-proposals.test.ts`

Uses `insertPendingProposal` helper (from Round 3) to set up proposals, then tests through @callable methods.

| # | Test | Verifies |
|---|------|----------|
| 28 | `getProposals returns proposals ordered by creation` | SQL ordering |
| 29 | `getProposals filters by status` | Status param |
| 30 | `approveProposal transitions pending → executed` | Status change + broker `placeOrder` called |
| 31 | `rejectProposal transitions pending → rejected` | Status + decidedAt set |
| 32 | `approveProposal errors for non-pending proposal` | Returns `{ status: 'error' }` |
| 33 | `approveProposal auto-expires past deadline` | Expired proposal detected during approve |
| 34 | `retryProposal re-executes failed proposal` | Failed → executed transition |
| 35 | `expired proposals batch-expire during cycle` | `runScheduledCycle` expires old proposals |

Example test (proposal approve → executed):
```ts
test('approveProposal transitions pending to executed', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue(permissiveTradingConfig);
  const proposalId = insertPendingProposal(agent, { notional: 1000 });

  const result = await agent.approveProposal(proposalId);
  expect(result.status).toBe('executed');

  // Verify broker was called
  expect(mocks.broker.placeOrder).toHaveBeenCalledWith(
    expect.objectContaining({ symbol: 'AAPL', side: 'buy' })
  );

  // Verify proposal updated (read back through public interface)
  const proposals = agent.getProposals('executed');
  expect(proposals).toHaveLength(1);
  expect(proposals[0].orderId).toBe('order-001');
});
```

### Round 5: Trade Execution

**File**: `test/agents/session-execution.test.ts`

Deeper tests on the execution path — order result storage, outcome creation, failure handling.

| # | Test | Verifies |
|---|------|----------|
| 36 | `execution stores order details on proposal` | `orderId`, `filledQty`, `filledAvgPrice` via `getProposals` |
| 37 | `execution creates outcome tracking record` | `getOutcomes('tracking')` returns entry |
| 38 | `failed execution sets proposal status to failed` | Broker throws → status='failed' |
| 39 | `notional computed from positionSizePct when no qty` | `cash * pct / 100` calculation |

Example test (failed execution):
```ts
test('failed execution sets proposal status to failed', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue(permissiveTradingConfig);
  mocks.broker.placeOrder.mockRejectedValue(new Error('Insufficient funds'));

  const proposalId = insertPendingProposal(agent);
  const result = await agent.approveProposal(proposalId);

  expect(result.status).toBe('failed');
  expect(result.message).toContain('Insufficient funds');

  const proposals = agent.getProposals('failed');
  expect(proposals).toHaveLength(1);
});
```

### Round 6: Data Retrieval

**File**: `test/agents/session-data.test.ts`

Tests the read-only @callable methods. Insert data directly via SQL, read back through public API.

| # | Test | Verifies |
|---|------|----------|
| 40 | `getThreads returns hydrated threads with messages` | Messages joined, ordered DESC |
| 41 | `getThread returns null for nonexistent` | Returns `null`, not error |
| 42 | `getOutcomes filters by status` | `'tracking'` vs `'resolved'` |
| 43 | `getOutcomeSnapshots returns ordered snapshots` | Ordered by `snapshot_at DESC` |

### Round 7: Outcome Tracking

**File**: `test/agents/session-outcomes.test.ts`

Tests `runOutcomeTrackingCycle()` (public method called by scheduler). Requires:
- Inserting an executed proposal + tracking outcome in SQLite
- Mocking broker positions/prices
- Verifying snapshot inserts and outcome resolution through `getOutcomes`/`getOutcomeSnapshots`

| # | Test | Verifies |
|---|------|----------|
| 44 | `tracking cycle records snapshots for open positions` | New snapshot row via `getOutcomeSnapshots` |
| 45 | `tracking cycle resolves when position no longer held` | Outcome status → 'resolved', PnL calculated |
| 46 | `stop-loss detected on long position` | Price < stopLoss → exit reason 'stop_loss' |
| 47 | `target-hit detected on long position` | Price > targetPrice → exit reason 'target_hit' |
| 48 | `exit trigger creates auto-exit proposal` | New 'sell' proposal in `getProposals('pending')` |

Helper for outcome tracking setup:
```ts
function insertExecutedProposalWithOutcome(agent: SessionAgent, overrides: {
  symbol?: string; action?: string; entryPrice?: number; targetPrice?: number; stopLoss?: number;
} = {}) {
  const proposalId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const outcomeId = crypto.randomUUID();
  const now = Date.now();
  const symbol = overrides.symbol ?? 'AAPL';

  agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
    VALUES (${threadId}, 'debate', ${symbol}, 'completed', ${now})`;

  agent.sql`INSERT INTO trade_proposals
    (id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
     qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
     outcome_status, order_id, filled_qty, filled_avg_price, orchestrator_session_id)
    VALUES (${proposalId}, ${threadId}, ${symbol}, ${overrides.action ?? 'buy'},
     0.85, 'test', ${overrides.entryPrice ?? 150}, ${overrides.targetPrice ?? 165},
     ${overrides.stopLoss ?? 142}, 10, 1500, 5, '[]', '[]', ${now + 900_000},
     'executed', ${now}, 'tracking', 'order-001', 10, 150, 'orch-001')`;

  agent.sql`INSERT INTO proposal_outcomes
    (id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
     symbol, action, entry_price, entry_qty, status, created_at)
    VALUES (${outcomeId}, ${proposalId}, ${threadId}, 'debate', 'orch-001',
     ${symbol}, ${overrides.action ?? 'buy'}, ${overrides.entryPrice ?? 150}, 10,
     'tracking', ${now})`;

  return { proposalId, threadId, outcomeId };
}
```

### Round 8: Reset

**File**: `test/agents/session-reset.test.ts`

| # | Test | Verifies |
|---|------|----------|
| 49 | `resetData clears all data and returns counts` | Deletion + counts match |
| 50 | `resetData fails when session enabled` | Returns `{ status: 'error' }` |
| 51 | `resetData reseeds strategies after clearing` | `strategy_templates` has 3 rows |

Example test:
```ts
test('resetData fails when session enabled', async () => {
  await agent.start();
  const result = await agent.resetData();
  expect(result.status).toBe('error');
  expect(result.message).toContain('must be stopped');
});
```

## Key Files

| File | Role |
|---|---|
| `apps/data-service/src/agents/session-agent.ts` | Agent under test (1873 lines) |
| `apps/data-service/src/agents/session-agent-helpers.ts` | Pure helper functions (359 lines) |
| `packages/data-ops/src/agents/session/types.ts` | Type definitions |
| `packages/data-ops/src/agents/session/defaults.ts` | DEFAULT_SESSION_CONFIG, DEFAULT_PERSONAS |
| `packages/data-ops/src/agents/session/resolve-config.ts` | resolveEffectiveConfig() |
| `packages/data-ops/src/agents/broker/types.ts` | Broker types for mock factories |

## Test Fixtures

Shared config objects used across test files. Place in `test/harness/fixtures.ts`:

```ts
/** TradingConfig that blocks nothing — use for proposal lifecycle / execution tests */
export const permissiveTradingConfig = {
  tradingHoursOnly: false,
  maxDailyLossPct: 1.0,           // 100% — never triggers
  cooldownMinutesAfterLoss: 0,
  tickerBlacklist: [],
  tickerAllowlist: null,           // null = no filter
  allowShortSelling: true,
  maxPositions: 100,
  maxNotionalPerTrade: 1_000_000,
  maxPositionValue: 1_000_000,
  takeProfitPct: 0.1,
  stopLossPct: 0.05,
  // Extended settings
  proposalTimeoutSec: 900,
  llmTemperature: 0.7,
  llmMaxTokens: 2048,
  scoreWindows: [5, 20],
  confidenceDisplayHigh: 0.8,
  confidenceDisplayMed: 0.5,
};

/** TradingConfig with strict risk limits — use for gate/guard tests */
export const strictTradingConfig = {
  ...permissiveTradingConfig,
  tradingHoursOnly: true,
  maxDailyLossPct: 0.02,
  cooldownMinutesAfterLoss: 30,
  allowShortSelling: false,
  maxPositions: 3,
  maxNotionalPerTrade: 5_000,
  maxPositionValue: 10_000,
};
```

## Key Considerations

- **Fake timers**: Use `vi.useFakeTimers()` for G5 cooldown, proposal expiration, cycle timestamps. Always `vi.useRealTimers()` in `afterEach`.
- **TC39 decorators**: The `@callable()` decorator uses Stage 3 syntax — mocked as no-op in `test/setup.ts`. If vitest struggles to parse decorators, add `esbuild: { target: 'es2022' }` to `vitest.config.ts`.
- **Test isolation**: Each test gets fresh in-memory SQLite via `beforeEach` → `createTestAgent()`. No state leaks.
- **Skip `onChatMessage`**: AI chat interface requires LLM mock — out of scope, test business logic only.
- **Notification verification**: Assert `dispatchNotification` was called (not content shape). Content is responsibility of `build*Message` pure functions in data-ops.
- **Module alias resolution**: `@repo/data-ops/*` paths must resolve in vitest. The `resolve.alias` in vitest config maps these to `../../packages/data-ops/src/*`. May also need `@repo/data-ops/agents/*` mapped explicitly if barrel exports differ from source paths.
- **`AIChatAgent` base class mock**: Since `SessionAgent extends AIChatAgent`, we mock the entire `@cloudflare/ai-chat` module to provide a minimal base class. The mock class provides no behavior — all DO primitives are injected by the harness.
- **`getAgentByName` routing**: Uses `Symbol` values as namespace keys. Each test's `beforeEach` registers mock agents via `registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker)`. The `getAgentByName` mock resolves the symbol to return the right mock.

## Verification

1. `pnpm run test --filter data-service` — all tests pass
2. Round 0 tests pass with zero infrastructure (pure functions)
3. Round 1 test 8 ("getConfig returns defaults") proves the full harness works
4. Coverage of all risk gates (G1-G5) and execution guards (E1-E4)
5. `pnpm run lint` — tests pass Biome linting
