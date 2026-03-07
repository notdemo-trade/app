# Phase 20: SRP Multi-Agent Architecture Refactor — Part 7: Agent Memory, Learning & Scoring

## Overview

Adds outcome tracking, per-persona/pipeline memory, scoring, and memory-augmented prompts to the multi-agent system. Closes the feedback loop: agents learn from past proposals by correlating recommendations with realized P&L.

### Problem

1. **No feedback loop** — agents make recommendations but never learn if they were correct
2. **No scoring** — all personas weighted equally regardless of track record
3. **No pattern memory** — recurring mistakes repeated, successful patterns not reinforced
4. **No confidence calibration** — personas may be systematically over/under-confident

### Outcome

- Outcome tracking for every executed trade proposal
- Per-persona win rate, P&L, Sharpe ratio, and confidence calibration
- Pattern memory extracted from trade history (SQL aggregation, no ML)
- Memory-augmented prompts inject track record into persona and moderator context
- Scoring influences consensus weight and confidence dampening

---

## Architecture

### Ownership Model

| Component | Owner Agent | Rationale |
|-----------|------------|-----------|
| Outcome tracking | SessionAgent | Already owns `trade_proposals`, scheduled cycles, broker access |
| Persona memory & scores | DebateOrchestratorAgent | Co-located with debate sessions, fast SQLite reads |
| Pipeline memory & scores | PipelineOrchestratorAgent | Co-located with pipeline sessions |
| Memory-augmented prompts | LLMAnalysisAgent | Consumes scores/patterns, injects into prompts |

### Data Flow

```
placeOrder() succeeds
    |
    v
SessionAgent: create proposal_outcomes (status='tracking')
    |
    v
runOutcomeTrackingCycle() [every 5 min, market hours]
    |
    v
AlpacaBrokerAgent.getPositions() -> check if position closed
    |
    +-- Position closed -> calculate final P&L -> mark 'resolved'
    |                       |
    |                       v
    |                   Distribute outcome via RPC:
    |                       DebateOrchestratorAgent.recordPersonaOutcome()
    |                       PipelineOrchestratorAgent.recordStepOutcome()
    |
    +-- Position open -> record interim snapshot (unrealized P&L)
```

---

## SQLite Schemas

### SessionAgent — Outcome Tracking

New columns on existing `trade_proposals` table:

```sql
-- ALTER TABLE (applied in M8a migration)
ALTER TABLE trade_proposals ADD COLUMN order_id TEXT;
ALTER TABLE trade_proposals ADD COLUMN filled_qty REAL;
ALTER TABLE trade_proposals ADD COLUMN filled_avg_price REAL;
ALTER TABLE trade_proposals ADD COLUMN outcome_status TEXT NOT NULL DEFAULT 'none';
-- outcome_status: 'none' | 'tracking' | 'resolved'
```

New tables:

```sql
-- Tracks each executed proposal's P&L lifecycle
CREATE TABLE IF NOT EXISTS proposal_outcomes (
  id                TEXT PRIMARY KEY,
  proposal_id       TEXT NOT NULL REFERENCES trade_proposals(id),
  thread_id         TEXT NOT NULL REFERENCES discussion_threads(id),
  orchestration_mode TEXT NOT NULL,          -- 'debate' | 'pipeline'
  orchestrator_session_id TEXT NOT NULL,     -- debate_session or pipeline_session ID
  symbol            TEXT NOT NULL,
  action            TEXT NOT NULL,           -- 'buy' | 'sell'
  entry_price       REAL NOT NULL,
  entry_qty         REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'tracking',  -- 'tracking' | 'resolved'
  exit_price        REAL,
  exit_reason       TEXT,                    -- 'stop_loss' | 'target_hit' | 'manual_close' | 'time_exit'
  realized_pnl      REAL,
  realized_pnl_pct  REAL,
  holding_duration_ms INTEGER,
  resolved_at       INTEGER,
  created_at        INTEGER NOT NULL
);

-- Interim unrealized P&L snapshots for open positions
CREATE TABLE IF NOT EXISTS outcome_snapshots (
  id              TEXT PRIMARY KEY,
  outcome_id      TEXT NOT NULL REFERENCES proposal_outcomes(id),
  unrealized_pnl  REAL NOT NULL,
  unrealized_pnl_pct REAL NOT NULL,
  current_price   REAL NOT NULL,
  snapshot_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_status ON proposal_outcomes(status);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON proposal_outcomes(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_proposal ON proposal_outcomes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_outcome ON outcome_snapshots(outcome_id, snapshot_at DESC);
```

### DebateOrchestratorAgent — Persona Memory

```sql
-- Per-persona per-proposal outcome record
CREATE TABLE IF NOT EXISTS persona_outcomes (
  id              TEXT PRIMARY KEY,
  persona_id      TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES debate_sessions(id),
  proposal_id     TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  persona_action  TEXT NOT NULL,           -- what the persona recommended
  persona_confidence REAL NOT NULL,
  consensus_action TEXT NOT NULL,          -- what the consensus was
  realized_pnl    REAL NOT NULL,
  realized_pnl_pct REAL NOT NULL,
  was_correct     INTEGER NOT NULL,        -- 1 or 0
  resolved_at     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

-- Pre-computed rolling aggregates (materialized)
CREATE TABLE IF NOT EXISTS persona_scores (
  persona_id            TEXT NOT NULL,
  window_days           INTEGER NOT NULL,       -- 30, 90, 180
  total_proposals       INTEGER NOT NULL DEFAULT 0,
  correct_proposals     INTEGER NOT NULL DEFAULT 0,
  win_rate              REAL,                    -- correct / total
  avg_pnl_pct           REAL,
  stddev_pnl_pct        REAL,
  sharpe_ratio          REAL,                    -- avg / stddev
  confidence_calibration REAL,                   -- Pearson(confidence, was_correct)
  best_symbol           TEXT,
  best_symbol_pnl_pct   REAL,
  worst_symbol          TEXT,
  worst_symbol_pnl_pct  REAL,
  computed_at           INTEGER NOT NULL,
  PRIMARY KEY (persona_id, window_days)
);

-- Learned patterns from past trades
CREATE TABLE IF NOT EXISTS persona_patterns (
  id              TEXT PRIMARY KEY,
  persona_id      TEXT NOT NULL,
  pattern_type    TEXT NOT NULL,              -- 'indicator_outcome' | 'market_regime' | 'sector' | 'symbol'
  pattern_key     TEXT NOT NULL,              -- e.g. 'RSI>70:BUY', 'tech_sector:SELL'
  description     TEXT NOT NULL,              -- human-readable summary
  sample_size     INTEGER NOT NULL,
  success_rate    REAL NOT NULL,
  avg_pnl_pct     REAL NOT NULL,
  last_updated_at INTEGER NOT NULL,
  UNIQUE (persona_id, pattern_type, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_persona_outcomes_persona ON persona_outcomes(persona_id, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_persona_outcomes_symbol ON persona_outcomes(persona_id, symbol);
CREATE INDEX IF NOT EXISTS idx_persona_patterns_persona ON persona_patterns(persona_id, pattern_type);
```

### PipelineOrchestratorAgent — Pipeline Memory

```sql
-- Per-pipeline outcome with TA signals snapshot
CREATE TABLE IF NOT EXISTS pipeline_outcomes (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES pipeline_sessions(id),
  proposal_id       TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  action            TEXT NOT NULL,
  confidence        REAL NOT NULL,
  ta_signals_snapshot TEXT NOT NULL DEFAULT '[]',  -- JSON: signals at time of analysis
  realized_pnl      REAL NOT NULL,
  realized_pnl_pct  REAL NOT NULL,
  was_correct       INTEGER NOT NULL,
  resolved_at       INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);

-- Pre-computed rolling aggregates (same windows as persona)
CREATE TABLE IF NOT EXISTS pipeline_scores (
  strategy_id           TEXT NOT NULL,
  window_days           INTEGER NOT NULL,       -- 30, 90, 180
  total_proposals       INTEGER NOT NULL DEFAULT 0,
  correct_proposals     INTEGER NOT NULL DEFAULT 0,
  win_rate              REAL,
  avg_pnl_pct           REAL,
  stddev_pnl_pct        REAL,
  sharpe_ratio          REAL,
  best_symbol           TEXT,
  best_symbol_pnl_pct   REAL,
  worst_symbol          TEXT,
  worst_symbol_pnl_pct  REAL,
  computed_at           INTEGER NOT NULL,
  PRIMARY KEY (strategy_id, window_days)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_outcomes_symbol ON pipeline_outcomes(symbol, created_at DESC);
```

---

## Type Definitions

```ts
// packages/data-ops/src/agents/memory/types.ts

export type OutcomeStatus = 'none' | 'tracking' | 'resolved'
export type ExitReason = 'stop_loss' | 'target_hit' | 'manual_close' | 'time_exit'
export type PatternType = 'indicator_outcome' | 'market_regime' | 'sector' | 'symbol'
export type CalibrationRating = 'good' | 'fair' | 'poor'
export type ScoreWindow = 30 | 90 | 180

export interface ProposalOutcome {
  id: string
  proposalId: string
  threadId: string
  orchestrationMode: 'debate' | 'pipeline'
  orchestratorSessionId: string
  symbol: string
  action: 'buy' | 'sell'
  entryPrice: number
  entryQty: number
  status: 'tracking' | 'resolved'
  exitPrice: number | null
  exitReason: ExitReason | null
  realizedPnl: number | null
  realizedPnlPct: number | null
  holdingDurationMs: number | null
  resolvedAt: number | null
  createdAt: number
}

export interface OutcomeSnapshot {
  id: string
  outcomeId: string
  unrealizedPnl: number
  unrealizedPnlPct: number
  currentPrice: number
  snapshotAt: number
}

export interface PersonaOutcomeRecord {
  id: string
  personaId: string
  sessionId: string
  proposalId: string
  symbol: string
  personaAction: string
  personaConfidence: number
  consensusAction: string
  realizedPnl: number
  realizedPnlPct: number
  wasCorrect: boolean
  resolvedAt: number
  createdAt: number
}

export interface PersonaScore {
  personaId: string
  windowDays: ScoreWindow
  totalProposals: number
  correctProposals: number
  winRate: number | null
  avgPnlPct: number | null
  stddevPnlPct: number | null
  sharpeRatio: number | null
  confidenceCalibration: number | null
  bestSymbol: string | null
  bestSymbolPnlPct: number | null
  worstSymbol: string | null
  worstSymbolPnlPct: number | null
  computedAt: number
}

export interface PersonaPattern {
  id: string
  personaId: string
  patternType: PatternType
  patternKey: string
  description: string
  sampleSize: number
  successRate: number
  avgPnlPct: number
  lastUpdatedAt: number
}

export interface PerformanceContext {
  personaId: string
  windowDays: ScoreWindow
  score: PersonaScore | null
  symbolRecord: { totalCalls: number; correctCalls: number; avgPnlPct: number } | null
  patterns: PersonaPattern[]
}

export interface PersonaComparisonRow {
  personaId: string
  name: string
  winRate: number | null
  avgReturn: number | null
  sharpeRatio: number | null
  calibration: CalibrationRating
}

export interface PipelineScore {
  strategyId: string
  windowDays: ScoreWindow
  totalProposals: number
  correctProposals: number
  winRate: number | null
  avgPnlPct: number | null
  stddevPnlPct: number | null
  sharpeRatio: number | null
  bestSymbol: string | null
  bestSymbolPnlPct: number | null
  worstSymbol: string | null
  worstSymbolPnlPct: number | null
  computedAt: number
}
```

---

## Zod Schemas

```ts
// packages/data-ops/src/agents/memory/schema.ts

import { z } from 'zod'

export const ScoreWindowSchema = z.union([z.literal(30), z.literal(90), z.literal(180)])

export const ProposalOutcomeSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  threadId: z.string(),
  orchestrationMode: z.enum(['debate', 'pipeline']),
  orchestratorSessionId: z.string(),
  symbol: z.string(),
  action: z.enum(['buy', 'sell']),
  entryPrice: z.number(),
  entryQty: z.number(),
  status: z.enum(['tracking', 'resolved']),
  exitPrice: z.number().nullable(),
  exitReason: z.enum(['stop_loss', 'target_hit', 'manual_close', 'time_exit']).nullable(),
  realizedPnl: z.number().nullable(),
  realizedPnlPct: z.number().nullable(),
  holdingDurationMs: z.number().nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number(),
})

export const PersonaOutcomeRecordSchema = z.object({
  personaId: z.string(),
  sessionId: z.string(),
  proposalId: z.string(),
  symbol: z.string(),
  personaAction: z.string(),
  personaConfidence: z.number(),
  consensusAction: z.string(),
  realizedPnl: z.number(),
  realizedPnlPct: z.number(),
  wasCorrect: z.boolean(),
  resolvedAt: z.number(),
})

export const PersonaScoreSchema = z.object({
  personaId: z.string(),
  windowDays: ScoreWindowSchema,
  totalProposals: z.number(),
  correctProposals: z.number(),
  winRate: z.number().nullable(),
  avgPnlPct: z.number().nullable(),
  sharpeRatio: z.number().nullable(),
  confidenceCalibration: z.number().nullable(),
  bestSymbol: z.string().nullable(),
  worstSymbol: z.string().nullable(),
})

export const PersonaPatternSchema = z.object({
  personaId: z.string(),
  patternType: z.enum(['indicator_outcome', 'market_regime', 'sector', 'symbol']),
  patternKey: z.string(),
  description: z.string(),
  sampleSize: z.number(),
  successRate: z.number(),
  avgPnlPct: z.number(),
})

export const PerformanceContextSchema = z.object({
  personaId: z.string(),
  windowDays: ScoreWindowSchema,
  score: PersonaScoreSchema.nullable(),
  symbolRecord: z.object({
    totalCalls: z.number(),
    correctCalls: z.number(),
    avgPnlPct: z.number(),
  }).nullable(),
  patterns: z.array(PersonaPatternSchema),
})
```

---

## Business Logic

### SessionAgent — Outcome Tracking

#### After Trade Execution

```ts
// In executeTrade tool handler, after placeOrder() succeeds:
private async createOutcomeTracking(
  proposal: TradeProposal,
  orderResult: OrderResult
): Promise<void> {
  // Update proposal with order details
  this.sql`UPDATE trade_proposals
    SET order_id = ${orderResult.id},
        filled_qty = ${orderResult.filledQty},
        filled_avg_price = ${orderResult.filledAvgPrice},
        outcome_status = 'tracking'
    WHERE id = ${proposal.id}`

  // Create outcome record
  const outcomeId = crypto.randomUUID()
  this.sql`INSERT INTO proposal_outcomes
    (id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
     symbol, action, entry_price, entry_qty, status, created_at)
    VALUES (${outcomeId}, ${proposal.id}, ${proposal.threadId},
            ${this.getOrchestrationMode(proposal)}, ${this.getOrchestratorSessionId(proposal)},
            ${proposal.symbol}, ${proposal.action},
            ${orderResult.filledAvgPrice}, ${orderResult.filledQty},
            'tracking', ${Date.now()})`
}
```

#### Outcome Tracking Cycle

```ts
// Scheduled every 5 min during market hours
async runOutcomeTrackingCycle(): Promise<void> {
  const broker = await getAgentByName<AlpacaBrokerAgent>(
    this.env.AlpacaBrokerAgent, this.getUserId()
  )

  // Check if market is open
  const clock = await broker.getClock()
  if (!clock.isOpen) return

  // Get all tracking outcomes
  const tracking = this.sql<ProposalOutcome[]>`
    SELECT * FROM proposal_outcomes WHERE status = 'tracking'`

  const positions = await broker.getPositions()
  const positionMap = new Map(positions.map(p => [p.symbol, p]))

  for (const outcome of tracking) {
    const position = positionMap.get(outcome.symbol)

    if (!position || position.qty === 0) {
      // Position closed — resolve outcome
      await this.resolveOutcome(outcome, broker)
    } else {
      // Position open — record snapshot
      this.recordSnapshot(outcome, position)
    }
  }
}

private async resolveOutcome(
  outcome: ProposalOutcome,
  broker: AlpacaBrokerAgent
): Promise<void> {
  // Get fill data from order history
  const orders = await broker.getOrderHistory(outcome.symbol)
  const exitOrder = this.findExitOrder(orders, outcome)

  const exitPrice = exitOrder?.filledAvgPrice ?? outcome.entryPrice
  const pnl = outcome.action === 'buy'
    ? (exitPrice - outcome.entryPrice) * outcome.entryQty
    : (outcome.entryPrice - exitPrice) * outcome.entryQty
  const pnlPct = ((exitPrice - outcome.entryPrice) / outcome.entryPrice) *
    (outcome.action === 'buy' ? 1 : -1)

  const exitReason = this.determineExitReason(exitOrder, outcome)
  const now = Date.now()

  this.sql`UPDATE proposal_outcomes SET
    status = 'resolved',
    exit_price = ${exitPrice},
    exit_reason = ${exitReason},
    realized_pnl = ${pnl},
    realized_pnl_pct = ${pnlPct},
    holding_duration_ms = ${now - outcome.createdAt},
    resolved_at = ${now}
    WHERE id = ${outcome.id}`

  this.sql`UPDATE trade_proposals SET outcome_status = 'resolved'
    WHERE id = ${outcome.proposalId}`

  // Distribute outcome to originating orchestrator
  await this.distributeOutcome(outcome, pnl, pnlPct)
}

private async distributeOutcome(
  outcome: ProposalOutcome,
  pnl: number,
  pnlPct: number
): Promise<void> {
  const resolvedOutcome = { ...outcome, realizedPnl: pnl, realizedPnlPct: pnlPct }

  if (outcome.orchestrationMode === 'debate') {
    const debate = await getAgentByName<DebateOrchestratorAgent>(
      this.env.DebateOrchestratorAgent, this.getUserId()
    )
    await debate.recordPersonaOutcome(
      outcome.proposalId,
      outcome.orchestratorSessionId,
      resolvedOutcome
    )
  } else {
    const pipeline = await getAgentByName<PipelineOrchestratorAgent>(
      this.env.PipelineOrchestratorAgent, this.getUserId()
    )
    await pipeline.recordStepOutcome(
      outcome.proposalId,
      outcome.orchestratorSessionId,
      resolvedOutcome
    )
  }
}

private recordSnapshot(outcome: ProposalOutcome, position: BrokerPosition): void {
  const unrealizedPnl = position.unrealizedPl
  const unrealizedPnlPct = position.unrealizedPlpc

  this.sql`INSERT INTO outcome_snapshots
    (id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
    VALUES (${crypto.randomUUID()}, ${outcome.id}, ${unrealizedPnl},
            ${unrealizedPnlPct}, ${position.currentPrice}, ${Date.now()})`
}
```

#### Exit Reason Detection

```ts
private determineExitReason(
  exitOrder: OrderLogEntry | undefined,
  outcome: ProposalOutcome
): ExitReason {
  if (!exitOrder) return 'manual_close'

  // Check proposal's stop/target against exit price
  const proposal = this.sql<TradeProposal[]>`
    SELECT * FROM trade_proposals WHERE id = ${outcome.proposalId}`[0]

  if (proposal?.stopLoss && exitOrder.filledAvgPrice <= proposal.stopLoss) {
    return 'stop_loss'
  }
  if (proposal?.targetPrice && exitOrder.filledAvgPrice >= proposal.targetPrice) {
    return 'target_hit'
  }
  return 'manual_close'
}
```

### DebateOrchestratorAgent — Persona Memory

#### Recording Outcomes

```ts
// New RPC method — called by SessionAgent on outcome resolution
async recordPersonaOutcome(
  proposalId: string,
  debateSessionId: string,
  outcome: { symbol: string; realizedPnl: number; realizedPnlPct: number; action: string }
): Promise<void> {
  // Look up all persona analyses for this debate session
  const analyses = this.sql<PersonaAnalysis[]>`
    SELECT * FROM persona_analyses WHERE session_id = ${debateSessionId}`

  const consensus = this.sql<ConsensusResult[]>`
    SELECT * FROM consensus_results WHERE session_id = ${debateSessionId}`[0]

  const now = Date.now()

  for (const analysis of analyses) {
    // Determine correctness:
    // BUY recommendation + positive P&L = correct
    // SELL recommendation + negative P&L (avoided loss) = correct
    // HOLD recommendation + small P&L (within 1%) = correct
    const wasCorrect = this.evaluateCorrectness(
      analysis.action, analysis.confidence, outcome.realizedPnlPct
    )

    this.sql`INSERT INTO persona_outcomes
      (id, persona_id, session_id, proposal_id, symbol,
       persona_action, persona_confidence, consensus_action,
       realized_pnl, realized_pnl_pct, was_correct, resolved_at, created_at)
      VALUES (${crypto.randomUUID()}, ${analysis.personaId}, ${debateSessionId},
              ${proposalId}, ${outcome.symbol},
              ${analysis.action}, ${analysis.confidence}, ${consensus?.action ?? 'unknown'},
              ${outcome.realizedPnl}, ${outcome.realizedPnlPct},
              ${wasCorrect ? 1 : 0}, ${now}, ${now})`
  }

  // Recompute scores for all affected personas
  const personaIds = [...new Set(analyses.map(a => a.personaId))]
  for (const personaId of personaIds) {
    await this.recomputeScores(personaId)
    await this.updatePatterns(personaId)
  }
}

private evaluateCorrectness(
  personaAction: string,
  _confidence: number,
  realizedPnlPct: number
): boolean {
  switch (personaAction) {
    case 'buy':
      return realizedPnlPct > 0
    case 'sell':
      return realizedPnlPct < 0  // avoided loss
    case 'hold':
      return Math.abs(realizedPnlPct) < 0.01  // within 1%
    default:
      return false
  }
}
```

#### Score Recomputation

```ts
private async recomputeScores(personaId: string): Promise<void> {
  const windows: ScoreWindow[] = [30, 90, 180]
  const now = Date.now()

  for (const windowDays of windows) {
    const cutoff = now - windowDays * 24 * 60 * 60 * 1000

    const outcomes = this.sql<PersonaOutcomeRecord[]>`
      SELECT * FROM persona_outcomes
      WHERE persona_id = ${personaId} AND resolved_at >= ${cutoff}`

    if (outcomes.length === 0) {
      this.sql`DELETE FROM persona_scores
        WHERE persona_id = ${personaId} AND window_days = ${windowDays}`
      continue
    }

    const total = outcomes.length
    const correct = outcomes.filter(o => o.was_correct).length
    const winRate = correct / total

    const pnls = outcomes.map(o => o.realized_pnl_pct)
    const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length
    const stddev = Math.sqrt(
      pnls.reduce((sum, p) => sum + (p - avgPnl) ** 2, 0) / pnls.length
    )
    const sharpe = stddev > 0 ? avgPnl / stddev : null

    // Confidence calibration: Pearson correlation(confidence, was_correct)
    const calibration = this.computeCalibration(outcomes)

    // Best/worst symbol
    const { best, worst } = this.computeSymbolExtremes(outcomes)

    this.sql`INSERT OR REPLACE INTO persona_scores
      (persona_id, window_days, total_proposals, correct_proposals,
       win_rate, avg_pnl_pct, stddev_pnl_pct, sharpe_ratio,
       confidence_calibration, best_symbol, best_symbol_pnl_pct,
       worst_symbol, worst_symbol_pnl_pct, computed_at)
      VALUES (${personaId}, ${windowDays}, ${total}, ${correct},
              ${winRate}, ${avgPnl}, ${stddev}, ${sharpe},
              ${calibration}, ${best?.symbol ?? null}, ${best?.pnlPct ?? null},
              ${worst?.symbol ?? null}, ${worst?.pnlPct ?? null}, ${now})`
  }
}

private computeCalibration(
  outcomes: PersonaOutcomeRecord[]
): number | null {
  if (outcomes.length < 5) return null

  const n = outcomes.length
  const confidences = outcomes.map(o => o.persona_confidence)
  const corrects = outcomes.map(o => o.was_correct ? 1 : 0)

  const meanC = confidences.reduce((a, b) => a + b, 0) / n
  const meanW = corrects.reduce((a, b) => a + b, 0) / n

  let num = 0, denC = 0, denW = 0
  for (let i = 0; i < n; i++) {
    const dc = confidences[i] - meanC
    const dw = corrects[i] - meanW
    num += dc * dw
    denC += dc * dc
    denW += dw * dw
  }

  const den = Math.sqrt(denC * denW)
  return den > 0 ? num / den : null
}

private computeSymbolExtremes(
  outcomes: PersonaOutcomeRecord[]
): { best: { symbol: string; pnlPct: number } | null; worst: { symbol: string; pnlPct: number } | null } {
  const bySymbol = new Map<string, number[]>()
  for (const o of outcomes) {
    const arr = bySymbol.get(o.symbol) ?? []
    arr.push(o.realized_pnl_pct)
    bySymbol.set(o.symbol, arr)
  }

  let best: { symbol: string; pnlPct: number } | null = null
  let worst: { symbol: string; pnlPct: number } | null = null

  for (const [symbol, pnls] of bySymbol) {
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length
    if (!best || avg > best.pnlPct) best = { symbol, pnlPct: avg }
    if (!worst || avg < worst.pnlPct) worst = { symbol, pnlPct: avg }
  }

  return { best, worst }
}
```

#### Pattern Extraction

```ts
private async updatePatterns(personaId: string): Promise<void> {
  const now = Date.now()
  const cutoff = now - 180 * 24 * 60 * 60 * 1000  // 180-day window

  // Pattern: per-symbol outcomes
  const symbolPatterns = this.sql<{ symbol: string; cnt: number; wins: number; avg_pnl: number }[]>`
    SELECT symbol, COUNT(*) as cnt, SUM(was_correct) as wins,
           AVG(realized_pnl_pct) as avg_pnl
    FROM persona_outcomes
    WHERE persona_id = ${personaId} AND resolved_at >= ${cutoff}
    GROUP BY symbol
    HAVING cnt >= 5`

  for (const sp of symbolPatterns) {
    const successRate = sp.wins / sp.cnt
    const description = `${sp.symbol}: ${sp.wins}/${sp.cnt} correct, avg ${(sp.avg_pnl * 100).toFixed(1)}%`

    this.sql`INSERT OR REPLACE INTO persona_patterns
      (id, persona_id, pattern_type, pattern_key, description,
       sample_size, success_rate, avg_pnl_pct, last_updated_at)
      VALUES (${`${personaId}:symbol:${sp.symbol}`}, ${personaId}, 'symbol', ${sp.symbol},
              ${description}, ${sp.cnt}, ${successRate}, ${sp.avg_pnl}, ${now})`
  }

  // Pattern: per-action outcomes (indicator-based)
  // Extracted by joining persona_outcomes with persona_analyses metadata
  const actionPatterns = this.sql<{ action: string; cnt: number; wins: number; avg_pnl: number }[]>`
    SELECT po.persona_action as action, COUNT(*) as cnt, SUM(po.was_correct) as wins,
           AVG(po.realized_pnl_pct) as avg_pnl
    FROM persona_outcomes po
    WHERE po.persona_id = ${personaId} AND po.resolved_at >= ${cutoff}
    GROUP BY po.persona_action
    HAVING cnt >= 5`

  for (const ap of actionPatterns) {
    const successRate = ap.wins / ap.cnt
    const description = `${ap.action.toUpperCase()} calls: ${ap.wins}/${ap.cnt} correct, avg ${(ap.avg_pnl * 100).toFixed(1)}%`

    this.sql`INSERT OR REPLACE INTO persona_patterns
      (id, persona_id, pattern_type, pattern_key, description,
       sample_size, success_rate, avg_pnl_pct, last_updated_at)
      VALUES (${`${personaId}:action:${ap.action}`}, ${personaId}, 'indicator_outcome', ${`action:${ap.action}`},
              ${description}, ${ap.cnt}, ${successRate}, ${ap.avg_pnl}, ${now})`
  }

  // Remove stale patterns (below minimum sample size after window shift)
  this.sql`DELETE FROM persona_patterns
    WHERE persona_id = ${personaId} AND sample_size < 5`
}
```

#### RPC Methods

```ts
// Query pre-computed scores
async getPersonaScores(windowDays: ScoreWindow): Promise<PersonaScore[]> {
  return this.sql<PersonaScore[]>`
    SELECT * FROM persona_scores WHERE window_days = ${windowDays}`
}

// Query patterns for a persona + optional symbol filter
async getPersonaPatterns(personaId: string, symbol?: string): Promise<PersonaPattern[]> {
  if (symbol) {
    return this.sql<PersonaPattern[]>`
      SELECT * FROM persona_patterns
      WHERE persona_id = ${personaId}
        AND (pattern_type != 'symbol' OR pattern_key = ${symbol})
      ORDER BY sample_size DESC`
  }
  return this.sql<PersonaPattern[]>`
    SELECT * FROM persona_patterns
    WHERE persona_id = ${personaId}
    ORDER BY sample_size DESC`
}
```

### PipelineOrchestratorAgent — Pipeline Memory

```ts
// New RPC method — called by SessionAgent on outcome resolution
async recordStepOutcome(
  proposalId: string,
  pipelineSessionId: string,
  outcome: { symbol: string; realizedPnl: number; realizedPnlPct: number; action: string }
): Promise<void> {
  const session = this.sql<PipelineSession[]>`
    SELECT * FROM pipeline_sessions WHERE id = ${pipelineSessionId}`[0]
  if (!session) return

  // Get TA signals snapshot from pipeline steps
  const taStep = this.sql<PipelineStep[]>`
    SELECT * FROM pipeline_steps
    WHERE session_id = ${pipelineSessionId} AND name = 'technical_analysis'`[0]

  const taSignals = taStep?.output ? JSON.parse(taStep.output).signals ?? [] : []
  const wasCorrect = outcome.action === 'buy' ? outcome.realizedPnlPct > 0 : outcome.realizedPnlPct < 0
  const now = Date.now()

  this.sql`INSERT INTO pipeline_outcomes
    (id, session_id, proposal_id, symbol, action, confidence,
     ta_signals_snapshot, realized_pnl, realized_pnl_pct,
     was_correct, resolved_at, created_at)
    VALUES (${crypto.randomUUID()}, ${pipelineSessionId}, ${proposalId},
            ${outcome.symbol}, ${outcome.action}, ${0},
            ${JSON.stringify(taSignals)}, ${outcome.realizedPnl}, ${outcome.realizedPnlPct},
            ${wasCorrect ? 1 : 0}, ${now}, ${now})`

  await this.recomputePipelineScores(session.strategyId)
}

async getPipelineScores(windowDays: ScoreWindow): Promise<PipelineScore[]> {
  return this.sql<PipelineScore[]>`
    SELECT * FROM pipeline_scores WHERE window_days = ${windowDays}`
}
```

---

## Memory-Augmented Prompts

### Performance Context Builder

```ts
// In LLMAnalysisAgent or DebateOrchestratorAgent

const PERFORMANCE_CONTEXT_MAX_CHARS = 2000

function buildPerformanceContext(
  context: PerformanceContext,
  symbol: string
): string {
  if (!context.score || context.score.totalProposals < 5) {
    return ''  // Cold start: omit until >= 5 resolved outcomes
  }

  const parts: string[] = []

  // Section 1: Overall performance (~200 chars)
  const s = context.score
  const calibrationRating = getCalibrationRating(s.confidenceCalibration)
  parts.push(`## Your Recent Performance (${s.windowDays}-day)`)
  parts.push(`- Win rate: ${(s.winRate! * 100).toFixed(0)}% (${s.correctProposals}/${s.totalProposals})`)
  parts.push(`- Avg return per trade: ${s.avgPnlPct! >= 0 ? '+' : ''}${(s.avgPnlPct! * 100).toFixed(1)}%`)
  if (s.sharpeRatio !== null) {
    parts.push(`- Sharpe ratio: ${s.sharpeRatio.toFixed(2)}`)
  }
  if (calibrationRating === 'poor') {
    parts.push(`- WARNING: Your confidence scores have been poorly calibrated`)
  }

  // Section 2: Symbol-specific record (~100 chars)
  if (context.symbolRecord && context.symbolRecord.totalCalls >= 3) {
    const sr = context.symbolRecord
    parts.push('')
    parts.push(`## Your track record on ${symbol}`)
    parts.push(`- ${sr.totalCalls} previous calls, ${sr.correctCalls} correct`)
    parts.push(`- Avg return: ${sr.avgPnlPct >= 0 ? '+' : ''}${(sr.avgPnlPct * 100).toFixed(1)}%`)
  }

  // Section 3: Patterns (~150 chars each, variable count)
  const relevantPatterns = context.patterns
    .filter(p => p.sampleSize >= 5)
    .sort((a, b) => b.sampleSize - a.sampleSize)

  if (relevantPatterns.length > 0) {
    parts.push('')
    parts.push(`## Lessons from past trades`)
    for (const pattern of relevantPatterns) {
      const line = `- ${pattern.description} (sample: ${pattern.sampleSize}, success: ${(pattern.successRate * 100).toFixed(0)}%)`
      // Check budget before adding
      const current = parts.join('\n')
      if (current.length + line.length + 1 > PERFORMANCE_CONTEXT_MAX_CHARS) break
      parts.push(line)
    }
  }

  const result = parts.join('\n')
  return result.slice(0, PERFORMANCE_CONTEXT_MAX_CHARS)
}

function getCalibrationRating(calibration: number | null): CalibrationRating {
  if (calibration === null) return 'fair'
  if (calibration >= 0.5) return 'good'
  if (calibration >= 0.2) return 'fair'
  return 'poor'
}
```

### Extended `analyzeAsPersona()` Signature

```ts
// Updated signature in LLMAnalysisAgent
async analyzeAsPersona(
  persona: PersonaConfig,
  data: { symbol: string; signals: TechnicalSignal[]; indicators: TechnicalIndicators },
  strategy: StrategyTemplate,
  performanceContext?: PerformanceContext  // NEW — optional for backward compat
): Promise<PersonaAnalysis> {
  const perfBlock = performanceContext
    ? buildPerformanceContext(performanceContext, data.symbol)
    : ''

  const systemPrompt = perfBlock
    ? `${persona.systemPrompt}\n\n${perfBlock}`
    : persona.systemPrompt

  const messages: CompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: this.buildPersonaPrompt(data, strategy) },
  ]

  // ... rest unchanged
}
```

### Extended `synthesizeConsensus()` with Persona Comparison

```ts
// Updated signature in LLMAnalysisAgent
async synthesizeConsensus(
  analyses: PersonaAnalysis[],
  debateRounds: DebateRound[],
  moderatorPrompt: string,
  personaComparison?: PersonaComparisonRow[]  // NEW
): Promise<ConsensusResult> {
  let enrichedPrompt = moderatorPrompt

  if (personaComparison && personaComparison.length > 0) {
    const table = buildPersonaComparisonTable(personaComparison)
    enrichedPrompt = `${moderatorPrompt}\n\n${table}`
  }

  const messages: CompletionMessage[] = [
    { role: 'system', content: enrichedPrompt },
    { role: 'user', content: this.buildConsensusPrompt(analyses, debateRounds) },
  ]

  // ... rest unchanged
}

function buildPersonaComparisonTable(rows: PersonaComparisonRow[]): string {
  const lines = [
    '## Analyst Track Records (30-day)',
    '| Analyst | Win Rate | Avg Return | Sharpe | Calibration |',
    '|---------|----------|------------|--------|-------------|',
  ]

  for (const row of rows) {
    const winRate = row.winRate !== null ? `${(row.winRate * 100).toFixed(0)}%` : 'N/A'
    const avgReturn = row.avgReturn !== null ? `${row.avgReturn >= 0 ? '+' : ''}${(row.avgReturn * 100).toFixed(1)}%` : 'N/A'
    const sharpe = row.sharpeRatio !== null ? row.sharpeRatio.toFixed(2) : 'N/A'
    const calibration = row.calibration.charAt(0).toUpperCase() + row.calibration.slice(1)
    lines.push(`| ${row.name} | ${winRate} | ${avgReturn} | ${sharpe} | ${calibration} |`)
  }

  lines.push('')
  lines.push('Weight analysts with better track records more heavily.')

  return lines.join('\n')
}
```

### Confidence Dampening

```ts
// In DebateOrchestratorAgent, during consensus phase
function applyConfidenceDampening(
  analysis: PersonaAnalysis,
  score: PersonaScore | null
): PersonaAnalysis {
  if (!score || score.totalProposals < 5) return analysis  // cold start, no dampening

  const calibration = getCalibrationRating(score.confidenceCalibration)

  const multiplier = calibration === 'good' ? 1.0
    : calibration === 'fair' ? 0.8
    : 0.5  // poor

  return {
    ...analysis,
    confidence: analysis.confidence * multiplier,
  }
}
```

### Integration into `runDebate()`

```ts
// In DebateOrchestratorAgent.runDebate() — Phase 1 modification
// After getting analyses, before debate rounds:

// Fetch performance context for each persona
const scores = await this.getPersonaScores(30)
const scoreMap = new Map(scores.map(s => [s.personaId, s]))

// Inject performance context into analyzeAsPersona calls
const analyses = await Promise.all(
  params.config.personas.map(async (persona) => {
    const score = scoreMap.get(persona.id) ?? null
    const patterns = await this.getPersonaPatterns(persona.id, params.symbol)
    const symbolRecord = this.getSymbolRecord(persona.id, params.symbol)

    const perfContext: PerformanceContext = {
      personaId: persona.id,
      windowDays: 30,
      score,
      symbolRecord,
      patterns,
    }

    const analysis = await llm.analyzeAsPersona(persona, data, params.strategy, perfContext)
    // ... store analysis, broadcast message (unchanged)
    return analysis
  })
)

// Apply confidence dampening before consensus
const dampenedAnalyses = analyses.map(a => {
  const score = scoreMap.get(a.personaId) ?? null
  return applyConfidenceDampening(a, score)
})

// Build persona comparison for moderator
const comparison: PersonaComparisonRow[] = params.config.personas.map(persona => {
  const score = scoreMap.get(persona.id)
  return {
    personaId: persona.id,
    name: persona.name,
    winRate: score?.winRate ?? null,
    avgReturn: score?.avgPnlPct ?? null,
    sharpeRatio: score?.sharpeRatio ?? null,
    calibration: getCalibrationRating(score?.confidenceCalibration ?? null),
  }
})

// Pass to consensus synthesis
const consensus = await llm.synthesizeConsensus(
  dampenedAnalyses, debateRounds, params.config.moderatorPrompt, comparison
)
```

---

## Scheduling

### New Scheduled Cycle in SessionAgent

```ts
// Added in onStart() alongside existing scheduled cycles
async onStart() {
  // ... existing table init, defaults seeding ...

  if (this.state.enabled) {
    // Existing analysis cycle
    this.scheduleEvery('runScheduledCycle', `*/2 * * * *`)

    // NEW: Outcome tracking (every 5 min, checked for market hours inside)
    this.scheduleEvery('runOutcomeTrackingCycle', '*/5 * * * *')
  }
}
```

---

## Inter-Agent Communication (additions to Part 3 table)

| Caller | Callee | Method | Mechanism |
|--------|--------|--------|-----------|
| SessionAgent | DebateOrchestratorAgent | `recordPersonaOutcome()` | DO RPC via `getAgentByName()` |
| SessionAgent | PipelineOrchestratorAgent | `recordStepOutcome()` | DO RPC via `getAgentByName()` |
| DebateOrchestratorAgent | self | `getPersonaScores()`, `getPersonaPatterns()` | Local method call |
| DebateOrchestratorAgent | LLMAnalysisAgent | `analyzeAsPersona()` (extended) | DO RPC via `getAgentByName()` |
| DebateOrchestratorAgent | LLMAnalysisAgent | `synthesizeConsensus()` (extended) | DO RPC via `getAgentByName()` |

---

## Cold Start Behavior

| Condition | Behavior |
|-----------|----------|
| < 5 resolved outcomes per persona | No performance context injected into persona prompt |
| < 5 resolved outcomes total | No persona comparison table for moderator |
| < 5 samples for a pattern | Pattern excluded from prompt (minimum sample size) |
| No scores computed yet | Confidence dampening skipped (multiplier = 1.0) |
| First debate after M8 deployment | Identical behavior to pre-M8 (graceful fallback) |

---

## Position Attribution

Multiple proposals for the same symbol are tracked independently via `order_id`:

- Each `proposal_outcomes` record links to a specific `order_id`
- Position resolution uses order fill data, not position-level P&L
- If multiple proposals result in orders for the same symbol, each tracks its own entry/exit independently
- `outcome_snapshots` use position-level unrealized P&L for interim snapshots (acceptable approximation for open positions)

---

## Verification Checklist

1. Execute a debate cycle — verify `persona_analyses` stored with correct persona actions
2. Approve proposal — verify `proposal_outcomes` created with `status='tracking'`
3. Close position (or mock) — verify outcome resolves with correct P&L calculation
4. Verify `recordPersonaOutcome()` RPC updates `persona_outcomes` + triggers score recomputation
5. Run next debate cycle — verify performance context appears in persona system prompts (after >= 5 outcomes)
6. Check moderator prompt includes persona comparison table with accurate scores
7. Verify cold start: no performance context injected when < 5 outcomes per persona
8. Verify confidence dampening: poorly calibrated personas get reduced confidence values
9. Verify pattern extraction: patterns only included when sample_size >= 5
10. Verify 2000 char hard cap on performance context block
