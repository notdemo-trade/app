# Phase 3: Risk Gates (G1-G5)

## Goal
Test all 5 risk gates through `triggerAnalysis()`. Each gate can skip the analysis cycle for a specific risk reason.

## Status: DONE

## Prerequisites
- Phase 2 complete (test harness working, lifecycle tests pass)

## File
`test/agents/session-gates.test.ts`

## Tests

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

## Key Setup

Gates require `loadEffectiveConfig()` which merges TradingConfig (from PG) + SessionConfig (from SQLite) + Strategy. Mock `getTradingConfig` to control risk limits:

```ts
import { getTradingConfig } from '@repo/data-ops/trading-config';
import { strictTradingConfig, permissiveTradingConfig } from '../harness/fixtures';

vi.mocked(getTradingConfig).mockResolvedValue({
  ...strictTradingConfig,
  tradingHoursOnly: true,       // G1
  maxDailyLossPct: 0.02,        // G4
  cooldownMinutesAfterLoss: 30, // G5
  tickerBlacklist: ['TSLA'],    // G2
  tickerAllowlist: null,        // G3 (null = no filter)
});
```

## Example Tests

### G1: Market hours
```ts
test('G1: skips when market closed and tradingHoursOnly enabled', async () => {
  mocks.broker.getClock.mockResolvedValue({ isOpen: false });
  vi.mocked(getTradingConfig).mockResolvedValue({
    ...strictTradingConfig,
    tradingHoursOnly: true,
  });
  await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

  const result = await agent.triggerAnalysis();
  expect(result.skipReason).toContain('Market is closed');
  expect(result.threadIds).toHaveLength(0);
});
```

### G5: Cooldown after loss (uses fake timers)
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
    ...strictTradingConfig,
    cooldownMinutesAfterLoss: 30,
  });
  mocks.broker.getClock.mockResolvedValue({ isOpen: true });
  await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

  const result = await agent.triggerAnalysis();
  expect(result.skipReason).toContain('Cooldown active');

  vi.useRealTimers();
});
```

## Standard beforeEach

```ts
import { registerMockAgent, clearMockRegistry } from '../setup';
import { createTestAgent } from '../harness/create-test-agent';

let agent, mocks;

beforeEach(async () => {
  clearMockRegistry();
  const result = await createTestAgent();
  agent = result.agent;
  mocks = result.mocks;
  registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker);
  registerMockAgent(agent.env.DebateOrchestratorAgent, mocks.debate);
  registerMockAgent(agent.env.PipelineOrchestratorAgent, mocks.pipeline);
  registerMockAgent(agent.env.TechnicalAnalysisAgent, {
    analyze: vi.fn().mockResolvedValue({ signals: [], indicators: {} }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});
```

## Notes
- Fake timers: Always `vi.useRealTimers()` in `afterEach` to prevent leaks
- G4 requires `getPortfolioHistory` to return loss data — check exact field names in broker types
- G2/G3 are symbol-level filters — they don't skip the entire cycle, they filter which symbols get analyzed. Assert on which symbols appear in `result.threadIds` vs which are skipped
- The `triggerAnalysis` return shape may differ from what's documented — read the actual method to confirm field names

## Verification
```bash
pnpm run test --filter data-service
```
8 new gate tests pass (total: ~21 tests).
