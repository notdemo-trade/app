# Phase 13: Trade Journal — Part 3: Business Logic
> Split from `013-phase-13-trade-journal.md`. See other parts in this directory.

## Database Queries

```ts
// packages/data-ops/src/db/queries/journal.ts

import { eq, and, desc, sql, gte, lte } from "drizzle-orm"
import { tradeJournal, memoryRules } from "../schema/journal"
import type { DrizzleClient } from "../client"
import type { TradeJournalEntry, JournalStats, MemoryRule, TradeOutcome } from "../../types/journal"
import { generateId, nowISO } from "../../lib/utils"

export interface CreateJournalParams {
  userId: string
  tradeId?: string
  symbol: string
  side: "buy" | "sell"
  entryPrice?: number
  entryAt?: string
  qty: number
  signals?: SignalSnapshot
  technicals?: TechnicalsSnapshot
  regimeTags?: string[]
  eventIds?: string[]
  notes?: string
}

export async function createJournalEntry(
  db: DrizzleClient,
  params: CreateJournalParams
): Promise<string> {
  const id = generateId()
  const now = new Date()

  await db.insert(tradeJournal).values({
    id,
    userId: params.userId,
    tradeId: params.tradeId ?? null,
    symbol: params.symbol.toUpperCase(),
    side: params.side,
    entryPrice: params.entryPrice ?? null,
    entryAt: params.entryAt ? new Date(params.entryAt) : now,
    qty: params.qty,
    signalsJson: params.signals ?? null,
    technicalsJson: params.technicals ?? null,
    regimeTags: params.regimeTags ?? [],
    eventIds: params.eventIds ?? [],
    notes: params.notes ?? null,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

export interface LogOutcomeParams {
  journalId: string
  userId: string
  exitPrice: number
  exitAt?: string
  pnlUsd: number
  pnlPct: number
  holdDurationMins: number
  outcome: TradeOutcome
  lessonsLearned?: string
}

export async function logOutcome(
  db: DrizzleClient,
  params: LogOutcomeParams
): Promise<void> {
  await db
    .update(tradeJournal)
    .set({
      exitPrice: params.exitPrice,
      exitAt: params.exitAt ? new Date(params.exitAt) : new Date(),
      pnlUsd: params.pnlUsd,
      pnlPct: params.pnlPct,
      holdDurationMins: params.holdDurationMins,
      outcome: params.outcome,
      lessonsLearned: params.lessonsLearned ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeJournal.id, params.journalId),
        eq(tradeJournal.userId, params.userId)
      )
    )
}

export async function getJournalEntry(
  db: DrizzleClient,
  userId: string,
  id: string
): Promise<TradeJournalEntry | null> {
  const row = await db.query.tradeJournal.findFirst({
    where: and(eq(tradeJournal.id, id), eq(tradeJournal.userId, userId)),
  })

  return row ? mapRowToEntry(row) : null
}

export interface QueryJournalParams {
  userId: string
  symbol?: string
  outcome?: TradeOutcome
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export async function queryJournal(
  db: DrizzleClient,
  params: QueryJournalParams
): Promise<TradeJournalEntry[]> {
  const { userId, symbol, outcome, startDate, endDate, limit = 50, offset = 0 } = params

  const conditions = [eq(tradeJournal.userId, userId)]

  if (symbol) {
    conditions.push(eq(tradeJournal.symbol, symbol.toUpperCase()))
  }
  if (outcome) {
    conditions.push(eq(tradeJournal.outcome, outcome))
  }
  if (startDate) {
    conditions.push(gte(tradeJournal.createdAt, new Date(startDate)))
  }
  if (endDate) {
    conditions.push(lte(tradeJournal.createdAt, new Date(endDate)))
  }

  const rows = await db.query.tradeJournal.findMany({
    where: and(...conditions),
    orderBy: desc(tradeJournal.createdAt),
    limit,
    offset,
  })

  return rows.map(mapRowToEntry)
}

export async function getJournalStats(
  db: DrizzleClient,
  userId: string,
  days: number = 30
): Promise<JournalStats> {
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const result = await db
    .select({
      totalTrades: sql<number>`count(*)`,
      wins: sql<number>`sum(case when outcome = 'win' then 1 else 0 end)`,
      losses: sql<number>`sum(case when outcome = 'loss' then 1 else 0 end)`,
      scratches: sql<number>`sum(case when outcome = 'scratch' then 1 else 0 end)`,
      totalPnl: sql<number>`coalesce(sum(pnl_usd), 0)`,
      avgPnl: sql<number>`coalesce(avg(pnl_usd), 0)`,
      avgHoldMins: sql<number>`coalesce(avg(hold_duration_mins), 0)`,
    })
    .from(tradeJournal)
    .where(
      and(
        eq(tradeJournal.userId, userId),
        gte(tradeJournal.createdAt, dateLimit)
      )
    )

  const row = result[0]

  if (!row || row.totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      scratches: 0,
      totalPnl: 0,
      avgPnl: 0,
      winRate: 0,
      avgHoldMins: 0,
    }
  }

  return {
    totalTrades: Number(row.totalTrades),
    wins: Number(row.wins),
    losses: Number(row.losses),
    scratches: Number(row.scratches),
    totalPnl: Number(row.totalPnl),
    avgPnl: Number(row.avgPnl),
    winRate: row.totalTrades > 0 ? Number(row.wins) / Number(row.totalTrades) : 0,
    avgHoldMins: Number(row.avgHoldMins),
  }
}

function mapRowToEntry(row: TradeJournalRow): TradeJournalEntry {
  return {
    id: row.id,
    userId: row.userId,
    tradeId: row.tradeId,
    symbol: row.symbol,
    side: row.side as "buy" | "sell",
    entryPrice: row.entryPrice,
    entryAt: row.entryAt?.toISOString() ?? null,
    exitPrice: row.exitPrice,
    exitAt: row.exitAt?.toISOString() ?? null,
    qty: row.qty,
    pnlUsd: row.pnlUsd,
    pnlPct: row.pnlPct,
    holdDurationMins: row.holdDurationMins,
    signals: row.signalsJson,
    technicals: row.technicalsJson,
    regimeTags: row.regimeTags ?? [],
    eventIds: row.eventIds ?? [],
    outcome: row.outcome as TradeOutcome | null,
    notes: row.notes,
    lessonsLearned: row.lessonsLearned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
```

---


## Memory Rules Queries

```ts
// packages/data-ops/src/db/queries/memory-rules.ts

import { eq, and, desc } from "drizzle-orm"
import { memoryRules } from "../schema/journal"
import type { DrizzleClient } from "../client"
import type { MemoryRule, RuleConditions } from "../../types/journal"
import { generateId } from "../../lib/utils"

export interface CreateRuleParams {
  userId: string
  ruleType: "avoid" | "prefer" | "caution" | "insight"
  description: string
  conditions?: RuleConditions
  confidence?: number
  source?: "manual" | "extracted"
}

export async function createMemoryRule(
  db: DrizzleClient,
  params: CreateRuleParams
): Promise<string> {
  const id = generateId()

  await db.insert(memoryRules).values({
    id,
    userId: params.userId,
    ruleType: params.ruleType,
    description: params.description,
    conditionsJson: params.conditions ?? null,
    confidence: params.confidence ?? null,
    source: params.source ?? "manual",
    active: true,
    createdAt: new Date(),
  })

  return id
}

export async function getActiveRules(
  db: DrizzleClient,
  userId: string
): Promise<MemoryRule[]> {
  const rows = await db.query.memoryRules.findMany({
    where: and(
      eq(memoryRules.userId, userId),
      eq(memoryRules.active, true)
    ),
    orderBy: desc(memoryRules.createdAt),
  })

  return rows.map(mapRuleRow)
}

export async function getAllRules(
  db: DrizzleClient,
  userId: string
): Promise<MemoryRule[]> {
  const rows = await db.query.memoryRules.findMany({
    where: eq(memoryRules.userId, userId),
    orderBy: desc(memoryRules.createdAt),
  })

  return rows.map(mapRuleRow)
}

export async function toggleRule(
  db: DrizzleClient,
  userId: string,
  ruleId: string,
  active: boolean
): Promise<void> {
  await db
    .update(memoryRules)
    .set({ active })
    .where(
      and(
        eq(memoryRules.id, ruleId),
        eq(memoryRules.userId, userId)
      )
    )
}

export async function deleteRule(
  db: DrizzleClient,
  userId: string,
  ruleId: string
): Promise<void> {
  await db
    .delete(memoryRules)
    .where(
      and(
        eq(memoryRules.id, ruleId),
        eq(memoryRules.userId, userId)
      )
    )
}

function mapRuleRow(row: MemoryRuleRow): MemoryRule {
  return {
    id: row.id,
    userId: row.userId,
    ruleType: row.ruleType,
    description: row.description,
    conditions: row.conditionsJson,
    confidence: row.confidence,
    source: row.source as "manual" | "extracted",
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}
```

---


## Journal Service

```ts
// packages/data-ops/src/services/journal-service.ts

import type { DrizzleClient } from "../db/client"
import { createJournalEntry, logOutcome, getJournalEntry, queryJournal, getJournalStats } from "../db/queries/journal"
import type { TradeJournalEntry, JournalStats, SignalSnapshot, TechnicalsSnapshot, TradeOutcome } from "../types/journal"

export interface JournalServiceConfig {
  db: DrizzleClient
  userId: string
}

export async function openJournalEntry(
  config: JournalServiceConfig,
  params: {
    tradeId?: string
    symbol: string
    side: "buy" | "sell"
    entryPrice: number
    qty: number
    signals?: SignalSnapshot
    technicals?: TechnicalsSnapshot
    regimeTags?: string[]
    notes?: string
  }
): Promise<string> {
  return createJournalEntry(config.db, {
    userId: config.userId,
    tradeId: params.tradeId,
    symbol: params.symbol,
    side: params.side,
    entryPrice: params.entryPrice,
    entryAt: new Date().toISOString(),
    qty: params.qty,
    signals: params.signals,
    technicals: params.technicals,
    regimeTags: params.regimeTags,
    notes: params.notes,
  })
}

export async function closeJournalEntry(
  config: JournalServiceConfig,
  journalId: string,
  params: {
    exitPrice: number
    lessonsLearned?: string
  }
): Promise<void> {
  const entry = await getJournalEntry(config.db, config.userId, journalId)
  if (!entry) {
    throw new JournalNotFoundError(journalId)
  }

  if (!entry.entryPrice || !entry.entryAt) {
    throw new JournalIncompleteError(journalId, "missing entry price/time")
  }

  const pnlUsd = calculatePnl(
    entry.side,
    entry.entryPrice,
    params.exitPrice,
    entry.qty
  )
  const pnlPct = (params.exitPrice - entry.entryPrice) / entry.entryPrice
  const holdDurationMins = Math.floor(
    (Date.now() - new Date(entry.entryAt).getTime()) / 60000
  )
  const outcome = classifyOutcome(pnlPct)

  await logOutcome(config.db, {
    journalId,
    userId: config.userId,
    exitPrice: params.exitPrice,
    pnlUsd,
    pnlPct,
    holdDurationMins,
    outcome,
    lessonsLearned: params.lessonsLearned,
  })
}

function calculatePnl(
  side: "buy" | "sell",
  entryPrice: number,
  exitPrice: number,
  qty: number
): number {
  const diff = exitPrice - entryPrice
  return side === "buy" ? diff * qty : -diff * qty
}

function classifyOutcome(pnlPct: number): TradeOutcome {
  if (pnlPct > 0.005) return "win"       // >0.5% = win
  if (pnlPct < -0.005) return "loss"     // <-0.5% = loss
  return "scratch"                        // in between = scratch
}

export class JournalNotFoundError extends Error {
  constructor(public journalId: string) {
    super(`Journal entry not found: ${journalId}`)
    this.name = "JournalNotFoundError"
  }
}

export class JournalIncompleteError extends Error {
  constructor(public journalId: string, public reason: string) {
    super(`Journal entry incomplete: ${reason}`)
    this.name = "JournalIncompleteError"
  }
}
```

---


## Auto-Journal Integration

Hook into order execution to create journal entries.

```ts
// packages/data-ops/src/services/trading-service.ts (addition)

import { openJournalEntry, closeJournalEntry } from "./journal-service"
import { getJournalEntry, queryJournal } from "../db/queries/journal"

// Call when opening position
export async function recordTradeEntry(
  config: TradingServiceConfig,
  params: {
    tradeId: string
    symbol: string
    side: "buy" | "sell"
    entryPrice: number
    qty: number
    signals?: SignalSnapshot
    technicals?: TechnicalsSnapshot
  }
): Promise<string> {
  return openJournalEntry(
    { db: config.db, userId: config.userId },
    params
  )
}

// Call when closing position
export async function recordTradeExit(
  config: TradingServiceConfig,
  params: {
    symbol: string
    exitPrice: number
  }
): Promise<void> {
  // Find open journal entry for this symbol
  const entries = await queryJournal(config.db, {
    userId: config.userId,
    symbol: params.symbol,
    limit: 1,
  })

  const openEntry = entries.find(e => !e.exitPrice)
  if (!openEntry) return

  await closeJournalEntry(
    { db: config.db, userId: config.userId },
    openEntry.id,
    { exitPrice: params.exitPrice }
  )
}
```

---

