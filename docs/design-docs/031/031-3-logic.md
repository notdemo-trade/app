# Phase 31: Fix Short Position Handling in Exit Logic -- Part 3: Logic

## Fix 1: Exit Proposal Dedup Guard

### File: `apps/data-service/src/agents/session-agent.ts`

### Method: `createExitProposal()`

**Problem**: The dedup query runs _before_ `exitAction` is computed, and hardcodes `action = 'sell'`.

**Fix**: Move the `exitAction` computation above the dedup query, then use it as a parameter.

### Current Code (lines 1122-1135)

```ts
private async createExitProposal(
    outcome: ProposalOutcome,
    originalProposal: TradeProposal,
    position: BrokerPosition,
    trigger: 'stop_loss' | 'target_hit',
): Promise<void> {
    // Dedup guard: skip if pending sell proposal already exists for this symbol
    const existingPending = this.sql<CountRow>`
        SELECT COUNT(*) as cnt FROM trade_proposals
        WHERE symbol = ${outcome.symbol} AND action = 'sell' AND status = 'pending'`;
    if ((existingPending[0]?.cnt ?? 0) > 0) return;

    const config = this.loadConfig();
    const exitAction = position.side === 'long' ? 'sell' : 'buy';
```

### Fixed Code

```ts
private async createExitProposal(
    outcome: ProposalOutcome,
    originalProposal: TradeProposal,
    position: BrokerPosition,
    trigger: 'stop_loss' | 'target_hit',
): Promise<void> {
    const exitAction = position.side === 'long' ? 'sell' : 'buy';

    // Dedup guard: skip if a pending exit proposal already exists for this symbol
    const existingPending = this.sql<CountRow>`
        SELECT COUNT(*) as cnt FROM trade_proposals
        WHERE symbol = ${outcome.symbol} AND action = ${exitAction} AND status = 'pending'`;
    if ((existingPending[0]?.cnt ?? 0) > 0) return;

    const config = this.loadConfig();
```

### What Changed

1. `exitAction` computation moved from line 1135 to before the dedup query.
2. The hardcoded `'sell'` in the SQL `WHERE` clause is replaced with `${exitAction}`.
3. The comment is updated to say "pending exit proposal" instead of "pending sell proposal".

### Long Position Behavior (Unchanged)

For long positions, `exitAction` is `'sell'`, so the query becomes `WHERE ... action = 'sell'` -- identical to the current behavior.

### Short Position Behavior (Fixed)

For short positions, `exitAction` is `'buy'`, so the query becomes `WHERE ... action = 'buy'`. This correctly detects existing pending buy-to-close proposals and prevents duplicates.

---

## Fix 2: `determineExitReason()` Side-Aware Logic

### File: `apps/data-service/src/agents/session-agent.ts`

### Method: `determineExitReason()`

**Problem**: The method applies long-side price comparisons (`<=` for stop, `>=` for target) unconditionally, regardless of position side.

**Fix**: Use `outcome.action` to determine the position side and apply the correct comparison direction. The `outcome.action` field records the original entry action: `'buy'` means long, `'sell'` means short. This field is already available via the `outcome` parameter -- no signature change needed.

### Current Code (lines 1202-1229)

```ts
private determineExitReason(
    exitOrder: OrderLogEntry | undefined,
    outcome: ProposalOutcome,
): ExitReason {
    if (!exitOrder) return 'manual_close';

    const proposal = this.sql<ProposalRow>`
        SELECT * FROM trade_proposals WHERE id = ${outcome.proposalId}`;
    const row = proposal[0];
    if (!row) return 'manual_close';

    const p = rowToProposal(row);
    if (
        p.stopLoss !== null &&
        exitOrder.filledAvgPrice !== null &&
        exitOrder.filledAvgPrice <= p.stopLoss
    ) {
        return 'stop_loss';
    }
    if (
        p.targetPrice !== null &&
        exitOrder.filledAvgPrice !== null &&
        exitOrder.filledAvgPrice >= p.targetPrice
    ) {
        return 'target_hit';
    }
    return 'manual_close';
}
```

### Fixed Code

```ts
private determineExitReason(
    exitOrder: OrderLogEntry | undefined,
    outcome: ProposalOutcome,
): ExitReason {
    if (!exitOrder) return 'manual_close';

    const proposal = this.sql<ProposalRow>`
        SELECT * FROM trade_proposals WHERE id = ${outcome.proposalId}`;
    const row = proposal[0];
    if (!row) return 'manual_close';

    const p = rowToProposal(row);
    const isLong = outcome.action === 'buy';

    if (isLong) {
        // Long: stop-loss when price drops to/below stop, target when price rises to/above target
        if (
            p.stopLoss !== null &&
            exitOrder.filledAvgPrice !== null &&
            exitOrder.filledAvgPrice <= p.stopLoss
        ) {
            return 'stop_loss';
        }
        if (
            p.targetPrice !== null &&
            exitOrder.filledAvgPrice !== null &&
            exitOrder.filledAvgPrice >= p.targetPrice
        ) {
            return 'target_hit';
        }
    } else {
        // Short: stop-loss when price rises to/above stop, target when price drops to/below target
        if (
            p.stopLoss !== null &&
            exitOrder.filledAvgPrice !== null &&
            exitOrder.filledAvgPrice >= p.stopLoss
        ) {
            return 'stop_loss';
        }
        if (
            p.targetPrice !== null &&
            exitOrder.filledAvgPrice !== null &&
            exitOrder.filledAvgPrice <= p.targetPrice
        ) {
            return 'target_hit';
        }
    }
    return 'manual_close';
}
```

### What Changed

1. Added `const isLong = outcome.action === 'buy'` to derive the position side.
2. Wrapped the existing comparisons in an `if (isLong)` branch.
3. Added an `else` branch with inverted comparisons for short positions.
4. No signature change -- `outcome.action` is already available.

### Comparison with `checkExitConditions()`

The logic in the `else` branch mirrors `checkExitConditions()` (lines 1113-1117):

| Condition | `checkExitConditions()` (short) | `determineExitReason()` (short, fixed) |
|-----------|-------------------------------|---------------------------------------|
| Stop-loss | `currentPrice >= proposal.stopLoss` | `exitOrder.filledAvgPrice >= p.stopLoss` |
| Target-hit | `currentPrice <= proposal.targetPrice` | `exitOrder.filledAvgPrice <= p.targetPrice` |

The only difference is the price source: `currentPrice` (live quote) vs. `exitOrder.filledAvgPrice` (actual fill). The comparison direction is identical.

### Long Position Behavior (Unchanged)

When `outcome.action === 'buy'`, the `isLong` branch executes. The comparisons are identical to the current code.

### Short Position Behavior (Fixed)

Example: Short position entered via `sell` at $100, stop-loss at $105, target at $90.

| Scenario | Fill Price | Current (Bug) | Fixed |
|----------|-----------|---------------|-------|
| Stop-loss hit | $105 | `$105 <= $105` = `true` (accidental) | `$105 >= $105` = `true` (correct) |
| Stop-loss with slippage | $106 | `$106 <= $105` = `false` (BUG: returns `manual_close`) | `$106 >= $105` = `true` (correct: `stop_loss`) |
| Target hit | $90 | `$90 >= $90` = `true` (accidental) | `$90 <= $90` = `true` (correct) |
| Target with better fill | $89 | `$89 >= $90` = `false` (BUG: returns `manual_close`) | `$89 <= $90` = `true` (correct: `target_hit`) |

---

## Fix 3: `getDebateSession()` Symbol Propagation

### File: `apps/data-service/src/agents/debate-orchestrator-agent.ts`

### Method: `getDebateSession()`

**Problem**: The method returns `symbol: ''` instead of the actual ticker.

**Fix**: Add a `symbol` parameter to the method and pass `params.symbol` from the caller.

### Current Code (lines 453-469)

```ts
private getDebateSession(
    sessionId: string,
    analyses: PersonaAnalysis[],
    debateRounds: DebateRound[],
    consensus: ConsensusResult,
): DebateSession {
    return {
        id: sessionId,
        symbol: '',
        status: 'completed',
        initialAnalyses: analyses,
        debateRounds,
        consensus,
        startedAt: Date.now(),
        completedAt: Date.now(),
    };
}
```

### Fixed Code

```ts
private getDebateSession(
    sessionId: string,
    analyses: PersonaAnalysis[],
    debateRounds: DebateRound[],
    consensus: ConsensusResult,
    symbol: string,
): DebateSession {
    return {
        id: sessionId,
        symbol,
        status: 'completed',
        initialAnalyses: analyses,
        debateRounds,
        consensus,
        startedAt: Date.now(),
        completedAt: Date.now(),
    };
}
```

### Caller Update (line 270)

**Current**:

```ts
const session = this.getDebateSession(sessionId, analyses, debateRounds, consensus);
```

**Fixed**:

```ts
const session = this.getDebateSession(sessionId, analyses, debateRounds, consensus, params.symbol);
```

### What Changed

1. Added `symbol: string` as the last parameter of `getDebateSession()`.
2. Changed `symbol: ''` to `symbol` (shorthand property) in the return object.
3. Updated the single call site to pass `params.symbol`.

---

## Summary of All Code Changes

| File | Method | Change Type | Lines Affected |
|------|--------|-------------|----------------|
| `session-agent.ts` | `createExitProposal()` | Move `exitAction` up, use in dedup query | ~1128-1135 |
| `session-agent.ts` | `determineExitReason()` | Add side-aware branching | ~1202-1229 |
| `debate-orchestrator-agent.ts` | `getDebateSession()` | Add `symbol` param | ~453-469 |
| `debate-orchestrator-agent.ts` | `runDebate()` | Pass `params.symbol` to `getDebateSession()` | ~270 |
