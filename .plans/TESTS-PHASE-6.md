# Phase 6: Data Retrieval + Outcome Tracking + Reset

## Goal
Test read-only data queries, the outcome tracking cycle (snapshots, resolution, exit triggers), and the reset flow. Combines Rounds 6, 7, and 8 — these are the final tests.

## Status: DONE

## Prerequisites
- Phase 2 complete (test harness working)
- Phase 5 recommended (shares proposal/outcome insertion patterns)

## Files
- `test/agents/session-data.test.ts` — Read-only data queries
- `test/agents/session-outcomes.test.ts` — Outcome tracking cycle
- `test/agents/session-reset.test.ts` — Reset flow

## Tests: Data Retrieval

| # | Test | Verifies |
|---|------|----------|
| 40 | `getThreads returns hydrated threads with messages` | Messages joined, ordered DESC |
| 41 | `getThread returns null for nonexistent` | Returns null, not error |
| 42 | `getOutcomes filters by status` | 'tracking' vs 'resolved' |
| 43 | `getOutcomeSnapshots returns ordered snapshots` | Ordered by snapshot_at DESC |

## Tests: Outcome Tracking

| # | Test | Verifies |
|---|------|----------|
| 44 | `tracking cycle records snapshots for open positions` | New snapshot row via getOutcomeSnapshots |
| 45 | `tracking cycle resolves when position no longer held` | Outcome status → 'resolved', PnL calculated |
| 46 | `stop-loss detected on long position` | Price < stopLoss → exit reason 'stop_loss' |
| 47 | `target-hit detected on long position` | Price > targetPrice → exit reason 'target_hit' |
| 48 | `exit trigger creates auto-exit proposal` | New 'sell' proposal in getProposals('pending') |

## Tests: Reset

| # | Test | Verifies |
|---|------|----------|
| 49 | `resetData clears all data and returns counts` | Deletion + counts match |
| 50 | `resetData fails when session enabled` | Returns `{ status: 'error' }` |
| 51 | `resetData reseeds strategies after clearing` | strategy_templates has rows |

## Helper: Insert Executed Proposal with Outcome

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

## Example Tests

### Outcome tracking — snapshot
```ts
test('tracking cycle records snapshots for open positions', async () => {
  const { outcomeId } = insertExecutedProposalWithOutcome(agent);

  mocks.broker.getPositions.mockResolvedValue([
    { symbol: 'AAPL', qty: 10, currentPrice: 155, marketValue: 1550 },
  ]);

  await agent.runOutcomeTrackingCycle();

  const snapshots = agent.getOutcomeSnapshots(outcomeId);
  expect(snapshots.length).toBeGreaterThanOrEqual(1);
  expect(snapshots[0].currentPrice).toBe(155);
});
```

### Stop-loss trigger
```ts
test('stop-loss detected on long position', async () => {
  const { outcomeId } = insertExecutedProposalWithOutcome(agent, {
    entryPrice: 150, stopLoss: 142,
  });

  mocks.broker.getPositions.mockResolvedValue([
    { symbol: 'AAPL', qty: 10, currentPrice: 140, marketValue: 1400 },
  ]);

  await agent.runOutcomeTrackingCycle();

  const outcomes = agent.getOutcomes('tracking');
  // Check that an exit proposal was created or exit reason set
  const pending = agent.getProposals('pending');
  const exitProposal = pending.find(p => p.symbol === 'AAPL' && p.action === 'sell');
  expect(exitProposal).toBeDefined();
});
```

### Reset
```ts
test('resetData fails when session enabled', async () => {
  await agent.start();
  const result = await agent.resetData();
  expect(result.status).toBe('error');
  expect(result.message).toContain('must be stopped');
});

test('resetData clears all data and returns counts', async () => {
  insertExecutedProposalWithOutcome(agent);
  const result = await agent.resetData();
  expect(result.status).toBe('success');
  expect(result.deleted).toBeDefined();
});
```

## Notes
- Outcome tracking cycle calls `runOutcomeTrackingCycle()` — verify exact method name in source
- Snapshot assertions depend on the exact columns in `outcome_snapshots` table — read CREATE TABLE in onStart()
- Exit triggers may create auto-exit proposals or just flag the outcome — check source for behavior
- Reset may clear different tables — read the `resetData` method to know what `deleted` counts to expect
- Data retrieval tests just insert rows via SQL then read through public @callable methods

## Verification
```bash
pnpm run test --filter data-service
```
All 51 tests pass. Full coverage of risk gates (G1-G5), execution guards (E1-E4), proposal lifecycle, execution, data retrieval, outcome tracking, and reset.
