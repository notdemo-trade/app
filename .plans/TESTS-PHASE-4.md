# Phase 4: Execution Guards (E1-E4)

## Goal
Test all 4 execution guards through `approveProposal()`. Guards run at trade execution time and block individual orders that violate risk limits.

## Status: DONE

## Prerequisites
- Phase 2 complete (test harness working)
- Phase 3 recommended but not strictly required

## File
`test/agents/session-guards.test.ts`

## Tests

| # | Test | Verifies |
|---|------|----------|
| 22 | `E1: rejects when notional > maxNotionalPerTrade` | Guard prevents execution |
| 23 | `E2: rejects when notional > maxPositionValue` | Guard prevents execution |
| 24 | `E3: rejects buy when max positions reached` | Position count check |
| 25 | `E3: allows sell even at max positions` | Sell bypass |
| 26 | `E4: rejects sell without position when short selling disabled` | No position + no short |
| 27 | `E4: allows sell without position when short selling enabled` | Proceeds to order |

## Helper: Insert Test Proposals

Each guard test needs a pending proposal in SQLite. Use this helper:

```ts
function insertPendingProposal(agent: SessionAgent, overrides: Partial<TradeProposal> = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const threadId = overrides.threadId ?? crypto.randomUUID();
  const now = Date.now();

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

  agent.sql`UPDATE discussion_threads SET proposal_id = ${id} WHERE id = ${threadId}`;
  return id;
}
```

## Example Tests

### E1: Max notional per trade
```ts
test('E1: rejects when notional > maxNotionalPerTrade', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue({
    ...strictTradingConfig,
    maxNotionalPerTrade: 5_000,
  });

  const proposalId = insertPendingProposal(agent, { notional: 10_000 });
  const result = await agent.approveProposal(proposalId);

  expect(result.status).toBe('error');
  expect(result.message).toContain('notional');
});
```

### E4: Short selling guard
```ts
test('E4: rejects sell without position when short selling disabled', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue({
    ...permissiveTradingConfig,
    allowShortSelling: false,
  });
  mocks.broker.getPositions.mockResolvedValue([]); // no positions

  const proposalId = insertPendingProposal(agent, { action: 'sell', symbol: 'AAPL' });
  const result = await agent.approveProposal(proposalId);

  expect(result.status).toBe('error');
  expect(result.message).toContain('Short selling is disabled');
});
```

## Standard beforeEach
Same as Phase 3 — `createTestAgent()` + register all mock agents.

## Notes
- Guards are checked inside `approveProposal()` before calling `broker.placeOrder()`
- If a guard rejects, `placeOrder` should NOT be called — verify with `expect(mocks.broker.placeOrder).not.toHaveBeenCalled()`
- The `insertPendingProposal` helper will be reused in Phases 5 and 6 — consider placing it in `test/harness/fixtures.ts` or a shared helpers file
- Check exact column names in the `trade_proposals` CREATE TABLE to ensure the INSERT matches

## Verification
```bash
pnpm run test --filter data-service
```
6 new guard tests pass (total: ~27 tests).
