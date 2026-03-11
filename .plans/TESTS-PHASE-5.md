# Phase 5: Proposal Lifecycle + Trade Execution

## Goal
Test proposal CRUD operations, status transitions, and the trade execution flow (order placement, result storage, failure handling). Combines Rounds 4 and 5 from the master plan since they share the same `approveProposal` path.

## Status: DONE

## Prerequisites
- Phase 2 complete (test harness working)
- Phase 4 recommended (shares `insertPendingProposal` helper)

## Files
- `test/agents/session-proposals.test.ts` — Proposal CRUD + lifecycle
- `test/agents/session-execution.test.ts` — Trade execution details

## Tests: Proposals

| # | Test | Verifies |
|---|------|----------|
| 28 | `getProposals returns proposals ordered by creation` | SQL ordering |
| 29 | `getProposals filters by status` | Status param |
| 30 | `approveProposal transitions pending → executed` | Status change + broker placeOrder called |
| 31 | `rejectProposal transitions pending → rejected` | Status + decidedAt set |
| 32 | `approveProposal errors for non-pending proposal` | Returns `{ status: 'error' }` |
| 33 | `approveProposal auto-expires past deadline` | Expired proposal detected during approve |
| 34 | `retryProposal re-executes failed proposal` | Failed → executed transition |
| 35 | `expired proposals batch-expire during cycle` | `runScheduledCycle` expires old proposals |

## Tests: Execution

| # | Test | Verifies |
|---|------|----------|
| 36 | `execution stores order details on proposal` | orderId, filledQty, filledAvgPrice |
| 37 | `execution creates outcome tracking record` | getOutcomes('tracking') returns entry |
| 38 | `failed execution sets proposal status to failed` | Broker throws → status='failed' |
| 39 | `notional computed from positionSizePct when no qty` | cash * pct / 100 calculation |

## Example Tests

### Proposal approve → executed
```ts
test('approveProposal transitions pending to executed', async () => {
  vi.mocked(getTradingConfig).mockResolvedValue(permissiveTradingConfig);
  const proposalId = insertPendingProposal(agent, { notional: 1000 });

  const result = await agent.approveProposal(proposalId);
  expect(result.status).toBe('executed');

  expect(mocks.broker.placeOrder).toHaveBeenCalledWith(
    expect.objectContaining({ symbol: 'AAPL', side: 'buy' })
  );

  const proposals = agent.getProposals('executed');
  expect(proposals).toHaveLength(1);
  expect(proposals[0].orderId).toBe('order-001');
});
```

### Failed execution
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

### Reject proposal
```ts
test('rejectProposal transitions pending to rejected', async () => {
  const proposalId = insertPendingProposal(agent);
  const result = await agent.rejectProposal(proposalId);

  expect(result.status).toBe('rejected');

  const proposals = agent.getProposals('rejected');
  expect(proposals).toHaveLength(1);
});
```

## Shared Helper
Reuse `insertPendingProposal` from Phase 4. If not already in a shared location, move it to `test/harness/fixtures.ts` or `test/harness/test-helpers.ts`.

## Notes
- `approveProposal` does double duty: runs guards (Phase 4) then executes. These tests assume guards pass (use `permissiveTradingConfig`)
- Verify exact broker `placeOrder` call shape by reading the agent source — it may pass `notional` or `qty` depending on the proposal
- `getOutcomes('tracking')` is tested here to verify outcome creation, but deep outcome tracking is Phase 6
- Proposal expiration tests may need fake timers to simulate time passing
- The `retryProposal` method may re-run guards — verify in source

## Verification
```bash
pnpm run test --filter data-service
```
12 new tests pass (total: ~39 tests).
