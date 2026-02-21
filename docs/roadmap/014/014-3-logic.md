# Phase 14: Platform Stats — Part 3: Business Logic
> Split from `014-phase-14-platform-stats.md`. See other parts in this directory.

## Database Queries

```ts
// packages/data-ops/src/db/queries/platform-stats.ts

import { eq, and, gte, sql, count } from "drizzle-orm"
import { platformStats, userPrivacySettings } from "../schema/platform-stats"
import { tradeJournal } from "../schema/journal"
import { user } from "../schema/auth"
import type { DrizzleClient } from "../client"
import type { PlatformStats, UserPrivacySettings } from "../../types/platform-stats"
import { generateId } from "../../lib/utils"

const PRIVACY_THRESHOLD = 10

export async function getPlatformStats(
  db: DrizzleClient
): Promise<PlatformStats | null> {
  const row = await db.query.platformStats.findFirst()
  return row ? mapStatsRow(row) : null
}

export async function getPublicPlatformStats(
  db: DrizzleClient
): Promise<PublicPlatformStats | null> {
  const stats = await getPlatformStats(db)

  if (!stats || stats.usersIncluded < PRIVACY_THRESHOLD) {
    return null
  }

  return {
    totalUsers: fuzzyRound(stats.totalUsers),
    activeAgents: fuzzyRound(stats.activeAgents),
    totalTrades: fuzzyRound(stats.totalTrades),
    totalVolume: fuzzyRoundVolume(stats.totalVolume),
    avgWinRate: roundPercent(stats.avgWinRate30d),
    avgRoi30d: roundPercent(stats.avgRoi30d),
    lastUpdated: stats.calculatedAt,
  }
}

export async function getOptedInUserIds(
  db: DrizzleClient
): Promise<string[]> {
  // Get all users, then filter out those who explicitly opted out
  const allUsers = await db.select({ id: user.id }).from(user)

  const optedOut = await db
    .select({ userId: userPrivacySettings.userId })
    .from(userPrivacySettings)
    .where(eq(userPrivacySettings.includeInPlatformStats, false))

  const optedOutSet = new Set(optedOut.map(r => r.userId))
  return allUsers.map(u => u.id).filter(id => !optedOutSet.has(id))
}

export async function savePlatformStats(
  db: DrizzleClient,
  stats: Omit<PlatformStats, "id" | "calculatedAt">
): Promise<void> {
  const id = "singleton"
  const now = new Date()

  await db
    .insert(platformStats)
    .values({
      id,
      ...stats,
      calculatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformStats.id,
      set: {
        ...stats,
        calculatedAt: now,
      },
    })
}

export async function getUserPrivacySettings(
  db: DrizzleClient,
  userId: string
): Promise<UserPrivacySettings> {
  const row = await db.query.userPrivacySettings.findFirst({
    where: eq(userPrivacySettings.userId, userId),
  })

  // Default: opted in
  if (!row) {
    return {
      userId,
      includeInPlatformStats: true,
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    userId: row.userId,
    includeInPlatformStats: row.includeInPlatformStats,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function updateUserPrivacySettings(
  db: DrizzleClient,
  userId: string,
  includeInPlatformStats: boolean
): Promise<void> {
  await db
    .insert(userPrivacySettings)
    .values({
      userId,
      includeInPlatformStats,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPrivacySettings.userId,
      set: {
        includeInPlatformStats,
        updatedAt: new Date(),
      },
    })
}

function mapStatsRow(row: PlatformStatsRow): PlatformStats {
  return {
    id: row.id,
    totalUsers: row.totalUsers,
    activeAgents: row.activeAgents,
    totalTrades: row.totalTrades,
    totalTradesLast30d: row.totalTradesLast30d,
    totalTradesLast7d: row.totalTradesLast7d,
    totalTradesLast24h: row.totalTradesLast24h,
    totalVolume: row.totalVolume,
    totalVolumeLast30d: row.totalVolumeLast30d,
    avgRoi30d: row.avgRoi30d ?? 0,
    avgWinRate30d: row.avgWinRate30d ?? 0,
    avgSharpe30d: row.avgSharpe30d ?? 0,
    avgMaxDrawdown30d: row.avgMaxDrawdown30d ?? 0,
    stocksPercent: row.stocksPercent ?? 0,
    cryptoPercent: row.cryptoPercent ?? 0,
    optionsPercent: row.optionsPercent ?? 0,
    usersIncluded: row.usersIncluded,
    calculatedAt: row.calculatedAt.toISOString(),
  }
}
```

---


## Fuzzy Rounding Utilities

```ts
// packages/data-ops/src/lib/fuzzy-round.ts

export function fuzzyRound(n: number): number {
  if (n < 10) return n
  if (n < 100) return Math.round(n / 5) * 5
  if (n < 1000) return Math.round(n / 10) * 10
  if (n < 10000) return Math.round(n / 100) * 100
  return Math.round(n / 1000) * 1000
}

export function fuzzyRoundVolume(n: number): number {
  if (n < 1000) return Math.round(n)
  if (n < 10000) return Math.round(n / 100) * 100
  if (n < 100000) return Math.round(n / 1000) * 1000
  if (n < 1000000) return Math.round(n / 10000) * 10000
  return Math.round(n / 100000) * 100000
}

export function roundPercent(n: number | null): number {
  if (n === null) return 0
  return Math.round(n * 1000) / 1000
}

export function formatCompact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  if (n < 1000000000) return `${(n / 1000000).toFixed(1)}M`
  return `${(n / 1000000000).toFixed(1)}B`
}
```

---


## Statistics Calculation Service

```ts
// packages/data-ops/src/services/platform-stats-service.ts

import { sql, eq, gte, and, count, sum, avg } from "drizzle-orm"
import type { DrizzleClient } from "../db/client"
import { tradeJournal } from "../db/schema/journal"
import { user } from "../db/schema/auth"
import { getOptedInUserIds, savePlatformStats } from "../db/queries/platform-stats"
import type { PlatformStats } from "../types/platform-stats"

export interface CalculateStatsResult {
  stats: Omit<PlatformStats, "id" | "calculatedAt">
  usersIncluded: number
}

export async function calculatePlatformStats(
  db: DrizzleClient
): Promise<CalculateStatsResult> {
  const optedInUsers = await getOptedInUserIds(db)

  if (optedInUsers.length === 0) {
    return { stats: emptyStats(), usersIncluded: 0 }
  }

  const now = new Date()
  const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Total users (opted in)
  const totalUsers = optedInUsers.length

  // Active agents (traded in last 7d)
  const activeAgentsResult = await db
    .selectDistinct({ userId: tradeJournal.userId })
    .from(tradeJournal)
    .where(
      and(
        sql`${tradeJournal.userId} = ANY(${optedInUsers})`,
        gte(tradeJournal.createdAt, day7Ago)
      )
    )
  const activeAgents = activeAgentsResult.length

  // Trade counts
  const tradeCountsResult = await db
    .select({
      total: count(),
      last30d: sql<number>`count(*) filter (where ${tradeJournal.createdAt} >= ${day30Ago})`,
      last7d: sql<number>`count(*) filter (where ${tradeJournal.createdAt} >= ${day7Ago})`,
      last24h: sql<number>`count(*) filter (where ${tradeJournal.createdAt} >= ${day1Ago})`,
    })
    .from(tradeJournal)
    .where(sql`${tradeJournal.userId} = ANY(${optedInUsers})`)

  const tradeCounts = tradeCountsResult[0] ?? { total: 0, last30d: 0, last7d: 0, last24h: 0 }

  // Volume
  const volumeResult = await db
    .select({
      total: sql<number>`coalesce(sum(${tradeJournal.qty} * coalesce(${tradeJournal.entryPrice}, 0)), 0)`,
      last30d: sql<number>`coalesce(sum(case when ${tradeJournal.createdAt} >= ${day30Ago} then ${tradeJournal.qty} * coalesce(${tradeJournal.entryPrice}, 0) else 0 end), 0)`,
    })
    .from(tradeJournal)
    .where(sql`${tradeJournal.userId} = ANY(${optedInUsers})`)

  const volume = volumeResult[0] ?? { total: 0, last30d: 0 }

  // Performance averages (30d, per user then averaged)
  const performanceResult = await db
    .select({
      avgRoi: sql<number>`avg(user_stats.roi)`,
      avgWinRate: sql<number>`avg(user_stats.win_rate)`,
    })
    .from(
      sql`(
        select
          user_id,
          coalesce(avg(pnl_pct), 0) as roi,
          coalesce(sum(case when outcome = 'win' then 1 else 0 end)::float / nullif(count(*), 0), 0) as win_rate
        from trade_journal
        where user_id = ANY(${optedInUsers})
          and created_at >= ${day30Ago}
        group by user_id
      ) as user_stats`
    )

  const perf = performanceResult[0] ?? { avgRoi: 0, avgWinRate: 0 }

  return {
    stats: {
      totalUsers,
      activeAgents,
      totalTrades: Number(tradeCounts.total),
      totalTradesLast30d: Number(tradeCounts.last30d),
      totalTradesLast7d: Number(tradeCounts.last7d),
      totalTradesLast24h: Number(tradeCounts.last24h),
      totalVolume: Number(volume.total),
      totalVolumeLast30d: Number(volume.last30d),
      avgRoi30d: Number(perf.avgRoi) || 0,
      avgWinRate30d: Number(perf.avgWinRate) || 0,
      avgSharpe30d: 0, // TODO: implement Sharpe calculation
      avgMaxDrawdown30d: 0, // TODO: implement drawdown calculation
      stocksPercent: 0, // TODO: implement asset breakdown
      cryptoPercent: 0,
      optionsPercent: 0,
      usersIncluded: optedInUsers.length,
    },
    usersIncluded: optedInUsers.length,
  }
}

function emptyStats(): Omit<PlatformStats, "id" | "calculatedAt"> {
  return {
    totalUsers: 0,
    activeAgents: 0,
    totalTrades: 0,
    totalTradesLast30d: 0,
    totalTradesLast7d: 0,
    totalTradesLast24h: 0,
    totalVolume: 0,
    totalVolumeLast30d: 0,
    avgRoi30d: 0,
    avgWinRate30d: 0,
    avgSharpe30d: 0,
    avgMaxDrawdown30d: 0,
    stocksPercent: 0,
    cryptoPercent: 0,
    optionsPercent: 0,
    usersIncluded: 0,
  }
}
```

---


## Cron Job (Cloudflare Workers)

```ts
// apps/data-service/src/cron/calculate-platform-stats.ts

import type { Env } from "../types"
import { getDb } from "@repo/data-ops/db/client"
import { calculatePlatformStats } from "@repo/data-ops/services/platform-stats-service"
import { savePlatformStats } from "@repo/data-ops/db/queries/platform-stats"

export async function calculatePlatformStatsJob(env: Env): Promise<void> {
  const db = getDb(env.DATABASE_URL)

  console.log("[platform-stats] Starting calculation...")

  const { stats, usersIncluded } = await calculatePlatformStats(db)

  console.log(`[platform-stats] Calculated stats for ${usersIncluded} users`)

  await savePlatformStats(db, stats)

  console.log("[platform-stats] Stats saved successfully")
}
```

```ts
// apps/data-service/src/index.ts (add to scheduled handler)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // ... existing fetch handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case "0 * * * *": // Every hour
        ctx.waitUntil(calculatePlatformStatsJob(env))
        break
    }
  },
}
```

```jsonc
// wrangler.jsonc (add trigger)
{
  "triggers": {
    "crons": ["0 * * * *"]
  }
}
```

---

