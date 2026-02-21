# Phase 4: Signal Gathering Agents — Part 3: Business Logic

## StockTwitsAgent

```ts
// apps/data-service/src/agents/stocktwits-agent.ts

import { Agent, callable } from "agents"
import type { SignalAgentRPC, Signal } from "@repo/data-ops/agents/signal/types"

interface StockTwitsState {
  lastPollAt: string | null
  signalCount: number
  errorCount: number
  lastError: string | null
}

export class StockTwitsAgent extends Agent<Env, StockTwitsState> implements SignalAgentRPC {
  initialState: StockTwitsState = {
    lastPollAt: null,
    signalCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS poll_cursor (
        key TEXT PRIMARY KEY DEFAULT 'main',
        last_poll_at TEXT,
        last_event_id TEXT
      )
    `
  }

  @callable()
  async getSignals(since?: string): Promise<Signal[]> {
    // Query shared PG for signals from this agent + user's watchlist symbols
    const userId = this.name // instance = userId
    return getSignalsForAgent(this.env, "stocktwits", userId, since)
  }

  @callable()
  async getStatus() {
    return {
      lastPollAt: this.state.lastPollAt,
      errorCount: this.state.errorCount,
    }
  }

  @callable()
  async ingestNow(): Promise<{ rawCount: number; signalCount: number }> {
    return this.ingest()
  }

  // Called by scheduleEvery(300)
  async pollSignals() {
    if (isRateLimited()) return
    await this.ingest()
  }

  private async ingest(): Promise<{ rawCount: number; signalCount: number }> {
    const userId = this.name
    const client = createStockTwitsClient()
    const db = getDb(this.env)

    const userWatchlist = await getUserWatchlist(db, userId)
    if (userWatchlist.length === 0) return { rawCount: 0, signalCount: 0 }

    const symbols = userWatchlist.map(w => w.symbol)
    let rawCount = 0
    let signalCount = 0

    // 1. Trending signals
    try {
      const trending = await client.getTrendingSymbols()
      const trendingSet = new Set(trending.map(t => t.symbol))

      for (const symbol of symbols) {
        if (trendingSet.has(symbol)) {
          const data = trending.find(t => t.symbol === symbol)!
          const sourceId = `trending:${symbol}:${new Date().toISOString().slice(0, 13)}`

          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "stocktwits",
            sourceId,
            symbol,
            rawContent: data,
          })

          if (inserted) {
            rawCount++
            await insertSignal(db, {
              sourceAgent: "stocktwits",
              symbol,
              signalType: "trending",
              direction: "bullish",
              strength: Math.min(data.watchlist_count / 10000, 1),
              summary: `${symbol} trending on StockTwits (${data.watchlist_count} watchers)`,
              metadata: { watchlist_count: data.watchlist_count },
              rawEventId: inserted.id,
            })
            signalCount++
          }
        }
      }
      clearRateLimit()
    } catch (err) {
      if (err instanceof StockTwitsError && err.isRateLimited) {
        recordRateLimit()
        return { rawCount, signalCount }
      }
    }

    // 2. Per-symbol sentiment
    for (const symbol of symbols.slice(0, 10)) {
      try {
        const stream = await client.getSymbolStream(symbol, { limit: 30 })

        for (const msg of stream.messages) {
          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "stocktwits",
            sourceId: String(msg.id),
            symbol,
            rawContent: msg,
          })

          if (inserted) {
            rawCount++
            await insertSignal(db, {
              sourceAgent: "stocktwits",
              symbol,
              signalType: "sentiment",
              direction: msgToDirection(msg),
              strength: calculateStrength(msg),
              summary: truncate(msg.body, 200),
              metadata: { username: msg.user.username, followers: msg.user.followers },
              rawEventId: inserted.id,
            })
            signalCount++
          }
        }
        clearRateLimit()
      } catch (err) {
        if (err instanceof StockTwitsError && err.isRateLimited) {
          recordRateLimit()
          break
        }
      }
    }

    this.setState({
      ...this.state,
      lastPollAt: new Date().toISOString(),
      signalCount: this.state.signalCount + signalCount,
    })

    return { rawCount, signalCount }
  }
}
```

---

## TwitterAgent

```ts
// apps/data-service/src/agents/twitter-agent.ts

import { Agent, callable } from "agents"
import { Client } from "@xdevplatform/xdk"
import type { SignalAgentRPC, Signal } from "@repo/data-ops/agents/signal/types"

interface TwitterState {
  lastPollAt: string | null
  signalCount: number
  errorCount: number
  lastError: string | null
}

export class TwitterAgent extends Agent<Env, TwitterState> implements SignalAgentRPC {
  initialState: TwitterState = {
    lastPollAt: null,
    signalCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS poll_cursor (
        key TEXT PRIMARY KEY DEFAULT 'main',
        last_poll_at TEXT,
        last_event_id TEXT
      )
    `
  }

  @callable()
  async getSignals(since?: string): Promise<Signal[]> {
    return getSignalsForAgent(this.env, "twitter", this.name, since)
  }

  @callable()
  async getStatus() {
    return { lastPollAt: this.state.lastPollAt, errorCount: this.state.errorCount }
  }

  @callable()
  async ingestNow() {
    return this.ingest()
  }

  async pollSignals() {
    await this.ingest()
  }

  private async ingest(): Promise<{ rawCount: number; signalCount: number }> {
    const userId = this.name
    const db = getDb(this.env)

    // Get user's X bearer token (BYOK)
    const xCreds = await getCredential(db, userId, "twitter")
    if (!xCreds) return { rawCount: 0, signalCount: 0 }

    const client = new Client({ bearerToken: xCreds.apiKey })
    const userWatchlist = await getUserWatchlist(db, userId)
    if (userWatchlist.length === 0) return { rawCount: 0, signalCount: 0 }

    const symbols = userWatchlist.map(w => w.symbol)
    let rawCount = 0
    let signalCount = 0

    // Cashtag search — batch symbols into queries (~10 per query)
    const batches = chunkArray(symbols, 10)

    for (const batch of batches) {
      const query = buildCashtagQuery(batch)

      try {
        const results = await searchRecentTweets(client, query, { maxResults: 100 })

        for (const tweet of results) {
          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "twitter",
            sourceId: tweet.id,
            symbol: extractPrimaryCashtag(tweet, batch),
            rawContent: tweet,
          })

          if (inserted) {
            rawCount++
            const signalType = isInfluencer(tweet) ? "influencer" : "mention"

            await insertSignal(db, {
              sourceAgent: "twitter",
              symbol: inserted.symbol,
              signalType,
              direction: "neutral", // sentiment deferred to Phase 6 LLM
              strength: calculateTweetStrength(tweet),
              summary: truncate(tweet.text, 200),
              metadata: {
                authorId: tweet.authorId,
                likes: tweet.publicMetrics?.likeCount,
                retweets: tweet.publicMetrics?.retweetCount,
              },
              rawEventId: inserted.id,
            })
            signalCount++
          }
        }
      } catch (err) {
        this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
      }
    }

    this.setState({ ...this.state, lastPollAt: new Date().toISOString(), signalCount: this.state.signalCount + signalCount })
    return { rawCount, signalCount }
  }
}

function buildCashtagQuery(symbols: string[]): string {
  const cashtags = symbols.map(s => `$${s}`).join(" OR ")
  return `(${cashtags}) lang:en -is:retweet -is:reply`
}
```

---

## SecFilingsAgent

```ts
// apps/data-service/src/agents/sec-filings-agent.ts

import { Agent, callable } from "agents"
import type { SignalAgentRPC, Signal, SecFiling, InsiderTrade } from "@repo/data-ops/agents/signal/types"

const FILINGS_API = "https://api.financialdatasets.ai/filings"
const INSIDER_API = "https://api.financialdatasets.ai/insider-trades"

interface SecState {
  ticker: string
  lastPollAt: string | null
  filingsCount: number
  insiderTradesCount: number
  errorCount: number
  lastError: string | null
}

export class SecFilingsAgent extends Agent<Env, SecState> implements SignalAgentRPC {
  initialState: SecState = {
    ticker: "",
    lastPollAt: null,
    filingsCount: 0,
    insiderTradesCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    // Instance name = ticker
    this.setState({ ...this.state, ticker: this.name })

    this.sql`CREATE TABLE IF NOT EXISTS seen_filings (filing_id TEXT PRIMARY KEY, ingested_at TEXT NOT NULL)`
    this.sql`CREATE TABLE IF NOT EXISTS seen_insider_trades (trade_id TEXT PRIMARY KEY, ingested_at TEXT NOT NULL)`
  }

  @callable()
  async getSignals(since?: string): Promise<Signal[]> {
    // Shared agent — query by symbol, not by userId
    return getSignalsBySymbol(this.env, "sec", this.name, since)
  }

  @callable()
  async getStatus() {
    return { lastPollAt: this.state.lastPollAt, errorCount: this.state.errorCount }
  }

  @callable()
  async ingestNow() {
    return this.ingest()
  }

  async pollFilings() {
    await this.ingest()
  }

  private async ingest(): Promise<{ rawCount: number; signalCount: number }> {
    const ticker = this.name
    const db = getDb(this.env)
    let rawCount = 0
    let signalCount = 0

    // 1. Filings
    try {
      const filings = await fetchFilings(ticker)

      for (const filing of filings) {
        const filingId = `${ticker}:${filing.formType}:${filing.filedAt}`
        const seen = this.sql<{ filing_id: string }>`SELECT filing_id FROM seen_filings WHERE filing_id = ${filingId}`

        if (seen.length === 0) {
          this.sql`INSERT INTO seen_filings (filing_id, ingested_at) VALUES (${filingId}, ${new Date().toISOString()})`

          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "sec",
            sourceId: filingId,
            symbol: ticker,
            rawContent: filing,
          })

          if (inserted) {
            rawCount++
            await insertSignal(db, {
              sourceAgent: "sec",
              symbol: ticker,
              signalType: "filing",
              direction: classifyFilingDirection(filing),
              strength: classifyFilingStrength(filing),
              summary: `${filing.formType}: ${filing.description}`,
              metadata: { formType: filing.formType, filedAt: filing.filedAt, reportUrl: filing.reportUrl },
              rawEventId: inserted.id,
            })
            signalCount++
          }
        }
      }
    } catch (err) {
      this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
    }

    // 2. Insider trades
    try {
      const trades = await fetchInsiderTrades(ticker)

      for (const trade of trades) {
        const tradeId = `${ticker}:${trade.ownerName}:${trade.transactionDate}:${trade.shares}`
        const seen = this.sql<{ trade_id: string }>`SELECT trade_id FROM seen_insider_trades WHERE trade_id = ${tradeId}`

        if (seen.length === 0) {
          this.sql`INSERT INTO seen_insider_trades (trade_id, ingested_at) VALUES (${tradeId}, ${new Date().toISOString()})`

          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "sec",
            sourceId: tradeId,
            symbol: ticker,
            rawContent: trade,
          })

          if (inserted) {
            rawCount++
            await insertSignal(db, {
              sourceAgent: "sec",
              symbol: ticker,
              signalType: "insider",
              direction: trade.transactionType === "purchase" ? "bullish" : "bearish",
              strength: calculateInsiderStrength(trade),
              summary: `${trade.ownerName} ${trade.transactionType} ${trade.shares} shares @ $${trade.pricePerShare}`,
              metadata: { ownerName: trade.ownerName, shares: trade.shares, pricePerShare: trade.pricePerShare },
              rawEventId: inserted.id,
            })
            signalCount++
          }
        }
      }
    } catch (err) {
      this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
    }

    this.setState({ ...this.state, lastPollAt: new Date().toISOString() })
    return { rawCount, signalCount }
  }
}

async function fetchFilings(ticker: string): Promise<SecFiling[]> {
  const res = await fetch(`${FILINGS_API}?ticker=${ticker}`)
  if (!res.ok) throw new Error(`Filings API error: ${res.status}`)
  const data = await res.json()
  return data.filings ?? []
}

async function fetchInsiderTrades(ticker: string): Promise<InsiderTrade[]> {
  const res = await fetch(`${INSIDER_API}?ticker=${ticker}`)
  if (!res.ok) throw new Error(`Insider trades API error: ${res.status}`)
  const data = await res.json()
  return data.insider_trades ?? []
}

function classifyFilingDirection(filing: SecFiling): "bullish" | "bearish" | "neutral" {
  const bearishForms = ["SC 13D/A", "SC TO-T", "8-K"] // proxy fight, tender offer, material event
  const bullishForms = ["S-1", "424B4"] // IPO/offering (context-dependent)
  if (bearishForms.some(f => filing.formType.includes(f))) return "bearish"
  if (bullishForms.some(f => filing.formType.includes(f))) return "bullish"
  return "neutral"
}

function classifyFilingStrength(filing: SecFiling): number {
  const highImpact = ["10-K", "10-Q", "8-K", "SC 13D", "DEF 14A"]
  return highImpact.some(f => filing.formType.includes(f)) ? 0.8 : 0.4
}

function calculateInsiderStrength(trade: InsiderTrade): number {
  const notional = trade.shares * trade.pricePerShare
  if (notional > 1_000_000) return 0.9
  if (notional > 100_000) return 0.7
  if (notional > 10_000) return 0.5
  return 0.3
}
```

---

## FredAgent

```ts
// apps/data-service/src/agents/fred-agent.ts

import { Agent, callable } from "agents"
import type { SignalAgentRPC, Signal, FredObservation } from "@repo/data-ops/agents/signal/types"

interface FredState {
  seriesId: string
  lastPollAt: string | null
  observationCount: number
  latestValue: number | null
  latestDate: string | null
  errorCount: number
  lastError: string | null
}

export class FredAgent extends Agent<Env, FredState> implements SignalAgentRPC {
  initialState: FredState = {
    seriesId: "",
    lastPollAt: null,
    observationCount: 0,
    latestValue: null,
    latestDate: null,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    this.setState({ ...this.state, seriesId: this.name })

    this.sql`CREATE TABLE IF NOT EXISTS observations (date TEXT PRIMARY KEY, value REAL NOT NULL, ingested_at TEXT NOT NULL)`
    this.sql`CREATE TABLE IF NOT EXISTS poll_state (key TEXT PRIMARY KEY DEFAULT 'main', last_poll_at TEXT, last_observation_date TEXT)`
  }

  @callable()
  async getSignals(since?: string): Promise<Signal[]> {
    return getSignalsBySeries(this.env, "fred", this.name, since)
  }

  @callable()
  async getStatus() {
    return { lastPollAt: this.state.lastPollAt, errorCount: this.state.errorCount }
  }

  @callable()
  async getLatestObservation(): Promise<FredObservation | null> {
    const rows = this.sql<{ date: string; value: number }>`
      SELECT date, value FROM observations ORDER BY date DESC LIMIT 1
    `
    if (rows.length === 0) return null
    return { date: rows[0].date, value: rows[0].value, seriesId: this.name }
  }

  @callable()
  async ingestNow() {
    return this.ingest()
  }

  async pollObservations() {
    await this.ingest()
  }

  private async ingest(): Promise<{ rawCount: number; signalCount: number }> {
    const seriesId = this.name
    const db = getDb(this.env)
    let rawCount = 0
    let signalCount = 0

    try {
      const observations = await fetchFredObservations(seriesId, this.env.FRED_API_KEY)

      for (const obs of observations) {
        if (obs.value === ".") continue // FRED uses "." for missing values

        const value = parseFloat(obs.value)
        const existing = this.sql<{ date: string }>`SELECT date FROM observations WHERE date = ${obs.date}`

        if (existing.length === 0) {
          this.sql`INSERT INTO observations (date, value, ingested_at) VALUES (${obs.date}, ${value}, ${new Date().toISOString()})`

          const sourceId = `${seriesId}:${obs.date}`
          const inserted = await insertRawEventIfNew(db, {
            sourceAgent: "fred",
            sourceId,
            seriesId,
            rawContent: { seriesId, date: obs.date, value },
          })

          if (inserted) {
            rawCount++

            // Detect significant changes
            const prevObs = this.sql<{ value: number }>`
              SELECT value FROM observations WHERE date < ${obs.date} ORDER BY date DESC LIMIT 1
            `

            if (prevObs.length > 0) {
              const change = (value - prevObs[0].value) / prevObs[0].value
              const direction = detectMacroDirection(seriesId, change)
              const strength = Math.min(Math.abs(change) * 10, 1)

              if (strength > 0.1) {
                await insertSignal(db, {
                  sourceAgent: "fred",
                  seriesId,
                  signalType: "macro",
                  direction,
                  strength,
                  summary: `${seriesId}: ${formatChange(change)} (${value})`,
                  metadata: { seriesId, date: obs.date, value, previousValue: prevObs[0].value, changePct: change },
                  rawEventId: inserted.id,
                })
                signalCount++
              }
            }
          }
        }
      }

      const latestObs = this.sql<{ date: string; value: number }>`
        SELECT date, value FROM observations ORDER BY date DESC LIMIT 1
      `

      this.setState({
        ...this.state,
        lastPollAt: new Date().toISOString(),
        observationCount: this.state.observationCount + rawCount,
        latestValue: latestObs[0]?.value ?? null,
        latestDate: latestObs[0]?.date ?? null,
      })
    } catch (err) {
      this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
    }

    return { rawCount, signalCount }
  }
}

async function fetchFredObservations(seriesId: string, apiKey: string): Promise<Array<{ date: string; value: string }>> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "10",
  })
  const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`)
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`)
  const data = await res.json()
  return data.observations ?? []
}

function detectMacroDirection(seriesId: string, changePct: number): "bullish" | "bearish" | "neutral" {
  // Series-specific interpretation
  const bearishOnIncrease = ["VIXCLS", "BAMLH0A0HYM2", "DGS10"]
  const invert = bearishOnIncrease.includes(seriesId)

  if (Math.abs(changePct) < 0.01) return "neutral"
  const isUp = changePct > 0
  if (invert) return isUp ? "bearish" : "bullish"
  return isUp ? "bullish" : "bearish"
}
```

---

## Shared Query Helpers

```ts
// packages/data-ops/src/queries/signal-queries.ts

export async function getSignalsForAgent(
  env: Env, sourceAgent: string, userId: string, since?: string
): Promise<Signal[]> {
  const db = getDb(env)
  const watchlist = await getUserWatchlist(db, userId)
  const symbols = watchlist.map(w => w.symbol)

  return db.select().from(signals)
    .where(and(
      eq(signals.sourceAgent, sourceAgent),
      inArray(signals.symbol, symbols),
      since ? gt(signals.createdAt, new Date(since)) : undefined,
    ))
    .orderBy(desc(signals.createdAt))
    .limit(100)
}

export async function getSignalsBySymbol(
  env: Env, sourceAgent: string, symbol: string, since?: string
): Promise<Signal[]> {
  const db = getDb(env)
  return db.select().from(signals)
    .where(and(
      eq(signals.sourceAgent, sourceAgent),
      eq(signals.symbol, symbol),
      since ? gt(signals.createdAt, new Date(since)) : undefined,
    ))
    .orderBy(desc(signals.createdAt))
    .limit(100)
}

export async function getSignalsBySeries(
  env: Env, sourceAgent: string, seriesId: string, since?: string
): Promise<Signal[]> {
  const db = getDb(env)
  return db.select().from(signals)
    .where(and(
      eq(signals.sourceAgent, sourceAgent),
      eq(signals.seriesId, seriesId),
      since ? gt(signals.createdAt, new Date(since)) : undefined,
    ))
    .orderBy(desc(signals.createdAt))
    .limit(100)
}

export async function insertRawEventIfNew(db: Database, event: {
  sourceAgent: string; sourceId: string; symbol?: string; seriesId?: string; rawContent: unknown
}): Promise<{ id: string; symbol: string | null } | null> {
  const [result] = await db.insert(rawEvents).values(event).onConflictDoNothing().returning()
  return result ?? null
}

export async function insertSignal(db: Database, signal: {
  sourceAgent: string; symbol?: string; seriesId?: string; signalType: string
  direction: string; strength: number; summary: string; metadata: Record<string, unknown>
  rawEventId: string
}): Promise<void> {
  await db.insert(signals).values(signal)
}
```

---

## Watchlist Queries

```ts
// packages/data-ops/src/queries/watchlist.ts
// (mostly unchanged from original — same CRUD operations)
// Key change: addToWatchlist now uses Alpaca validation via user's credentials
```

---

## Symbol Validation

```ts
// packages/data-ops/src/services/symbol-validator.ts
// (unchanged from original)
```

---

## Cleanup Service

```ts
// packages/data-ops/src/services/cleanup.ts

const RETENTION_DAYS = 30

export async function cleanupOldEvents(db: Database): Promise<{
  rawDeleted: number
  signalsDeleted: number
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const deletedSignals = await db.delete(signals).where(lt(signals.createdAt, cutoff)).returning()
  const deletedRaw = await db.delete(rawEvents).where(lt(rawEvents.ingestedAt, cutoff)).returning()

  return { rawDeleted: deletedRaw.length, signalsDeleted: deletedSignals.length }
}
```

---
