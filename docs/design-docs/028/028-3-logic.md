# Phase 28: Proposal Status State Machine -- Part 3: Logic

## Extract Shared Execution Method

### New Private Method: `executeApprovedProposal()`

The order execution logic currently lives inline in `handleTradeDecision()`. Extract it into a shared method so both `handleTradeDecision()` and `retryProposal()` can use it without duplication.

```ts
private async executeApprovedProposal(
    proposal: TradeProposal,
): Promise<{ status: string; message: string }> {
    try {
        const userId = this.name;
        const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
            this.env.AlpacaBrokerAgent,
            userId,
        );

        const qty = proposal.qty ?? undefined;
        let notional = proposal.notional ?? undefined;

        if (!qty && !notional && proposal.positionSizePct) {
            const account = await broker.getAccount();
            notional = Math.round(account.cash * (proposal.positionSizePct / 100) * 100) / 100;
        }

        const orderResult = await broker.placeOrder({
            symbol: proposal.symbol,
            side: proposal.action,
            type: 'market',
            timeInForce: 'day',
            qty,
            notional,
        });

        this.sql`UPDATE trade_proposals SET status = 'executed' WHERE id = ${proposal.id}`;
        this.createOutcomeTracking(proposal, orderResult);
        return {
            status: 'executed',
            message: `Trade executed: ${proposal.action} ${proposal.symbol}`,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.sql`UPDATE trade_proposals SET status = 'failed' WHERE id = ${proposal.id}`;
        return { status: 'failed', message: `Execution failed: ${message}` };
    }
}
```

**Key difference from current code**: The catch block now writes `status = 'failed'` to the database before returning. This is the core bug fix.

---

## Fix: `handleTradeDecision()`

### Modified Method: `session-agent.ts:565-627`

Replace the inline execution logic with a call to `executeApprovedProposal()`:

```ts
private async handleTradeDecision(
    proposalId: string,
    approved: boolean,
): Promise<{ status: string; message: string }> {
    const rows = this.sql<ProposalRow>`SELECT * FROM trade_proposals WHERE id = ${proposalId}`;
    const row = rows[0];
    if (!row) return { status: 'error', message: 'Proposal not found' };

    const proposal = rowToProposal(row);
    if (proposal.status !== 'pending') {
        return { status: 'error', message: `Proposal already ${proposal.status}` };
    }
    if (proposal.expiresAt < Date.now()) {
        this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()}
            WHERE id = ${proposalId}`;
        return { status: 'expired', message: 'Proposal has expired' };
    }

    const decidedAt = Date.now();
    if (!approved) {
        this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${decidedAt}
            WHERE id = ${proposalId}`;
        return { status: 'rejected', message: 'Trade rejected by user' };
    }

    // Set approved status with decided_at timestamp
    this.sql`UPDATE trade_proposals SET status = 'approved', decided_at = ${decidedAt}
        WHERE id = ${proposalId}`;

    // Execute the order -- on failure, status transitions to 'failed'
    return this.executeApprovedProposal(proposal);
}
```

The method structure is unchanged except that the try/catch block is replaced by the `executeApprovedProposal()` call. The `'approved'` status is still written first (preserving the `decided_at` timestamp), but execution failure now durably transitions to `'failed'`.

---

## New Callable: `retryProposal()`

### New Method on SessionAgent

```ts
@callable()
async retryProposal(proposalId: string): Promise<{ status: string; message: string }> {
    const rows = this.sql<ProposalRow>`SELECT * FROM trade_proposals WHERE id = ${proposalId}`;
    const row = rows[0];
    if (!row) return { status: 'error', message: 'Proposal not found' };

    const proposal = rowToProposal(row);
    if (proposal.status !== 'failed') {
        return {
            status: 'error',
            message: `Can only retry failed proposals, current status: ${proposal.status}`,
        };
    }

    // Check if the proposal has expired since the failure
    if (proposal.expiresAt < Date.now()) {
        this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()}
            WHERE id = ${proposalId}`;
        return { status: 'expired', message: 'Proposal has expired since failure' };
    }

    // Re-attempt execution
    const result = await this.executeApprovedProposal(proposal);

    // Broadcast updated thread state
    this.broadcastThread(
        this.sql<ThreadRow>`SELECT * FROM discussion_threads WHERE proposal_id = ${proposalId}`[0]
            ?.id ?? '',
    );

    return result;
}
```

### Behavior

| Scenario | Outcome |
|----------|---------|
| Proposal not found | Returns `{ status: 'error', message: 'Proposal not found' }` |
| Proposal is not `'failed'` | Returns `{ status: 'error', message: 'Can only retry failed...' }` |
| Proposal has expired | Transitions to `'expired'`, returns `{ status: 'expired' }` |
| Broker call succeeds | Transitions to `'executed'`, creates outcome tracking, returns `{ status: 'executed' }` |
| Broker call fails again | Stays `'failed'` (re-written by `executeApprovedProposal`), returns `{ status: 'failed' }` |

### Retry State Transitions

```
failed --[retryProposal()]--> executeApprovedProposal()
                                  |
                                  +-- success --> 'executed'
                                  |
                                  +-- failure --> 'failed' (updated error message)

failed --[retryProposal()]--> expired check
                                  |
                                  +-- expired --> 'expired'
```

The retry does not go through `'approved'` again -- it directly attempts execution from `'failed'`. The `decided_at` timestamp from the original approval is preserved.

---

## Fix: `expireProposals()`

### Modified Method: `session-agent.ts:871-875`

```ts
// Before
private expireProposals(): void {
    const now = Date.now();
    this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
        WHERE status = 'pending' AND expires_at < ${now}`;
}

// After
private expireProposals(): void {
    const now = Date.now();
    this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
        WHERE status IN ('pending', 'failed') AND expires_at < ${now}`;
}
```

This ensures that failed proposals are cleaned up automatically once their expiration window passes. Without this change, a failed proposal that the user never retries would stay `'failed'` indefinitely.

**Note on `decided_at`**: For `'failed'` proposals, `decided_at` was already set during the original approval. The expiration sweep overwrites it with the expiration timestamp. This is consistent with how `'pending'` proposals are expired (their `decided_at` is set to the expiration time, not the user's decision time, because there was no user decision to expire them). For `'failed'` proposals, the original `decided_at` is already set, but overwriting it with the expiration time is acceptable -- the user's original approval timestamp is not critical once the proposal has been expired.

---

## Fix: `resetData()`

### Modified Method: `session-agent.ts:322-325`

```ts
// Before (line 324)
this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
    WHERE status IN ('pending', 'approved')`;

// After
this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
    WHERE status IN ('pending', 'approved', 'failed')`;
```

This is a defensive addition. `resetData()` already handled `'approved'` zombies. Adding `'failed'` ensures all non-terminal proposals are cleaned up during a manual reset.

---

## Optional: Zombie Cleanup on Start

### Modified Method: `onStart()` or beginning of `runScheduledCycle()`

Add a one-time migration to clean up existing zombie `'approved'` proposals from before this fix was deployed:

```ts
// Clean up pre-fix zombie 'approved' proposals that are past expiry
this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()}
    WHERE status = 'approved' AND expires_at < ${Date.now()}`;
```

**Placement**: This can go in `onStart()` (runs once per DO instantiation) or at the top of `expireProposals()`. Placing it in `expireProposals()` means it runs on every cycle but is idempotent (the WHERE clause only matches proposals that are both `'approved'` AND past expiry).

**Recommendation**: Place it in `expireProposals()` by including `'approved'` in the IN clause:

```ts
private expireProposals(): void {
    const now = Date.now();
    this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
        WHERE status IN ('pending', 'failed', 'approved') AND expires_at < ${now}`;
}
```

This is a broader change that also prevents future zombie `'approved'` proposals if any other code path somehow leaves a proposal in that state. The `'approved'` -> `'expired'` transition via timeout is a safety net.

**Trade-off**: Including `'approved'` in the expiration sweep means that if a broker call takes longer than the proposal timeout (highly unlikely, since proposal timeouts are typically 120+ seconds and broker calls timeout at ~30 seconds), the proposal could be expired mid-execution. Given that the execution code reads the proposal once and then operates on the in-memory copy, this race condition is benign -- the execution will either succeed (overwriting `'expired'` with `'executed'`) or fail (overwriting `'expired'` with `'failed'`). Both outcomes are correct.

---

## Error Handling

### Error Flow

```
User clicks "Approve"
  -> approveProposal() callable
    -> handleTradeDecision(id, true)
      -> status = 'approved' (written to DB)
      -> executeApprovedProposal(proposal)
        -> broker.placeOrder() THROWS
        -> catch: status = 'failed' (written to DB)    <-- NEW
        -> return { status: 'failed', message: '...' }
      -> return { status: 'failed', message: '...' }
    -> broadcastThread()                                <-- thread state includes 'failed' proposal
  -> UI receives { status: 'failed' } via WebSocket

User clicks "Retry"
  -> retryProposal() callable
    -> check status === 'failed'
    -> check not expired
    -> executeApprovedProposal(proposal)
      -> broker.placeOrder() SUCCEEDS
      -> status = 'executed' (written to DB)
      -> createOutcomeTracking()
      -> return { status: 'executed', message: '...' }
    -> broadcastThread()
  -> UI receives { status: 'executed' } via WebSocket
```

### Consistency Guarantee

The `this.sql` calls are synchronous SQLite operations on the DO's local storage. They execute within the same isolate and are not subject to network failures. If `this.sql` itself throws (disk full, SQL syntax error), the DO will restart and the proposal's prior status is preserved (either `'approved'` from before the execution attempt, or the original `'pending'` if the `'approved'` write also failed). This is an extreme edge case and is handled by the existing DO error recovery mechanisms.
