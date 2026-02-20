# Phase 4: Signal Gathering — Part 3: Business Logic
> Split from `004-phase-4-signal-gathering.md`. See other parts in this directory.

## StockTwits Client

```ts
// packages/data-ops/src/providers/social/stocktwits.ts

const BASE_URL = "https://api.stocktwits.com/api/2"

export interface StockTwitsMessage {
  id: number
  body: string
  created_at: string
  user: {
    id: number
    username: string
    followers: number
    following: number
  }
  symbols: Array<{ symbol: string; title: string }>
  entities?: {
    sentiment?: { basic: "Bullish" | "Bearish" | null }
  }
}

export interface StockTwitsStreamResponse {
  response: { status: number }
  cursor: { more: boolean; since: number; max: number }
  messages: StockTwitsMessage[]
}

export interface SymbolSentiment {
  symbol: string
  bullish: number
  bearish: number
  neutral: number
  total: number
  score: number // -1 to 1
}

export interface TrendingSymbol {
  symbol: string
  title: string
  watchlist_count: number
}

export class StockTwitsClient {
  async getTrendingSymbols(): Promise<TrendingSymbol[]> {
    const response = await fetch(`${BASE_URL}/trending/symbols.json`)

    if (!response.ok) {
      throw new StockTwitsError(response.status, await response.text())
    }

    const data = await response.json()
    return data.symbols || []
  }

  async getSymbolStream(
    symbol: string,
    options?: { limit?: number; since?: number }
  ): Promise<StockTwitsStreamResponse> {
    const params = new URLSearchParams()
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.since) params.set("since", String(options.since))

    const url = `${BASE_URL}/streams/symbol/${symbol}.json?${params}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new StockTwitsError(response.status, await response.text())
    }

    return response.json()
  }

  async getTrendingStream(limit = 30): Promise<StockTwitsStreamResponse> {
    const url = `${BASE_URL}/streams/trending.json?limit=${limit}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new StockTwitsError(response.status, await response.text())
    }

    return response.json()
  }

  analyzeSentiment(messages: StockTwitsMessage[]): SymbolSentiment[] {
    const bySymbol = new Map<string, { bullish: number; bearish: number; neutral: number }>()

    for (const msg of messages) {
      const sentiment = msg.entities?.sentiment?.basic

      for (const sym of msg.symbols) {
        const existing = bySymbol.get(sym.symbol) || { bullish: 0, bearish: 0, neutral: 0 }

        if (sentiment === "Bullish") existing.bullish++
        else if (sentiment === "Bearish") existing.bearish++
        else existing.neutral++

        bySymbol.set(sym.symbol, existing)
      }
    }

    return Array.from(bySymbol.entries()).map(([symbol, counts]) => {
      const total = counts.bullish + counts.bearish + counts.neutral
      const score = total > 0 ? (counts.bullish - counts.bearish) / total : 0

      return {
        symbol,
        ...counts,
        total,
        score,
      }
    })
  }
}

export class StockTwitsError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`StockTwits API error (${statusCode}): ${body}`)
    this.name = "StockTwitsError"
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429
  }
}

// Simple rate limit tracker (in-memory, resets on worker restart)
const rateLimitState = {
  backoffUntil: 0,
  consecutiveErrors: 0,
}

export function createStockTwitsClient(): StockTwitsClient {
  return new StockTwitsClient()
}

export function isRateLimited(): boolean {
  return Date.now() < rateLimitState.backoffUntil
}

export function recordRateLimit(): void {
  rateLimitState.consecutiveErrors++
  // Exponential backoff: 1min, 2min, 4min, max 10min
  const backoffMs = Math.min(60_000 * Math.pow(2, rateLimitState.consecutiveErrors - 1), 600_000)
  rateLimitState.backoffUntil = Date.now() + backoffMs
  console.info(`StockTwits rate limited, backing off ${backoffMs / 1000}s`)
}

export function clearRateLimit(): void {
  rateLimitState.consecutiveErrors = 0
  rateLimitState.backoffUntil = 0
}
```

---


## X/Twitter Client (Phase 4.5)

Uses official TypeScript SDK `@xdevplatform/xdk`. X API v2 pay-per-use — no subscriptions, credit-based. BYOK: each user has own bearer token + credits.

```bash
pnpm add @xdevplatform/xdk -w --filter @repo/data-ops
```

### X Client

```ts
// packages/data-ops/src/providers/social/x-client.ts

import { Client } from "@xdevplatform/xdk"

interface XSearchOptions {
  maxResults?: number    // 10-100 per request
  sinceId?: string       // incremental polling cursor
  startTime?: string     // ISO 8601
}

interface XSearchResult {
  id: string
  text: string
  authorId: string
  createdAt: string
  publicMetrics: {
    retweetCount: number
    likeCount: number
    replyCount: number
    impressionCount: number
  }
  entities?: {
    cashtags?: Array<{ tag: string }>
  }
}

export class XClient {
  private client: Client

  constructor(bearerToken: string) {
    this.client = new Client({ bearerToken })
  }

  async searchCashtagPosts(
    symbols: string[],
    options?: XSearchOptions
  ): Promise<XSearchResult[]> {
    const query = buildCashtagQuery(symbols)
    return this.search(query, options)
  }

  async searchInfluencerPosts(
    usernames: string[],
    options?: XSearchOptions
  ): Promise<XSearchResult[]> {
    const query = buildInfluencerQuery(usernames)
    return this.search(query, options)
  }

  async getRecentMentions(
    symbols: string[],
    since?: string
  ): Promise<XSearchResult[]> {
    return this.searchCashtagPosts(symbols, {
      startTime: since,
      maxResults: 100,
    })
  }

  private async search(
    query: string,
    options?: XSearchOptions
  ): Promise<XSearchResult[]> {
    // Uses /2/tweets/search/recent (7-day window, sufficient for trading)
    // SDK handles pagination via async iteration
    // Max 100 results per request, 512-char query length
  }
}

export class XApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`X API error (${statusCode}): ${body}`)
    this.name = "XApiError"
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429
  }
}
```

### Query Builder

```ts
// packages/data-ops/src/providers/social/x-query-builder.ts

// Cashtag operator ($) is native to X search — maps directly to watchlist symbols
// Query length limit: 512 chars standard, 4096 enterprise
// ~10 cashtags per query batch with filters

export function buildCashtagQuery(symbols: string[]): string {
  const cashtags = symbols.map(s => `$${s}`).join(" OR ")
  return `(${cashtags}) lang:en -is:retweet -is:reply`
}

export function buildInfluencerQuery(usernames: string[]): string {
  const from = usernames.map(u => `from:${u}`).join(" OR ")
  return `(${from}) has:cashtags lang:en -is:retweet`
}

export function buildVerifiedCashtagQuery(symbols: string[]): string {
  const cashtags = symbols.map(s => `$${s}`).join(" OR ")
  return `(${cashtags}) is:verified lang:en -is:retweet -is:reply`
}
```

### X Signal Types

| Signal Type | Source | Direction Logic | Strength Logic |
|---|---|---|---|
| `mention` | Cashtag mention count/velocity | Neutral (volume signal) | Higher velocity = higher strength |
| `influencer` | Verified/high-follower accounts | Neutral (defer sentiment to Phase 6 LLM) | Follower count + engagement metrics |
| `trending` | Spike in cashtag mention volume vs baseline | Neutral (volume signal) | Spike magnitude |
| `sentiment` | Post text classification | Bullish/bearish/neutral | Requires LLM — defer to Phase 6 |

Unlike StockTwits (user-tagged sentiment), X posts require LLM classification for sentiment. MVP X integration uses `mention` and `influencer` types only.

### X API Constraints

| Constraint | Value | Impact |
|---|---|---|
| Recent search window | 7 days | Sufficient for trading signals |
| Results per request | 100 max | Batch watchlist into ~10-symbol queries |
| Query length | 512 chars (standard) | ~10 cashtags per query with filters |
| Full-archive | Pay-per-use only | Not needed |
| Filtered stream | Up to 1,000 rules | Not used — CF Workers can't hold persistent connections |

### Filtered Stream Decision

**Do not use filtered stream.** CF Workers have 30s CPU time limit, can't maintain persistent HTTP connections. Cron-based search polling (already designed) is correct. Future: Durable Objects + filtered stream for real-time post-MVP.

---


## Signal Aggregator Service

```ts
// packages/data-ops/src/services/signal-aggregator.ts

import { eq, and, inArray, desc, gt } from "drizzle-orm"
import { rawEvents, signals, watchlists, ingestionState } from "../drizzle/schema"
import {
  createStockTwitsClient,
  StockTwitsMessage,
  StockTwitsError,
  isRateLimited,
  recordRateLimit,
  clearRateLimit,
} from "../providers/social/stocktwits"
import type { Database } from "../database/setup"
import type { Signal, SignalDirection } from "../providers/social/types"

interface AggregatorContext {
  db: Database
  userId: string
}

export async function ingestStockTwitsForUser(ctx: AggregatorContext): Promise<{
  rawCount: number
  signalCount: number
  skipped: boolean
}> {
  const { db, userId } = ctx

  // Check rate limit backoff
  if (isRateLimited()) {
    console.info(`Skipping ingestion for ${userId}, rate limited`)
    return { rawCount: 0, signalCount: 0, skipped: true }
  }

  const client = createStockTwitsClient()

  // Get user's watchlist
  const userWatchlist = await db
    .select({ symbol: watchlists.symbol })
    .from(watchlists)
    .where(eq(watchlists.userId, userId))

  if (userWatchlist.length === 0) {
    return { rawCount: 0, signalCount: 0, skipped: false }
  }

  const symbols = userWatchlist.map(w => w.symbol)
  let rawCount = 0
  let signalCount = 0

  // 1. Ingest trending signals (symbols that are trending)
  try {
    const trending = await client.getTrendingSymbols()
    const trendingSymbols = new Set(trending.map(t => t.symbol))

    for (const symbol of symbols) {
      if (trendingSymbols.has(symbol)) {
        const trendingData = trending.find(t => t.symbol === symbol)!
        const sourceId = `trending:${symbol}:${new Date().toISOString().slice(0, 13)}` // hourly dedupe

        const existing = await db
          .select({ id: rawEvents.id })
          .from(rawEvents)
          .where(
            and(
              eq(rawEvents.userId, userId),
              eq(rawEvents.source, "stocktwits"),
              eq(rawEvents.sourceId, sourceId)
            )
          )
          .limit(1)

        if (existing.length === 0) {
          const [rawEvent] = await db
            .insert(rawEvents)
            .values({
              userId,
              source: "stocktwits",
              sourceId,
              rawContent: trendingData,
            })
            .returning()
          rawCount++

          await db.insert(signals).values({
            userId,
            rawEventId: rawEvent.id,
            source: "stocktwits",
            symbol,
            signalType: "trending",
            direction: "bullish",
            strength: String(Math.min(trendingData.watchlist_count / 10000, 1)),
            summary: `${symbol} trending on StockTwits (${trendingData.watchlist_count} watchers)`,
            metadata: { watchlist_count: trendingData.watchlist_count },
          })
          signalCount++
        }
      }
    }
    clearRateLimit()
  } catch (err) {
    if (err instanceof StockTwitsError && err.isRateLimited) {
      recordRateLimit()
      return { rawCount, signalCount, skipped: true }
    }
    console.info(`Failed to fetch trending:`, err)
  }

  // 2. Ingest sentiment signals (per-symbol messages)
  for (const symbol of symbols.slice(0, 10)) { // max 10 symbols per run
    try {
      const stream = await client.getSymbolStream(symbol, { limit: 30 })

      for (const msg of stream.messages) {
        // Check if already ingested (dedupe)
        const existing = await db
          .select({ id: rawEvents.id })
          .from(rawEvents)
          .where(
            and(
              eq(rawEvents.userId, userId),
              eq(rawEvents.source, "stocktwits"),
              eq(rawEvents.sourceId, String(msg.id))
            )
          )
          .limit(1)

        if (existing.length > 0) continue

        // Store raw event
        const [rawEvent] = await db
          .insert(rawEvents)
          .values({
            userId,
            source: "stocktwits",
            sourceId: String(msg.id),
            rawContent: msg,
          })
          .returning()

        rawCount++

        // Create structured signal
        const direction = msgToDirection(msg)
        const strength = calculateStrength(msg)

        await db.insert(signals).values({
          userId,
          rawEventId: rawEvent.id,
          source: "stocktwits",
          symbol,
          signalType: "sentiment",
          direction,
          strength: String(strength),
          summary: truncate(msg.body, 200),
          metadata: {
            username: msg.user.username,
            followers: msg.user.followers,
            messageId: msg.id,
          },
        })

        signalCount++
      }
      clearRateLimit()
    } catch (err) {
      if (err instanceof StockTwitsError && err.isRateLimited) {
        recordRateLimit()
        console.info(`Rate limited at symbol ${symbol}`)
        break
      }
      console.info(`Failed to fetch ${symbol}:`, err)
    }
  }

  // Update ingestion state
  await db
    .insert(ingestionState)
    .values({
      userId,
      source: "stocktwits",
      lastPollAt: new Date(),
      errorCount: 0,
    })
    .onConflictDoUpdate({
      target: [ingestionState.userId, ingestionState.source],
      set: {
        lastPollAt: new Date(),
        errorCount: 0,
      },
    })

  return { rawCount, signalCount, skipped: false }
}

function msgToDirection(msg: StockTwitsMessage): SignalDirection {
  const sentiment = msg.entities?.sentiment?.basic
  if (sentiment === "Bullish") return "bullish"
  if (sentiment === "Bearish") return "bearish"
  return "neutral"
}

function calculateStrength(msg: StockTwitsMessage): number {
  // Base strength on user influence
  const followers = msg.user.followers
  if (followers > 10000) return 0.9
  if (followers > 1000) return 0.7
  if (followers > 100) return 0.5
  return 0.3
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 3) + "..." : str
}
```

---


## Watchlist Queries

```ts
// packages/data-ops/src/queries/watchlist.ts

import { eq, and, desc } from "drizzle-orm"
import { watchlists, signals } from "../drizzle/schema"
import type { Database } from "../database/setup"

export async function getUserWatchlist(db: Database, userId: string) {
  return db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, userId))
    .orderBy(desc(watchlists.addedAt))
}

export async function addToWatchlist(
  db: Database,
  userId: string,
  symbol: string
): Promise<{ id: string; symbol: string }> {
  const normalized = symbol.toUpperCase().trim()

  const [result] = await db
    .insert(watchlists)
    .values({ userId, symbol: normalized })
    .onConflictDoNothing()
    .returning()

  if (!result) {
    // Already exists
    const [existing] = await db
      .select()
      .from(watchlists)
      .where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, normalized)))
    return existing
  }

  return result
}

export async function removeFromWatchlist(
  db: Database,
  userId: string,
  symbol: string
): Promise<boolean> {
  const normalized = symbol.toUpperCase().trim()

  const result = await db
    .delete(watchlists)
    .where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, normalized)))
    .returning()

  return result.length > 0
}

export async function getWatchlistCount(db: Database, userId: string): Promise<number> {
  const result = await db
    .select({ count: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.userId, userId))

  return result.length
}
```

---


## Symbol Validation

Validate symbols against Alpaca assets API before adding to watchlist.

```ts
// packages/data-ops/src/services/symbol-validator.ts

import { AlpacaClient } from "../providers/alpaca/client"

interface AssetInfo {
  symbol: string
  name: string
  exchange: string
  asset_class: string // "us_equity", "crypto"
  tradable: boolean
}

// Cache valid symbols (KV or in-memory)
const symbolCache = new Map<string, AssetInfo | null>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function validateSymbol(
  alpacaClient: AlpacaClient,
  symbol: string
): Promise<{ valid: boolean; asset?: AssetInfo; error?: string }> {
  const normalized = symbol.toUpperCase().trim()

  // Check cache
  const cached = symbolCache.get(normalized)
  if (cached !== undefined) {
    if (cached === null) {
      return { valid: false, error: "Symbol not found" }
    }
    return { valid: true, asset: cached }
  }

  try {
    const asset = await alpacaClient.request<AssetInfo>(
      "GET",
      `/v2/assets/${normalized}`
    )

    if (!asset.tradable) {
      symbolCache.set(normalized, null)
      return { valid: false, error: "Symbol not tradable" }
    }

    symbolCache.set(normalized, asset)
    setTimeout(() => symbolCache.delete(normalized), CACHE_TTL)

    return { valid: true, asset }
  } catch (err) {
    if (err instanceof AlpacaApiError && err.statusCode === 404) {
      symbolCache.set(normalized, null)
      return { valid: false, error: "Symbol not found" }
    }
    throw err
  }
}
```

### Updated Add to Watchlist

```ts
// packages/data-ops/src/queries/watchlist.ts

export async function addToWatchlist(
  db: Database,
  userId: string,
  symbol: string,
  alpacaClient?: AlpacaClient
): Promise<{ id: string; symbol: string } | { error: string }> {
  const normalized = symbol.toUpperCase().trim()

  // Validate symbol if Alpaca client provided
  if (alpacaClient) {
    const validation = await validateSymbol(alpacaClient, normalized)
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid symbol" }
    }
  }

  const [result] = await db
    .insert(watchlists)
    .values({ userId, symbol: normalized })
    .onConflictDoNothing()
    .returning()

  if (!result) {
    const [existing] = await db
      .select()
      .from(watchlists)
      .where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, normalized)))
    return existing
  }

  return result
}
```

---


## Signal Queries

```ts
// packages/data-ops/src/queries/signals.ts

import { eq, and, desc, gt, inArray, sql } from "drizzle-orm"
import { signals, watchlists } from "../drizzle/schema"
import type { Database } from "../database/setup"

export interface GetSignalsParams {
  userId: string
  symbol?: string
  limit?: number
  since?: Date
}

export async function getSignals(db: Database, params: GetSignalsParams) {
  const { userId, symbol, limit = 50, since } = params

  let query = db
    .select()
    .from(signals)
    .where(eq(signals.userId, userId))
    .orderBy(desc(signals.createdAt))
    .limit(limit)

  if (symbol) {
    query = query.where(and(eq(signals.userId, userId), eq(signals.symbol, symbol)))
  }

  if (since) {
    query = query.where(and(eq(signals.userId, userId), gt(signals.createdAt, since)))
  }

  return query
}

export async function getSignalsForWatchlist(
  db: Database,
  userId: string,
  limit = 50
) {
  // Get user's watchlist symbols
  const userSymbols = await db
    .select({ symbol: watchlists.symbol })
    .from(watchlists)
    .where(eq(watchlists.userId, userId))

  if (userSymbols.length === 0) {
    return []
  }

  const symbols = userSymbols.map(s => s.symbol)

  return db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), inArray(signals.symbol, symbols)))
    .orderBy(desc(signals.createdAt))
    .limit(limit)
}

export async function getSignalStats(db: Database, userId: string, symbol: string) {
  const stats = await db
    .select({
      direction: signals.direction,
      count: sql<number>`count(*)::int`,
      avgStrength: sql<number>`avg(${signals.strength})::float`,
    })
    .from(signals)
    .where(and(eq(signals.userId, userId), eq(signals.symbol, symbol)))
    .groupBy(signals.direction)

  return stats
}
```

---


## Cleanup Service

```ts
// packages/data-ops/src/services/cleanup.ts

import { lt, and } from "drizzle-orm"
import { rawEvents, signals } from "../drizzle/schema"
import type { Database } from "../database/setup"

const RETENTION_DAYS = 30

export async function cleanupOldEvents(db: Database): Promise<{
  rawDeleted: number
  signalsDeleted: number
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // Delete old signals first (FK constraint)
  const deletedSignals = await db
    .delete(signals)
    .where(lt(signals.createdAt, cutoff))
    .returning()

  // Delete old raw events
  const deletedRaw = await db
    .delete(rawEvents)
    .where(lt(rawEvents.ingestedAt, cutoff))
    .returning()

  return {
    rawDeleted: deletedRaw.length,
    signalsDeleted: deletedSignals.length,
  }
}
```

---


## Cron Handler

```ts
// apps/data-service/src/scheduled/index.ts

import { cleanupOldEvents } from "@repo/data-ops/services/cleanup"
import { ingestStockTwitsForUser } from "@repo/data-ops/services/signal-aggregator"
import { getActiveUsers } from "@repo/data-ops/queries/users"

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
) {
  const db = getDb(env)

  switch (controller.cron) {
    // Every 5 min during market hours (9:30 AM - 4 PM ET, Mon-Fri)
    // "*/5 13-20 * * 1-5" in UTC (market hours)
    case "*/5 13-20 * * 1-5": {
      const users = await getActiveUsers(db)

      // Fan out ingestion to all active users
      const results = await Promise.allSettled(
        users.map(user =>
          ingestStockTwitsForUser({ db, userId: user.id })
        )
      )

      const succeeded = results.filter(r => r.status === "fulfilled").length
      const failed = results.filter(r => r.status === "rejected").length

      console.log(`Ingestion complete: ${succeeded} succeeded, ${failed} failed`)
      break
    }

    // Daily cleanup at 5 AM UTC
    case "0 5 * * *": {
      const result = await cleanupOldEvents(db)
      console.log(`Cleanup: deleted ${result.rawDeleted} raw, ${result.signalsDeleted} signals`)
      break
    }
  }
}
```

### Wrangler Cron Config

```jsonc
// apps/data-service/wrangler.jsonc
{
  // ...
  "triggers": {
    "crons": [
      "*/5 13-20 * * 1-5",  // Signal ingestion (market hours)
      "0 5 * * *"           // Daily cleanup
    ]
  }
}
```

---

