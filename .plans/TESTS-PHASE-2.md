# Phase 2: Test Harness + Session Lifecycle

## Goal
Build the full test harness (mock agent shell, SQL adapter, mock factories) and write Round 1 lifecycle tests. This is the tracer bullet that proves we can instantiate a SessionAgent in tests and call its methods.

## Status: NOT STARTED

## Prerequisites
- Phase 1 complete (vitest installed, config working, pure helper tests pass)

## Steps

### 1. Create `test/setup.ts` — Global module mocks

Replace the minimal setup from Phase 1 with full mocks:

```ts
import { vi } from 'vitest';

// --- Mock 'agents' SDK ---
let mockRegistry: Map<symbol, unknown> = new Map();
export function registerMockAgent(namespace: symbol, mock: unknown) {
  mockRegistry.set(namespace, mock);
}
export function clearMockRegistry() { mockRegistry = new Map(); }

vi.mock('agents', () => ({
  callable: () => (_target: unknown, _ctx: unknown) => {},
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

### 2. Create `test/harness/sql-template.ts`

Wraps `better-sqlite3` in-memory DB to match the DO `this.sql<T>` template tag API.

```ts
import Database from 'better-sqlite3';

export function createSqlTag(db: Database.Database) {
  return function sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ): T[] {
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

### 3. Create `test/harness/mock-broker.ts`

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

### 4. Create `test/harness/mock-orchestrators.ts`

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

### 5. Create `test/harness/create-test-agent.ts`

Creates a SessionAgent instance with DO primitives replaced by in-memory equivalents.

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

  const agent = Object.create(SessionAgent.prototype) as SessionAgent;

  const schedules: Schedule[] = [];
  const stateHistory: unknown[] = [];

  Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
  Object.defineProperty(agent, 'name', { value: 'test-user-123', writable: true });

  let currentState = { ...agent.initialState };
  Object.defineProperty(agent, 'state', {
    get: () => currentState,
    set: (v) => { currentState = v; },
  });
  (agent as any).setState = (newState: typeof currentState) => {
    currentState = newState;
    stateHistory.push({ ...newState });
  };

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

  (agent as any).saveMessages = async () => {};
  Object.defineProperty(agent, 'messages', { get: () => [], writable: true });

  const broadcasts: string[] = [];
  (agent as any).broadcast = (data: unknown) => { broadcasts.push(JSON.stringify(data)); };

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

  await agent.onStart();

  return {
    agent, db, schedules, stateHistory, broadcasts,
    mocks: { broker: mockBroker, debate: mockDebate, pipeline: mockPipeline },
  };
}
```

### 6. Create `test/harness/fixtures.ts`

```ts
/** TradingConfig that blocks nothing */
export const permissiveTradingConfig = {
  tradingHoursOnly: false,
  maxDailyLossPct: 1.0,
  cooldownMinutesAfterLoss: 0,
  tickerBlacklist: [],
  tickerAllowlist: null,
  allowShortSelling: true,
  maxPositions: 100,
  maxNotionalPerTrade: 1_000_000,
  maxPositionValue: 1_000_000,
  takeProfitPct: 0.1,
  stopLossPct: 0.05,
  proposalTimeoutSec: 900,
  llmTemperature: 0.7,
  llmMaxTokens: 2048,
  scoreWindows: [5, 20],
  confidenceDisplayHigh: 0.8,
  confidenceDisplayMed: 0.5,
};

/** TradingConfig with strict risk limits */
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

### 7. Write Round 1 tests

**File**: `test/agents/session-lifecycle.test.ts`

| # | Test | Verifies |
|---|------|----------|
| 8 | `getConfig returns default config after init` | SQL tables created, seed data, callable works |
| 9 | `start enables session and sets lastCycleAt` | State transition, schedule created |
| 10 | `stop disables session` | State transition, schedules cancelled |
| 11 | `getStatus returns state with pendingProposalCount` | SQL count query, state assembly |
| 12 | `updateConfig persists changes and preserves unchanged fields` | Partial update, reload verification |
| 13 | `updateConfig reschedules when interval changes and session enabled` | Schedule array inspection |

Example:
```ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { registerMockAgent, clearMockRegistry } from '../setup';
import { createTestAgent } from '../harness/create-test-agent';

describe('SessionAgent lifecycle', () => {
  let agent, schedules;

  beforeEach(async () => {
    clearMockRegistry();
    const result = await createTestAgent();
    agent = result.agent;
    schedules = result.schedules;
    registerMockAgent(agent.env.AlpacaBrokerAgent, result.mocks.broker);
  });

  test('getConfig returns default config after init', () => {
    const config = agent.getConfig();
    expect(config.orchestrationMode).toBe('debate');
    expect(config.watchlistSymbols).toEqual([]);
    expect(config.analysisIntervalSec).toBe(120);
  });

  test('start enables session and sets lastCycleAt', async () => {
    const state = await agent.start();
    expect(state.enabled).toBe(true);
    expect(state.lastCycleAt).toBeTypeOf('number');
    expect(schedules.some(s => s.callback === 'runScheduledCycle')).toBe(true);
  });

  test('stop disables session and cancels all schedules', async () => {
    await agent.start();
    const state = await agent.stop();
    expect(state.enabled).toBe(false);
    expect(schedules).toHaveLength(0);
  });
});
```

## Key Files
| File | Role |
|---|---|
| `apps/data-service/src/agents/session-agent.ts` | Agent under test (1873 lines) |
| `apps/data-service/src/agents/session-agent-helpers.ts` | Pure helper functions |
| `packages/data-ops/src/agents/session/types.ts` | Type definitions |
| `packages/data-ops/src/agents/session/defaults.ts` | DEFAULT_SESSION_CONFIG |

## Directory Structure After Phase 2
```
apps/data-service/test/
├── setup.ts
├── harness/
│   ├── create-test-agent.ts
│   ├── sql-template.ts
│   ├── mock-broker.ts
│   ├── mock-orchestrators.ts
│   └── fixtures.ts
├── agents/
│   └── session-lifecycle.test.ts
└── helpers/
    └── session-helpers.test.ts
```

## Verification
```bash
pnpm run test --filter data-service
```
Round 0 (7 tests) + Round 1 (6 tests) = 13 tests pass.

## Notes
- This is the hardest phase — if `createTestAgent()` + `onStart()` work, every subsequent phase is incremental
- If `Object.create(SessionAgent.prototype)` doesn't work due to class field initializers, try `new (SessionAgent as any)()` with constructor args mocked
- The `@callable()` decorator is mocked as no-op — if vitest can't parse TC39 decorators, add `esbuild: { target: 'es2022' }` to vitest config
- `onStart()` runs SQL CREATE TABLE statements — verify these execute against better-sqlite3 without dialect issues
