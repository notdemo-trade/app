# Phase 15: Anonymous Leaderboard — Part 3: Business Logic
> Split from `015-phase-15-anonymous-leaderboard.md`. See other parts in this directory.

## Database Queries

```ts
// packages/data-ops/src/db/queries/leaderboard.ts

import { eq, and, desc, asc, sql, like } from "drizzle-orm"
import { leaderboardSettings, leaderboardSnapshots, leaderboardRanks } from "../schema/leaderboard"
import type { DrizzleClient } from "../client"
import type { LeaderboardSettings, LeaderboardEntry, LeaderboardPeriod, TradingMode, LeaderboardProfile } from "../../types/leaderboard"
import { generateId } from "../../lib/utils"

const ALIAS_PREFIXES = ["Agent", "Bot", "Trader", "Alpha", "Delta", "Sigma", "Quant"]

function generateRandomAlias(): string {
  const prefix = ALIAS_PREFIXES[Math.floor(Math.random() * ALIAS_PREFIXES.length)]
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}_${suffix}`
}

export async function getLeaderboardSettings(
  db: DrizzleClient,
  userId: string
): Promise<LeaderboardSettings | null> {
  const row = await db.query.leaderboardSettings.findFirst({
    where: eq(leaderboardSettings.userId, userId),
  })
  return row ? mapSettingsRow(row) : null
}

export async function createLeaderboardSettings(
  db: DrizzleClient,
  userId: string,
  alpacaAccountId: string
): Promise<LeaderboardSettings> {
  const generatedAlias = generateRandomAlias()
  const now = new Date()

  const [row] = await db
    .insert(leaderboardSettings)
    .values({
      userId,
      generatedAlias,
      alpacaAccountId,
      isEnabled: false,
      isVisible: true,
      tradingMode: "paper",
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return mapSettingsRow(row)
}

export interface UpdateSettingsParams {
  isEnabled?: boolean
  customAlias?: string | null
  isVisible?: boolean
  tradingMode?: TradingMode
}

export async function updateLeaderboardSettings(
  db: DrizzleClient,
  userId: string,
  params: UpdateSettingsParams
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (params.isEnabled !== undefined) updates.isEnabled = params.isEnabled
  if (params.isVisible !== undefined) updates.isVisible = params.isVisible
  if (params.tradingMode !== undefined) updates.tradingMode = params.tradingMode
  if (params.customAlias !== undefined) {
    updates.customAlias = params.customAlias
    updates.aliasLastChangedAt = new Date()
  }

  await db
    .update(leaderboardSettings)
    .set(updates)
    .where(eq(leaderboardSettings.userId, userId))
}

export async function checkAliasAvailable(
  db: DrizzleClient,
  alias: string,
  excludeUserId?: string
): Promise<boolean> {
  const existing = await db.query.leaderboardSettings.findFirst({
    where: excludeUserId
      ? and(eq(leaderboardSettings.customAlias, alias), sql`${leaderboardSettings.userId} != ${excludeUserId}`)
      : eq(leaderboardSettings.customAlias, alias),
    columns: { userId: true },
  })
  return !existing
}

export async function getLeaderboard(
  db: DrizzleClient,
  period: LeaderboardPeriod,
  tradingMode: TradingMode,
  params: { page?: number; limit?: number; search?: string }
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const { page = 1, limit = 50, search } = params
  const offset = (page - 1) * limit

  let whereClause = and(
    eq(leaderboardRanks.period, period),
    eq(leaderboardRanks.tradingMode, tradingMode)
  )

  if (search) {
    whereClause = and(whereClause, like(leaderboardRanks.alias, `%${search}%`))
  }

  const [entries, countResult] = await Promise.all([
    db.query.leaderboardRanks.findMany({
      where: whereClause,
      orderBy: asc(leaderboardRanks.rank),
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(leaderboardRanks)
      .where(whereClause),
  ])

  return {
    entries: entries.map(mapRankRow),
    total: Number(countResult[0]?.count ?? 0),
  }
}

export async function getUserRanks(
  db: DrizzleClient,
  userId: string,
  tradingMode: TradingMode
): Promise<Record<LeaderboardPeriod, LeaderboardEntry | null>> {
  const rows = await db.query.leaderboardRanks.findMany({
    where: and(
      eq(leaderboardRanks.userId, userId),
      eq(leaderboardRanks.tradingMode, tradingMode)
    ),
  })

  const result: Record<LeaderboardPeriod, LeaderboardEntry | null> = {
    "24h": null,
    "7d": null,
    "30d": null,
    "90d": null,
    all: null,
  }

  for (const row of rows) {
    result[row.period as LeaderboardPeriod] = mapRankRow(row)
  }

  return result
}

export async function getUserByAlias(
  db: DrizzleClient,
  alias: string,
  tradingMode: TradingMode
): Promise<LeaderboardProfile | null> {
  const settings = await db.query.leaderboardSettings.findFirst({
    where: and(
      eq(leaderboardSettings.customAlias, alias),
      eq(leaderboardSettings.isEnabled, true),
      eq(leaderboardSettings.isVisible, true)
    ),
  })

  if (!settings) {
    const settingsByGenerated = await db.query.leaderboardSettings.findFirst({
      where: and(
        eq(leaderboardSettings.generatedAlias, alias),
        eq(leaderboardSettings.isEnabled, true),
        eq(leaderboardSettings.isVisible, true)
      ),
    })
    if (!settingsByGenerated) return null
  }

  const ranks = await db.query.leaderboardRanks.findMany({
    where: and(
      eq(leaderboardRanks.alias, alias),
      eq(leaderboardRanks.tradingMode, tradingMode)
    ),
  })

  const ranksMap: LeaderboardProfile["ranks"] = {
    "24h": null,
    "7d": null,
    "30d": null,
    "90d": null,
    all: null,
  }

  for (const r of ranks) {
    ranksMap[r.period as LeaderboardPeriod] = {
      rank: r.rank,
      totalParticipants: 0, // filled from snapshot
      compositeScore: r.compositeScore,
      roi: r.roi,
      winRate: r.winRate,
      sharpe: r.sharpe,
      tradesCount: r.tradesCount,
    }
  }

  return {
    alias,
    ranks: ranksMap,
    rankHistory: [], // filled separately if needed
  }
}

function mapSettingsRow(row: LeaderboardSettingsRow): LeaderboardSettings {
  return {
    userId: row.userId,
    isEnabled: row.isEnabled,
    customAlias: row.customAlias,
    generatedAlias: row.generatedAlias,
    alpacaAccountId: row.alpacaAccountId ?? "",
    aliasLastChangedAt: row.aliasLastChangedAt?.toISOString() ?? null,
    isVisible: row.isVisible,
    tradingMode: row.tradingMode as TradingMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapRankRow(row: LeaderboardRankRow): LeaderboardEntry {
  return {
    rank: row.rank,
    userId: row.userId,
    alias: row.alias,
    compositeScore: row.compositeScore,
    roi: row.roi,
    winRate: row.winRate,
    sharpe: row.sharpe,
    tradesCount: row.tradesCount,
  }
}
```

---


## Composite Score Service

```ts
// packages/data-ops/src/services/leaderboard-scoring.ts

import { eq, and, sql } from "drizzle-orm"
import { leaderboardSnapshots, leaderboardRanks, leaderboardSettings } from "../db/schema/leaderboard"
import type { DrizzleClient } from "../db/client"
import type { LeaderboardPeriod, TradingMode } from "../types/leaderboard"

const MINIMUM_TRADES = 5
const MINIMUM_TRADING_DAYS = 3

interface NormalizationStats {
  roiMin: number
  roiMax: number
  sharpeMin: number
  sharpeMax: number
  winRateMin: number
  winRateMax: number
  drawdownMin: number
  drawdownMax: number
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5
  return (value - min) / (max - min)
}

function calculateComposite(
  roi: number,
  sharpe: number,
  winRate: number,
  maxDrawdown: number,
  stats: NormalizationStats
): { score: number; normalized: { roi: number; sharpe: number; winRate: number; drawdown: number } } {
  const normalizedRoi = normalize(roi, stats.roiMin, stats.roiMax)
  const normalizedSharpe = normalize(sharpe, stats.sharpeMin, stats.sharpeMax)
  const normalizedWinRate = normalize(winRate, stats.winRateMin, stats.winRateMax)
  const normalizedDrawdown = normalize(maxDrawdown, stats.drawdownMin, stats.drawdownMax)

  const score =
    normalizedRoi * 0.4 +
    normalizedSharpe * 0.3 +
    normalizedWinRate * 0.15 +
    (1 - normalizedDrawdown) * 0.15

  return {
    score,
    normalized: {
      roi: normalizedRoi,
      sharpe: normalizedSharpe,
      winRate: normalizedWinRate,
      drawdown: normalizedDrawdown,
    },
  }
}

export async function calculateCompositeScores(
  db: DrizzleClient,
  period: LeaderboardPeriod,
  tradingMode: TradingMode
): Promise<void> {
  // 1. Get qualified snapshots (meets minimum requirements)
  const snapshots = await db.query.leaderboardSnapshots.findMany({
    where: and(
      eq(leaderboardSnapshots.period, period),
      eq(leaderboardSnapshots.tradingMode, tradingMode),
      eq(leaderboardSnapshots.meetsMinimumRequirements, true)
    ),
  })

  if (snapshots.length === 0) {
    // Clear rankings for this period if no qualified users
    await db
      .delete(leaderboardRanks)
      .where(and(eq(leaderboardRanks.period, period), eq(leaderboardRanks.tradingMode, tradingMode)))
    return
  }

  // 2. Calculate normalization bounds
  const stats: NormalizationStats = {
    roiMin: Math.min(...snapshots.map((s) => s.roi)),
    roiMax: Math.max(...snapshots.map((s) => s.roi)),
    sharpeMin: Math.min(...snapshots.map((s) => s.sharpe ?? 0)),
    sharpeMax: Math.max(...snapshots.map((s) => s.sharpe ?? 0)),
    winRateMin: Math.min(...snapshots.map((s) => s.winRate)),
    winRateMax: Math.max(...snapshots.map((s) => s.winRate)),
    drawdownMin: Math.min(...snapshots.map((s) => s.maxDrawdown)),
    drawdownMax: Math.max(...snapshots.map((s) => s.maxDrawdown)),
  }

  // 3. Calculate composite scores
  const scored = snapshots.map((snapshot) => {
    const { score, normalized } = calculateComposite(
      snapshot.roi,
      snapshot.sharpe ?? 0,
      snapshot.winRate,
      snapshot.maxDrawdown,
      stats
    )
    return {
      ...snapshot,
      compositeScore: score,
      normalizedRoi: normalized.roi,
      normalizedSharpe: normalized.sharpe,
      normalizedWinRate: normalized.winRate,
      normalizedMaxDrawdown: normalized.drawdown,
    }
  })

  // 4. Sort by composite score desc
  scored.sort((a, b) => b.compositeScore - a.compositeScore)

  // 5. Assign ranks
  const ranked = scored.map((s, idx) => ({
    ...s,
    rank: idx + 1,
    totalParticipants: scored.length,
  }))

  // 6. Update snapshots with scores
  for (const snapshot of ranked) {
    await db
      .update(leaderboardSnapshots)
      .set({
        compositeScore: snapshot.compositeScore,
        normalizedRoi: snapshot.normalizedRoi,
        normalizedSharpe: snapshot.normalizedSharpe,
        normalizedWinRate: snapshot.normalizedWinRate,
        normalizedMaxDrawdown: snapshot.normalizedMaxDrawdown,
        rank: snapshot.rank,
        totalParticipants: snapshot.totalParticipants,
      })
      .where(eq(leaderboardSnapshots.id, snapshot.id))
  }

  // 7. Get user aliases for denormalized table
  const userIds = ranked.map((r) => r.userId)
  const settingsRows = await db.query.leaderboardSettings.findMany({
    where: and(
      sql`${leaderboardSettings.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
      eq(leaderboardSettings.isEnabled, true),
      eq(leaderboardSettings.isVisible, true)
    ),
  })

  const aliasMap = new Map<string, string>()
  for (const s of settingsRows) {
    aliasMap.set(s.userId, s.customAlias ?? s.generatedAlias)
  }

  // 8. Clear and repopulate leaderboard_ranks
  await db
    .delete(leaderboardRanks)
    .where(and(eq(leaderboardRanks.period, period), eq(leaderboardRanks.tradingMode, tradingMode)))

  const ranksToInsert = ranked
    .filter((r) => aliasMap.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      period,
      tradingMode,
      rank: r.rank,
      compositeScore: r.compositeScore,
      alias: aliasMap.get(r.userId)!,
      roi: r.roi,
      winRate: r.winRate,
      sharpe: r.sharpe,
      tradesCount: r.tradesCount,
      updatedAt: new Date(),
    }))

  if (ranksToInsert.length > 0) {
    await db.insert(leaderboardRanks).values(ranksToInsert)
  }
}

export async function checkMinimumRequirements(
  tradesCount: number,
  tradingDays: number
): Promise<boolean> {
  return tradesCount >= MINIMUM_TRADES && tradingDays >= MINIMUM_TRADING_DAYS
}
```

---


## Snapshot Service

```ts
// packages/data-ops/src/services/leaderboard-snapshot.ts

import { eq, and, gte, lte, sql } from "drizzle-orm"
import { leaderboardSnapshots, leaderboardSettings } from "../db/schema/leaderboard"
import { tradeJournal } from "../db/schema/journal"
import type { DrizzleClient } from "../db/client"
import type { LeaderboardPeriod, TradingMode } from "../types/leaderboard"
import { generateId } from "../lib/utils"

interface SnapshotData {
  roi: number
  sharpe: number | null
  winRate: number
  maxDrawdown: number
  tradesCount: number
  winCount: number
  lossCount: number
  totalVolume: number
  avgHoldTimeHours: number
  startingEquity: number
  endingEquity: number
  tradingDays: number
}

const PERIOD_HOURS: Record<LeaderboardPeriod, number | null> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
  all: null,
}

function getPeriodRange(period: LeaderboardPeriod): { start: Date; end: Date } {
  const end = new Date()
  const hours = PERIOD_HOURS[period]

  if (!hours) {
    return { start: new Date(0), end }
  }

  const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
  return { start, end }
}

export async function createUserSnapshot(
  db: DrizzleClient,
  userId: string,
  tradingMode: TradingMode
): Promise<void> {
  const settings = await db.query.leaderboardSettings.findFirst({
    where: and(
      eq(leaderboardSettings.userId, userId),
      eq(leaderboardSettings.isEnabled, true),
      eq(leaderboardSettings.tradingMode, tradingMode)
    ),
  })

  if (!settings) return

  const periods: LeaderboardPeriod[] = ["24h", "7d", "30d", "90d", "all"]

  for (const period of periods) {
    const { start, end } = getPeriodRange(period)
    const data = await calculateSnapshotData(db, userId, start, end)

    if (!data) continue

    const meetsMinimumRequirements = data.tradesCount >= 5 && data.tradingDays >= 3

    await db
      .insert(leaderboardSnapshots)
      .values({
        id: generateId(),
        userId,
        period,
        tradingMode,
        periodStart: start,
        periodEnd: end,
        roi: data.roi,
        sharpe: data.sharpe,
        winRate: data.winRate,
        maxDrawdown: data.maxDrawdown,
        tradesCount: data.tradesCount,
        winCount: data.winCount,
        lossCount: data.lossCount,
        totalVolume: data.totalVolume,
        avgHoldTimeHours: data.avgHoldTimeHours,
        startingEquity: data.startingEquity,
        endingEquity: data.endingEquity,
        meetsMinimumRequirements,
        snapshotAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [leaderboardSnapshots.userId, leaderboardSnapshots.period, leaderboardSnapshots.tradingMode],
        set: {
          periodStart: start,
          periodEnd: end,
          roi: data.roi,
          sharpe: data.sharpe,
          winRate: data.winRate,
          maxDrawdown: data.maxDrawdown,
          tradesCount: data.tradesCount,
          winCount: data.winCount,
          lossCount: data.lossCount,
          totalVolume: data.totalVolume,
          avgHoldTimeHours: data.avgHoldTimeHours,
          startingEquity: data.startingEquity,
          endingEquity: data.endingEquity,
          meetsMinimumRequirements,
          snapshotAt: new Date(),
        },
      })
  }
}

async function calculateSnapshotData(
  db: DrizzleClient,
  userId: string,
  start: Date,
  end: Date
): Promise<SnapshotData | null> {
  const result = await db
    .select({
      tradesCount: sql<number>`count(*)`,
      winCount: sql<number>`sum(case when outcome = 'win' then 1 else 0 end)`,
      lossCount: sql<number>`sum(case when outcome = 'loss' then 1 else 0 end)`,
      totalPnl: sql<number>`coalesce(sum(pnl_usd), 0)`,
      totalVolume: sql<number>`coalesce(sum(qty * entry_price), 0)`,
      avgHoldMins: sql<number>`coalesce(avg(hold_duration_mins), 0)`,
      tradingDays: sql<number>`count(distinct date(created_at))`,
      maxDrawdownPct: sql<number>`coalesce(min(pnl_pct), 0)`,
    })
    .from(tradeJournal)
    .where(
      and(
        eq(tradeJournal.userId, userId),
        gte(tradeJournal.createdAt, start),
        lte(tradeJournal.createdAt, end),
        sql`outcome IS NOT NULL`
      )
    )

  const row = result[0]
  if (!row || Number(row.tradesCount) === 0) return null

  const tradesCount = Number(row.tradesCount)
  const winCount = Number(row.winCount)
  const lossCount = Number(row.lossCount)
  const winRate = tradesCount > 0 ? winCount / tradesCount : 0

  // Simplified ROI/Sharpe calculation
  const startingEquity = 100000 // TODO: get from Alpaca
  const endingEquity = startingEquity + Number(row.totalPnl)
  const roi = (endingEquity - startingEquity) / startingEquity

  return {
    roi,
    sharpe: null, // TODO: proper Sharpe calculation
    winRate,
    maxDrawdown: Math.abs(Number(row.maxDrawdownPct)),
    tradesCount,
    winCount,
    lossCount,
    totalVolume: Number(row.totalVolume),
    avgHoldTimeHours: Number(row.avgHoldMins) / 60,
    startingEquity,
    endingEquity,
    tradingDays: Number(row.tradingDays),
  }
}
```

---


## Cron Job

```ts
// apps/data-service/src/scheduled/leaderboard-rankings.ts

import { calculateCompositeScores } from "@repo/data-ops/services/leaderboard-scoring"
import { getDatabase } from "@repo/data-ops/database/setup"
import type { LeaderboardPeriod, TradingMode } from "@repo/data-ops/types/leaderboard"

export async function updateLeaderboardRankings(env: Env): Promise<void> {
  const db = getDatabase(env)
  const periods: LeaderboardPeriod[] = ["24h", "7d", "30d", "90d", "all"]
  const modes: TradingMode[] = ["paper", "live"]

  for (const mode of modes) {
    for (const period of periods) {
      try {
        await calculateCompositeScores(db, period, mode)
        console.log(`Leaderboard updated: ${mode}/${period}`)
      } catch (err) {
        console.error(`Failed to update ${mode}/${period}:`, err)
      }
    }
  }
}
```

Add to scheduled handler:

```ts
// apps/data-service/src/scheduled/index.ts

import { updateLeaderboardRankings } from "./leaderboard-rankings"

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const cron = controller.cron

  // Hourly: update leaderboard rankings
  if (cron === "0 * * * *") {
    ctx.waitUntil(updateLeaderboardRankings(env))
  }
}
```

Add cron trigger in `wrangler.jsonc`:

```jsonc
{
  "triggers": {
    "crons": ["0 * * * *"]
  }
}
```

---

