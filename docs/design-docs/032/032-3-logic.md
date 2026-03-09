# Phase 32: Proposal Dedup Guards & Minor Data Fixes -- Part 3: Logic

## Fix 1: Proposal Dedup Guard

### Location

`apps/data-service/src/agents/session-agent.ts`, method `runAnalysisForSymbol()`

### Current Code (lines 408-417)

```ts
private async runAnalysisForSymbol(
    symbol: string,
    config: EffectiveConfig,
    portfolioContext?: PortfolioContext,
): Promise<{ threadId: string; summary: string }> {
    const threadId = crypto.randomUUID();
    const now = Date.now();

    this.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
        VALUES (${threadId}, ${config.orchestrationMode}, ${symbol}, 'in_progress', ${now})`;
    // ... continues with analysis
```

### Updated Code

```ts
private async runAnalysisForSymbol(
    symbol: string,
    config: EffectiveConfig,
    portfolioContext?: PortfolioContext,
): Promise<{ threadId: string; summary: string }> {
    // Dedup guard: skip if pending or approved proposal already exists for this symbol
    const existingActive = this.sql<CountRow>`
        SELECT COUNT(*) as cnt FROM trade_proposals
        WHERE symbol = ${symbol} AND status IN ('pending', 'approved')`;
    if ((existingActive[0]?.cnt ?? 0) > 0) {
        return {
            threadId: '',
            summary: `Skipped ${symbol}: active proposal already exists`,
        };
    }

    const threadId = crypto.randomUUID();
    const now = Date.now();

    this.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
        VALUES (${threadId}, ${config.orchestrationMode}, ${symbol}, 'in_progress', ${now})`;
    // ... rest unchanged
```

### Why the Guard Is Before Thread Creation

The dedup check runs before `INSERT INTO discussion_threads`. This avoids creating an empty discussion thread for a symbol that will be immediately skipped. If the thread were created first, the threads list would accumulate stub records with no messages and no proposal.

### Return Value When Skipped

The method returns `{ threadId: '', summary: '...' }`. The caller (`triggerAnalysis()`) already handles the case where `result.threadId` is falsy:

```ts
if (result.threadId) {
    threadIds.push(result.threadId);
}
```

An empty `threadId` is not pushed into the return array, so the caller correctly reports only the threads that actually ran analysis.

### Edge Case: Expired Proposals During Dedup Check

A proposal with `status: 'pending'` and `expiresAt < Date.now()` is technically expired but has not been updated to `status: 'expired'` yet. The expiration status update happens when the user tries to act on the proposal (in `handleTradeDecision()`), not proactively.

This means the dedup guard may block analysis for a symbol with an expired-but-not-yet-updated proposal. This is acceptable because:
1. The analysis interval is typically 120 seconds, and proposal timeout is 900 seconds (15 minutes). The overlap window is small.
2. The user can reject the stale proposal to unblock the symbol.
3. A future enhancement could add an expiration sweep to `triggerAnalysis()` before the symbol loop, but that is out of scope for this fix.

### Edge Case: Concurrent `triggerAnalysis()` Calls

If `triggerAnalysis()` is called twice in rapid succession (e.g., user manual trigger plus scheduled alarm), both calls could pass the dedup check for the same symbol before either creates a proposal. This is unlikely because:
1. `triggerAnalysis()` is sequential -- it awaits each symbol before moving to the next
2. The DO processes one request at a time (Durable Object single-threaded execution model)

No additional locking is needed.

---

## Fix 2: Exit Order Matching

### Location

`apps/data-service/src/agents/session-agent.ts`, method `findExitOrder()`

### Current Code (lines 1189-1200)

```ts
private findExitOrder(
    orders: OrderLogEntry[],
    outcome: ProposalOutcome,
): OrderLogEntry | undefined {
    // Find the most recent filled order that closes the position
    const exitSide = outcome.action === 'buy' ? 'sell' : 'buy';
    return orders
        .filter(
            (o) => o.side === exitSide && o.status === 'filled' && o.createdAt > outcome.createdAt,
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];
}
```

### Updated Code

```ts
private findExitOrder(
    orders: OrderLogEntry[],
    outcome: ProposalOutcome,
): OrderLogEntry | undefined {
    // Find the earliest filled exit-side order after the entry
    const exitSide = outcome.action === 'buy' ? 'sell' : 'buy';
    return orders
        .filter(
            (o) => o.side === exitSide && o.status === 'filled' && o.createdAt > outcome.createdAt,
        )
        .sort((a, b) => a.createdAt - b.createdAt)[0];
}
```

### Change Summary

| Aspect | Before | After |
|--------|--------|-------|
| Sort direction | `b.createdAt - a.createdAt` (descending) | `a.createdAt - b.createdAt` (ascending) |
| Selected order | Most recent exit | Earliest exit after entry |
| Comment | "most recent filled order" | "earliest filled exit-side order after the entry" |

### Why Earliest Is Correct

In a FIFO (first-in, first-out) position model -- which is the standard for US equity brokers including Alpaca -- the first exit after an entry closes the position opened by that entry. Taking the most recent exit would skip over the actual closing order and instead match a later order that may relate to a different position or a re-entry.

### Limitation

This is still a heuristic. For perfect matching, we would need to correlate entries and exits by `client_order_id` or use the broker's position-level fill history. That requires changes to the order placement flow (setting `client_order_id` to the proposal ID) and is deferred to a future phase.

### Impact on Existing Outcomes

This fix is forward-looking. Existing `ProposalOutcome` records are not retroactively corrected. The P&L for already-resolved outcomes may be based on the wrong exit order. A backfill script could recompute historical outcomes, but that is out of scope.

---

## Fix 3: Pipeline `threadId` at Construction

### Location

- `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`, interface `RunPipelineParams` and method `buildProposal()`
- `apps/data-service/src/agents/session-agent.ts`, method `runPipelineAnalysis()`

### Current Code: `RunPipelineParams` (line 24)

```ts
export interface RunPipelineParams {
    symbol: string;
    strategyId: string;
    strategy: StrategyTemplate;
    onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
    llmPrefs?: { temperature: number; maxTokens: number };
    proposalTimeoutSec?: number;
    scoreWindows?: number[];
    portfolioContext?: PortfolioContext;
}
```

### Updated `RunPipelineParams`

```ts
export interface RunPipelineParams {
    symbol: string;
    strategyId: string;
    strategy: StrategyTemplate;
    onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
    llmPrefs?: { temperature: number; maxTokens: number };
    proposalTimeoutSec?: number;
    scoreWindows?: number[];
    portfolioContext?: PortfolioContext;
    threadId: string;
}
```

### Current Code: `buildProposal()` (line 468)

```ts
private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
    const rec = ctx.recommendation;
    if (!rec) throw new Error('No recommendation available for proposal');
    const positionSizePct = ctx.riskValidation?.adjustedPositionSize ?? rec.position_size_pct ?? 5;

    return {
        id: crypto.randomUUID(),
        threadId: '',
        symbol: params.symbol,
        // ...
    };
}
```

### Updated `buildProposal()`

```ts
private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
    const rec = ctx.recommendation;
    if (!rec) throw new Error('No recommendation available for proposal');
    const positionSizePct = ctx.riskValidation?.adjustedPositionSize ?? rec.position_size_pct ?? 5;

    return {
        id: crypto.randomUUID(),
        threadId: params.threadId,
        symbol: params.symbol,
        // ...
    };
}
```

### Current Code: `runPipelineAnalysis()` in `session-agent.ts` (line 538)

```ts
const result = (await pipeline.runPipeline({
    symbol,
    strategyId: config.activeStrategyId,
    strategy,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    proposalTimeoutSec: config.proposalTimeoutSec,
    scoreWindows: config.scoreWindows,
    portfolioContext,
})) as RunPipelineResult;

if (result.proposal) {
    const proposal = { ...result.proposal, threadId };
    this.storeProposal(proposal);
    this.sql`UPDATE discussion_threads SET proposal_id = ${proposal.id} WHERE id = ${threadId}`;
}
```

### Updated `runPipelineAnalysis()`

```ts
const result = (await pipeline.runPipeline({
    symbol,
    strategyId: config.activeStrategyId,
    strategy,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    proposalTimeoutSec: config.proposalTimeoutSec,
    scoreWindows: config.scoreWindows,
    portfolioContext,
    threadId,
})) as RunPipelineResult;

if (result.proposal) {
    this.storeProposal(result.proposal);
    this.sql`UPDATE discussion_threads SET proposal_id = ${result.proposal.id} WHERE id = ${threadId}`;
}
```

### Change Summary

| Aspect | Before | After |
|--------|--------|-------|
| `RunPipelineParams.threadId` | Does not exist | `threadId: string` (required) |
| `buildProposal()` `threadId` | Hardcoded `''` | `params.threadId` |
| `runPipelineAnalysis()` call site | Spread-patch: `{ ...result.proposal, threadId }` | Direct: `result.proposal` (already has correct `threadId`) |
| Proposal stored | Copy with patched threadId | Original proposal object |

---

## Error Handling

### Dedup Guard

The dedup query uses `this.sql<CountRow>`, which is the standard DO SQLite synchronous query pattern used throughout `SessionAgent`. If the query fails (e.g., SQLite corruption), it throws synchronously and is caught by the existing `try/catch` in `runAnalysisForSymbol()`:

```ts
try {
    // ... analysis logic
} catch (error) {
    this.sql`UPDATE discussion_threads SET status = 'failed' WHERE id = ${threadId}`;
    // ...
}
```

However, because the dedup guard runs *before* the thread is created, a failure in the dedup query itself would propagate up to `triggerAnalysis()`, which does not currently have a per-symbol try/catch. The dedup query is a simple `SELECT COUNT(*)` against an existing indexed table -- the risk of failure is negligible. No additional error handling is needed.

### Exit Order Fix

No new error paths. The fix changes only the sort comparator. The filter and fallback behavior (`undefined` if no candidates) remain the same.

### ThreadId Fix

No new error paths. The `threadId` field is required on `RunPipelineParams`, enforced at compile time by TypeScript. If a caller omits it, the TypeScript compiler will report an error.
