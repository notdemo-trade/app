# Phase 25: Fix Broken Outcome Distribution — Part 3: Logic

## Data Flow: Before vs. After

### Before (Broken)

```
DebateOrchestrator.runDebate()
  -> returns { session: { id: "a3f2b1c4-..." }, consensus }

SessionAgent.runDebateAnalysis()
  -> extracts consensus, DISCARDS session.id
  -> createProposal(threadId, symbol, consensus, config)
     -> proposal has NO orchestrator session ID

(user approves proposal)

SessionAgent.createOutcomeTracking(proposal, orderResult)
  -> calls resolveOrchestratorSessionId(proposal, mode)
     -> returns "usr_abc123:AAPL"  <--- WRONG
  -> stores "usr_abc123:AAPL" in proposal_outcomes.orchestrator_session_id

(outcome resolves)

SessionAgent.distributeOutcome(outcome, pnl, pnlPct)
  -> debate.recordPersonaOutcome(proposalId, "usr_abc123:AAPL", outcome)
     -> SELECT FROM persona_analyses WHERE session_id = "usr_abc123:AAPL"
     -> 0 rows -> NOTHING HAPPENS
```

### After (Fixed)

```
DebateOrchestrator.runDebate()
  -> returns { session: { id: "a3f2b1c4-..." }, consensus }

SessionAgent.runDebateAnalysis()
  -> extracts consensus AND session.id
  -> createProposal(threadId, symbol, consensus, config, "a3f2b1c4-...")
     -> proposal.orchestratorSessionId = "a3f2b1c4-..."
     -> stored in trade_proposals.orchestrator_session_id

(user approves proposal)

SessionAgent.createOutcomeTracking(proposal, orderResult)
  -> reads proposal.orchestratorSessionId = "a3f2b1c4-..."
  -> stores "a3f2b1c4-..." in proposal_outcomes.orchestrator_session_id

(outcome resolves)

SessionAgent.distributeOutcome(outcome, pnl, pnlPct)
  -> debate.recordPersonaOutcome(proposalId, "a3f2b1c4-...", outcome)
     -> SELECT FROM persona_analyses WHERE session_id = "a3f2b1c4-..."
     -> 3 rows (bull_analyst, bear_analyst, risk_manager)
     -> INSERT INTO persona_outcomes for each
     -> recomputeScores() called for each persona
     -> updatePatterns() called for each persona
```

---

## Code Changes

### 1. `runDebateAnalysis()` — Capture and pass session ID

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 474-522

**Current code** (lines 501-518):

```ts
const result = (await debate.runDebate({
    symbol,
    signals: taResult.signals,
    indicators: taResult.indicators,
    strategy,
    config: debateConfig,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    scoreWindows: config.scoreWindows,
    portfolioContext,
})) as RunDebateResult;

const consensus = result.consensus;
if (consensus.action !== 'hold' && consensus.confidence >= config.minConfidenceThreshold) {
    await this.createProposal(threadId, symbol, consensus, config);
}
```

**Updated code**:

```ts
const result = (await debate.runDebate({
    symbol,
    signals: taResult.signals,
    indicators: taResult.indicators,
    strategy,
    config: debateConfig,
    onMessage,
    llmPrefs: {
        temperature: config.llmTemperature,
        maxTokens: config.llmMaxTokens,
    },
    scoreWindows: config.scoreWindows,
    portfolioContext,
})) as RunDebateResult;

const consensus = result.consensus;
const orchestratorSessionId = result.session.id;
if (consensus.action !== 'hold' && consensus.confidence >= config.minConfidenceThreshold) {
    await this.createProposal(threadId, symbol, consensus, config, orchestratorSessionId);
}
```

**Change**: Extract `result.session.id` and pass it as a new parameter to `createProposal()`.

---

### 2. `runPipelineAnalysis()` — Capture and store session ID

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 524-561

The pipeline code path is different from debate: it uses `this.storeProposal(proposal)` directly instead of `this.createProposal()`. The proposal object is built from `result.proposal` (which comes from the pipeline orchestrator).

**Current code** (lines 538-556):

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

**Updated code**:

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
    const orchestratorSessionId = result.session.id;
    const proposal = { ...result.proposal, threadId, orchestratorSessionId };
    this.storeProposal(proposal);
    this.sql`UPDATE discussion_threads SET proposal_id = ${proposal.id} WHERE id = ${threadId}`;
}
```

**Change**: Extract `result.session.id` and spread it into the proposal object before storing.

---

### 3. `createProposal()` — Accept and store session ID

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 785-850

**Current signature** (line 785-798):

```ts
private async createProposal(
    threadId: string,
    symbol: string,
    consensus: {
        action: string;
        confidence: number;
        rationale: string;
        entryPrice: number | null;
        targetPrice: number | null;
        stopLoss: number | null;
        positionSizePct: number | null;
        risks: string[];
    },
    config: EffectiveConfig,
): Promise<void> {
```

**Updated signature**:

```ts
private async createProposal(
    threadId: string,
    symbol: string,
    consensus: {
        action: string;
        confidence: number;
        rationale: string;
        entryPrice: number | null;
        targetPrice: number | null;
        stopLoss: number | null;
        positionSizePct: number | null;
        risks: string[];
    },
    config: EffectiveConfig,
    orchestratorSessionId: string,
): Promise<void> {
```

**Inside the method**, the proposal object construction (around line 823-844) needs the new field:

**Current** (line 823-844):

```ts
const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    threadId,
    symbol,
    action: consensus.action as 'buy' | 'sell',
    confidence: consensus.confidence,
    rationale: consensus.rationale,
    entryPrice: consensus.entryPrice,
    targetPrice: consensus.targetPrice,
    stopLoss: consensus.stopLoss,
    qty: null,
    notional: null,
    positionSizePct: consensus.positionSizePct ?? config.positionSizePctOfCash,
    risks: consensus.risks,
    warnings,
    expiresAt: Date.now() + config.proposalTimeoutSec * 1000,
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    orderId: null,
    filledQty: null,
    filledAvgPrice: null,
    outcomeStatus: 'none',
};
```

**Updated** -- add `orchestratorSessionId`:

```ts
const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    threadId,
    symbol,
    action: consensus.action as 'buy' | 'sell',
    confidence: consensus.confidence,
    rationale: consensus.rationale,
    entryPrice: consensus.entryPrice,
    targetPrice: consensus.targetPrice,
    stopLoss: consensus.stopLoss,
    qty: null,
    notional: null,
    positionSizePct: consensus.positionSizePct ?? config.positionSizePctOfCash,
    risks: consensus.risks,
    warnings,
    expiresAt: Date.now() + config.proposalTimeoutSec * 1000,
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    orderId: null,
    filledQty: null,
    filledAvgPrice: null,
    outcomeStatus: 'none',
    orchestratorSessionId,
};
```

---

### 4. `storeProposal()` — Persist the session ID

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 852-863

**Current code**:

```ts
private storeProposal(p: TradeProposal): void {
    this.sql`INSERT INTO trade_proposals
        (id, thread_id, symbol, action, confidence, rationale, entry_price, target_price,
         stop_loss, qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, decided_at,
         order_id, filled_qty, filled_avg_price, outcome_status)
        VALUES (${p.id}, ${p.threadId}, ${p.symbol}, ${p.action}, ${p.confidence}, ${p.rationale},
            ${p.entryPrice}, ${p.targetPrice}, ${p.stopLoss}, ${p.qty}, ${p.notional},
            ${p.positionSizePct}, ${JSON.stringify(p.risks)}, ${JSON.stringify(p.warnings)},
            ${p.expiresAt}, ${p.status},
            ${p.createdAt}, ${p.decidedAt}, ${p.orderId}, ${p.filledQty}, ${p.filledAvgPrice},
            ${p.outcomeStatus})`;
}
```

**Updated code** -- add `orchestrator_session_id` to column list and values:

```ts
private storeProposal(p: TradeProposal): void {
    this.sql`INSERT INTO trade_proposals
        (id, thread_id, symbol, action, confidence, rationale, entry_price, target_price,
         stop_loss, qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, decided_at,
         order_id, filled_qty, filled_avg_price, outcome_status, orchestrator_session_id)
        VALUES (${p.id}, ${p.threadId}, ${p.symbol}, ${p.action}, ${p.confidence}, ${p.rationale},
            ${p.entryPrice}, ${p.targetPrice}, ${p.stopLoss}, ${p.qty}, ${p.notional},
            ${p.positionSizePct}, ${JSON.stringify(p.risks)}, ${JSON.stringify(p.warnings)},
            ${p.expiresAt}, ${p.status},
            ${p.createdAt}, ${p.decidedAt}, ${p.orderId}, ${p.filledQty}, ${p.filledAvgPrice},
            ${p.outcomeStatus}, ${p.orchestratorSessionId})`;
}
```

---

### 5. `createOutcomeTracking()` — Read stored session ID

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 927-956

**Current code** (lines 944-946):

```ts
const orchestrationMode = threadRow?.orchestration_mode ?? 'debate';
const orchestratorSessionId = this.resolveOrchestratorSessionId(proposal, orchestrationMode);
```

**Updated code**:

```ts
const orchestrationMode = threadRow?.orchestration_mode ?? 'debate';
const orchestratorSessionId = proposal.orchestratorSessionId;

if (!orchestratorSessionId) {
    // Pre-fix proposal without stored session ID -- skip outcome distribution
    // Still create the outcome row for tracking, but with empty session ID
    const outcomeId = crypto.randomUUID();
    this.sql`INSERT INTO proposal_outcomes
        (id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
         symbol, action, entry_price, entry_qty, status, created_at)
        VALUES (${outcomeId}, ${proposal.id}, ${proposal.threadId},
            ${orchestrationMode}, ${''},
            ${proposal.symbol}, ${proposal.action},
            ${filledPrice}, ${filledQty}, 'tracking', ${Date.now()})`;
    return;
}
```

The rest of the method remains unchanged -- it stores the `orchestratorSessionId` in `proposal_outcomes` as before, but now the value is a valid UUID.

---

### 6. `distributeOutcome()` — Fix DO name for orchestrator lookup

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 1057-1095

This is the companion fix noted in [025-1-spec.md](./025-1-spec.md) Open Questions #1. The current code uses `getAgentByName(this.env.DebateOrchestratorAgent, userId)` -- which addresses a DO named `userId`. But `runDebateAnalysis()` creates the debate DO with name `userId:symbol`. The `persona_analyses` data lives in the `userId:symbol` DO.

**Current code** (lines 1069-1091):

```ts
try {
    const userId = this.name;
    if (outcome.orchestrationMode === 'debate') {
        const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
            this.env.DebateOrchestratorAgent,
            userId,
        );
        await debate.recordPersonaOutcome(
            outcome.proposalId,
            outcome.orchestratorSessionId,
            resolvedOutcome,
        );
    } else {
        const pipeline = await getAgentByName<Env, PipelineOrchestratorAgent>(
            this.env.PipelineOrchestratorAgent,
            userId,
        );
        await pipeline.recordStepOutcome(
            outcome.proposalId,
            outcome.orchestratorSessionId,
            resolvedOutcome,
        );
    }
}
```

**Updated code** -- use `userId:symbol` as the DO name:

```ts
try {
    const userId = this.name;
    if (outcome.orchestrationMode === 'debate') {
        const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
            this.env.DebateOrchestratorAgent,
            `${userId}:${outcome.symbol}`,
        );
        await debate.recordPersonaOutcome(
            outcome.proposalId,
            outcome.orchestratorSessionId,
            resolvedOutcome,
        );
    } else {
        const pipeline = await getAgentByName<Env, PipelineOrchestratorAgent>(
            this.env.PipelineOrchestratorAgent,
            `${userId}:${outcome.symbol}`,
        );
        await pipeline.recordStepOutcome(
            outcome.proposalId,
            outcome.orchestratorSessionId,
            resolvedOutcome,
        );
    }
}
```

**Change**: Append `:${outcome.symbol}` to the DO name to match the name used during analysis. This ensures `recordPersonaOutcome()` queries the same DO instance that has the `persona_analyses` data.

---

### 7. `resolveOrchestratorSessionId()` — Remove entirely

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 958-963

Delete the entire method:

```ts
// DELETE THIS METHOD
private resolveOrchestratorSessionId(proposal: TradeProposal, _mode: string): string {
    const userId = this.name;
    return `${userId}:${proposal.symbol}`;
}
```

No other code references this method. Removing it produces no compilation errors.

---

### 8. DDL Update — Add column to `CREATE TABLE`

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 1289-1312

Add `orchestrator_session_id TEXT` to the `CREATE TABLE IF NOT EXISTS trade_proposals` statement, after `outcome_status`:

```sql
CREATE TABLE IF NOT EXISTS trade_proposals (
    -- ... existing columns ...
    outcome_status    TEXT NOT NULL DEFAULT 'none',
    orchestrator_session_id TEXT
)
```

---

### 9. Migration Update — Add column for existing tables

**File**: `apps/data-service/src/agents/session-agent.ts`
**Lines**: 1374-1393

Add to the end of `migrateTradeProposals()`:

```ts
if (!columnNames.has('orchestrator_session_id')) {
    this.sql`ALTER TABLE trade_proposals ADD COLUMN orchestrator_session_id TEXT`;
}
```

---

## Error Handling

### Null session ID at outcome tracking time

If `proposal.orchestratorSessionId` is null (pre-fix proposals), `createOutcomeTracking()` still creates a `proposal_outcomes` row (for price tracking, P&L calculation) but with an empty `orchestrator_session_id`. When `distributeOutcome()` later processes this outcome, the empty session ID will still fail to match any orchestrator rows -- but this is exactly the current behavior, so there is no regression.

### Missing session ID in `distributeOutcome()`

The existing `catch` block (lines 1092-1094) already handles failures silently. If the session ID is empty or the orchestrator query returns zero rows, `recordPersonaOutcome()` simply does not insert any `persona_outcomes` and `recomputeScores()` is never called. This is the existing (broken) behavior for pre-fix data and will naturally resolve as new proposals are created with valid session IDs.

---

## Summary of Changes

| File | Change |
|------|--------|
| `packages/data-ops/src/agents/session/types.ts` | Add `orchestratorSessionId: string \| null` to `TradeProposal` |
| `apps/data-service/src/agents/session-agent-helpers.ts` | Add `orchestrator_session_id` to `ProposalRow`, add mapping in `rowToProposal()` |
| `apps/data-service/src/agents/session-agent.ts` | 9 changes: `runDebateAnalysis`, `runPipelineAnalysis`, `createProposal` signature + body, `storeProposal`, `createOutcomeTracking`, `distributeOutcome` DO names, remove `resolveOrchestratorSessionId`, DDL update, migration update |
