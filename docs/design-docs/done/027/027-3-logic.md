# Phase 27: Pipeline Confidence Threshold & Outcome Confidence Recording -- Part 3: Logic

## Fix 1: Confidence Gate in Pipeline Mode

### Modified: `RunPipelineParams` Interface

**File**: `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`

Add the optional `minConfidenceThreshold` field:

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
    minConfidenceThreshold?: number;    // NEW
}
```

The field is optional with a default applied at the usage site (see below). This maintains backward compatibility -- any existing caller that does not pass the field gets the same 0.7 default as `DEFAULT_SESSION_CONFIG.minConfidenceThreshold`.

### Modified: `executeStep('generate_proposal')`

**File**: `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`

**Current code** (lines 379-410):

```ts
case 'generate_proposal': {
    if (!ctx.riskValidation?.approved) {
        this.emitMessage(params, { type: 'system' }, 'proposal',
            'Risk validation rejected the trade. No proposal generated.');
        return;
    }

    if (!ctx.recommendation || ctx.recommendation.action === 'hold') {
        this.emitMessage(params, { type: 'system' }, 'proposal',
            'Recommendation is hold. No proposal generated.');
        return;
    }

    ctx.proposal = this.buildProposal(ctx, params);

    this.emitMessage(params, { type: 'system' }, 'proposal',
        `Trade proposal generated: ${ctx.proposal.action} ${ctx.proposal.symbol} (confidence: ${ctx.proposal.confidence})`);
    break;
}
```

**Updated code**:

```ts
case 'generate_proposal': {
    if (!ctx.riskValidation?.approved) {
        this.emitMessage(params, { type: 'system' }, 'proposal',
            'Risk validation rejected the trade. No proposal generated.');
        return;
    }

    if (!ctx.recommendation || ctx.recommendation.action === 'hold') {
        this.emitMessage(params, { type: 'system' }, 'proposal',
            'Recommendation is hold. No proposal generated.');
        return;
    }

    // Confidence gate: match debate mode behavior
    const threshold = params.minConfidenceThreshold ?? 0.7;
    if (ctx.recommendation.confidence < threshold) {
        this.emitMessage(params, { type: 'system' }, 'proposal',
            `Confidence ${ctx.recommendation.confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}. No proposal generated.`);
        return;
    }

    ctx.proposal = this.buildProposal(ctx, params);

    this.emitMessage(params, { type: 'system' }, 'proposal',
        `Trade proposal generated: ${ctx.proposal.action} ${ctx.proposal.symbol} (confidence: ${ctx.proposal.confidence})`);
    break;
}
```

**Why the gate goes here (not in SessionAgent)**:

The gate is placed before `buildProposal()` to avoid wasted computation. `buildProposal` reads risk validation data, computes position sizing, and creates a full `TradeProposal` object. If confidence is below threshold, none of that work is needed.

Additionally, placing the gate inside the pipeline orchestrator means the system message about the skipped proposal is emitted through the same `onMessage` callback as all other pipeline step messages, maintaining consistent UX.

### Modified: `SessionAgent.runPipelineAnalysis()`

**File**: `apps/data-service/src/agents/session-agent.ts`

**Current code** (lines 538-550):

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
    minConfidenceThreshold: config.minConfidenceThreshold,    // NEW
})) as RunPipelineResult;
```

The `config` parameter is `EffectiveConfig`, which already has `minConfidenceThreshold: number` (from `SessionConfig`, resolved in `resolveEffectiveConfig`). No new config resolution logic is needed.

---

## Fix 2: Record Actual Confidence in Pipeline Outcomes

### Modified: `recordStepOutcome` Signature

**File**: `apps/data-service/src/agents/pipeline-orchestrator-agent.ts`

**Current signature** (lines 216-219):

```ts
@callable()
async recordStepOutcome(
    proposalId: string,
    pipelineSessionId: string,
    outcome: { symbol: string; realizedPnl: number; realizedPnlPct: number; action: string },
): Promise<void> {
```

**Updated signature**:

```ts
@callable()
async recordStepOutcome(
    proposalId: string,
    pipelineSessionId: string,
    outcome: { symbol: string; realizedPnl: number; realizedPnlPct: number; action: string; confidence: number },
): Promise<void> {
```

The only change is adding `confidence: number` to the `outcome` object type.

### Modified: `recordStepOutcome` INSERT Statement

**Current code** (lines 238-245):

```ts
this.sql`INSERT INTO pipeline_outcomes
    (id, session_id, proposal_id, symbol, action, confidence,
     ta_signals_snapshot, realized_pnl, realized_pnl_pct,
     was_correct, resolved_at, created_at)
    VALUES (${crypto.randomUUID()}, ${pipelineSessionId}, ${proposalId},
        ${outcome.symbol}, ${outcome.action}, ${0},
        ${JSON.stringify(taSignals)}, ${outcome.realizedPnl}, ${outcome.realizedPnlPct},
        ${wasCorrect ? 1 : 0}, ${now}, ${now})`;
```

**Updated code**:

```ts
this.sql`INSERT INTO pipeline_outcomes
    (id, session_id, proposal_id, symbol, action, confidence,
     ta_signals_snapshot, realized_pnl, realized_pnl_pct,
     was_correct, resolved_at, created_at)
    VALUES (${crypto.randomUUID()}, ${pipelineSessionId}, ${proposalId},
        ${outcome.symbol}, ${outcome.action}, ${outcome.confidence},
        ${JSON.stringify(taSignals)}, ${outcome.realizedPnl}, ${outcome.realizedPnlPct},
        ${wasCorrect ? 1 : 0}, ${now}, ${now})`;
```

The only change: `${0}` becomes `${outcome.confidence}`.

### Modified: `SessionAgent.resolveOutcome()`

**File**: `apps/data-service/src/agents/session-agent.ts`

The `resolveOutcome` method needs to look up the proposal's confidence and pass it through to `distributeOutcome`.

**Current code** (lines 1018-1055, relevant section):

```ts
private async resolveOutcome(
    outcome: ProposalOutcome,
    broker: Pick<AlpacaBrokerAgent, 'getOrderHistory'>,
): Promise<void> {
    // ... exitOrder lookup, pnl computation ...

    this.sql`UPDATE proposal_outcomes SET
        status = 'resolved',
        exit_price = ${exitPrice},
        exit_reason = ${exitReason},
        realized_pnl = ${pnl},
        realized_pnl_pct = ${pnlPct},
        holding_duration_ms = ${now - outcome.createdAt},
        resolved_at = ${now}
        WHERE id = ${outcome.id}`;

    this.sql`UPDATE trade_proposals SET outcome_status = 'resolved'
        WHERE id = ${outcome.proposalId}`;

    await this.distributeOutcome(outcome, pnl, pnlPct);
}
```

**Updated code**:

```ts
private async resolveOutcome(
    outcome: ProposalOutcome,
    broker: Pick<AlpacaBrokerAgent, 'getOrderHistory'>,
): Promise<void> {
    // ... exitOrder lookup, pnl computation ...

    this.sql`UPDATE proposal_outcomes SET
        status = 'resolved',
        exit_price = ${exitPrice},
        exit_reason = ${exitReason},
        realized_pnl = ${pnl},
        realized_pnl_pct = ${pnlPct},
        holding_duration_ms = ${now - outcome.createdAt},
        resolved_at = ${now}
        WHERE id = ${outcome.id}`;

    this.sql`UPDATE trade_proposals SET outcome_status = 'resolved'
        WHERE id = ${outcome.proposalId}`;

    // Look up the proposal's confidence for outcome recording
    const proposalRows = this.sql<ProposalRow>`
        SELECT * FROM trade_proposals WHERE id = ${outcome.proposalId}`;
    const proposalConfidence = proposalRows[0]?.confidence ?? 0;

    await this.distributeOutcome(outcome, pnl, pnlPct, proposalConfidence);
}
```

Note: The `trade_proposals` row is already in DO SQLite (stored by `storeProposal` at proposal creation time). This lookup is a local SQLite read, not a network call. The `confidence` column in `trade_proposals` stores the actual value from `buildProposal` (which copies `rec.confidence` from the LLM recommendation).

### Modified: `SessionAgent.distributeOutcome()`

**Current code** (lines 1057-1095):

```ts
private async distributeOutcome(
    outcome: ProposalOutcome,
    pnl: number,
    pnlPct: number,
): Promise<void> {
    const resolvedOutcome = {
        symbol: outcome.symbol,
        realizedPnl: pnl,
        realizedPnlPct: pnlPct,
        action: outcome.action,
    };

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
    } catch {
        // Non-critical: outcome distribution failure shouldn't break tracking
    }
}
```

**Updated code**:

```ts
private async distributeOutcome(
    outcome: ProposalOutcome,
    pnl: number,
    pnlPct: number,
    confidence: number,
): Promise<void> {
    const resolvedOutcome = {
        symbol: outcome.symbol,
        realizedPnl: pnl,
        realizedPnlPct: pnlPct,
        action: outcome.action,
    };

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
                { ...resolvedOutcome, confidence },
            );
        }
    } catch {
        // Non-critical: outcome distribution failure shouldn't break tracking
    }
}
```

Key changes:
1. `confidence: number` added as fourth parameter
2. For the pipeline branch, `resolvedOutcome` is spread with `confidence` appended
3. For the debate branch, `resolvedOutcome` is unchanged -- `recordPersonaOutcome` does not expect a `confidence` field, and the debate orchestrator handles confidence differently via persona-level scoring

---

## Edge Cases

### Confidence Exactly at Threshold

The gate uses `<` (strictly less than), meaning `confidence === threshold` passes:

```ts
if (ctx.recommendation.confidence < threshold) { ... }
```

This matches debate mode, which uses `>=`:

```ts
if (consensus.confidence >= config.minConfidenceThreshold) {
    await this.createProposal(...);
}
```

Both conditions produce the same result: confidence at exactly the threshold generates a proposal.

### Threshold Set to 0

If `minConfidenceThreshold = 0`, the gate effectively disables -- any positive confidence passes. This is intentional and matches debate mode behavior.

### Threshold Set to 1

If `minConfidenceThreshold = 1.0`, only perfect confidence passes. Since LLM confidence values are typically in the range 0.5-0.95, this effectively disables proposal generation. This is the same behavior as debate mode.

### No Proposal Means No Outcome to Record

Fix 1 (confidence gate) and Fix 2 (outcome confidence) are independent but complementary. If the confidence gate prevents a proposal from being generated, there is no proposal to track, and `recordStepOutcome` is never called. The outcome recording fix only matters for proposals that pass all gates.

### Proposal Confidence is 0 (Degenerate LLM Response)

If the LLM returns `confidence: 0` and the user has `minConfidenceThreshold: 0`, the proposal is generated and the outcome would record `confidence: 0`. This is correct -- the recorded value matches the actual recommendation. This is different from the current bug where all outcomes are 0 regardless of actual confidence.

### Proposal Not Found During Outcome Resolution

If the `trade_proposals` lookup in `resolveOutcome` returns no rows (should not happen in normal operation), `proposalConfidence` defaults to `0`:

```ts
const proposalConfidence = proposalRows[0]?.confidence ?? 0;
```

This is a safe fallback. The `0` value is the same as the current buggy behavior, so there is no regression in this edge case.
