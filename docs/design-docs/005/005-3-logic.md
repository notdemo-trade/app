# Phase 5: Technical Analysis Agent — Part 3: Business Logic

## TechnicalAnalysisAgent

```ts
// apps/data-service/src/agents/technical-analysis-agent.ts

import { Agent, callable } from "agents"
import type { TAAgentState, TechnicalIndicators, TechnicalSignal, AnalysisResult, Timeframe, Bar } from "@repo/data-ops/agents/ta/types"
import { computeTechnicals } from "@repo/data-ops/providers/technicals/calculations"
import { detectSignals } from "@repo/data-ops/providers/technicals/signals"
import { AlpacaMarketDataProvider } from "@repo/data-ops/providers/alpaca/market-data"
import { getAlpacaClientForUser } from "@repo/data-ops/providers/alpaca/client"
import { insertSignal } from "@repo/data-ops/signals"
import { initDatabase } from "@repo/data-ops/database/setup"

export class TechnicalAnalysisAgent extends Agent<Env, TAAgentState> {
  initialState: TAAgentState = {
    lastComputeAt: null,
    symbol: "",
    latestPrice: null,
    signalCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    const [, symbol] = this.name.split(":")
    this.setState({ ...this.state, symbol })

    // Init DB for this DO isolate (module-scoped singleton won't carry over from worker entry)
    initDatabase({
      host: this.env.DATABASE_HOST,
      username: this.env.DATABASE_USERNAME,
      password: this.env.DATABASE_PASSWORD,
    })

    // SQLite tables for local cache
    this.sql`CREATE TABLE IF NOT EXISTS bars (
      timestamp TEXT PRIMARY KEY, open REAL, high REAL, low REAL, close REAL,
      volume INTEGER, trade_count INTEGER, vwap REAL
    )`
    this.sql`CREATE TABLE IF NOT EXISTS indicators (
      key TEXT PRIMARY KEY DEFAULT 'latest', data TEXT NOT NULL, computed_at TEXT NOT NULL
    )`
    this.sql`CREATE TABLE IF NOT EXISTS detected_signals (
      id TEXT PRIMARY KEY, type TEXT, direction TEXT, strength REAL, description TEXT, detected_at TEXT
    )`

    // Fixed 5-min interval for MVP. Market-hours optimization deferred.
    this.schedule(300)
  }

  @callable()
  async getSignals(since?: string): Promise<TechnicalSignal[]> {
    const rows = since
      ? this.sql<{ type: string; direction: string; strength: number; description: string }>`
          SELECT type, direction, strength, description FROM detected_signals
          WHERE detected_at > ${since} ORDER BY detected_at DESC LIMIT 20`
      : this.sql<{ type: string; direction: string; strength: number; description: string }>`
          SELECT type, direction, strength, description FROM detected_signals
          ORDER BY detected_at DESC LIMIT 20`
    return rows as TechnicalSignal[]
  }

  @callable()
  async getIndicators(): Promise<TechnicalIndicators | null> {
    const rows = this.sql<{ data: string }>`SELECT data FROM indicators WHERE key = 'latest'`
    if (rows.length === 0) return null
    return JSON.parse(rows[0].data) as TechnicalIndicators
  }

  @callable()
  async analyze(timeframe: Timeframe = "1Day"): Promise<AnalysisResult> {
    const [userId, symbol] = this.name.split(":")
    const marketData = await this.getMarketDataProvider(userId)
    const bars = await marketData.getBars(symbol, timeframe, { limit: 250, adjustment: "split" })

    if (bars.length < 50) {
      throw new Error(`Insufficient data for ${symbol}: ${bars.length} bars`)
    }

    // Cache bars in SQLite
    for (const bar of bars) {
      this.sql`INSERT OR REPLACE INTO bars (timestamp, open, high, low, close, volume, trade_count, vwap)
        VALUES (${bar.t}, ${bar.o}, ${bar.h}, ${bar.l}, ${bar.c}, ${bar.v}, ${bar.n}, ${bar.vw})`
    }

    const indicators = computeTechnicals(symbol, bars)
    const signals = detectSignals(indicators)

    // Cache indicators
    this.sql`INSERT OR REPLACE INTO indicators (key, data, computed_at)
      VALUES ('latest', ${JSON.stringify(indicators)}, ${new Date().toISOString()})`

    // Cache signals — strength stored as REAL (number), not string
    this.sql`DELETE FROM detected_signals`
    for (const sig of signals) {
      const id = crypto.randomUUID()
      this.sql`INSERT INTO detected_signals (id, type, direction, strength, description, detected_at)
        VALUES (${id}, ${sig.type}, ${sig.direction}, ${sig.strength}, ${sig.description}, ${new Date().toISOString()})`
    }

    // Write to shared PG
    for (const sig of signals) {
      await insertSignal({
        sourceAgent: "technical_analysis",
        symbol,
        signalType: sig.type,
        direction: sig.direction,
        strength: sig.strength,
        summary: sig.description,
        metadata: { timeframe, symbol },
      })
    }

    this.setState({
      ...this.state,
      lastComputeAt: new Date().toISOString(),
      latestPrice: indicators.price,
      signalCount: signals.length,
    })

    return { symbol, timeframe, indicators, signals, bars }
  }

  // Called by schedule(300)
  async alarm() {
    try {
      await this.analyze("1Day")
    } catch (err) {
      this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
    }
  }

  private async getMarketDataProvider(userId: string): Promise<AlpacaMarketDataProvider> {
    const client = await getAlpacaClientForUser(userId, this.env.CREDENTIALS_ENCRYPTION_KEY)
    if (!client) throw new Error("Alpaca credentials not configured")
    return new AlpacaMarketDataProvider(client)
  }
}
```

---

## Alpaca Client Factory

```ts
// packages/data-ops/src/providers/alpaca/client.ts

import { getCredentials } from "../../queries/credentials"
import { decrypt } from "../../utils/crypto"

export interface AlpacaClient {
  apiKey: string
  apiSecret: string
  baseUrl: string
}

export async function getAlpacaClientForUser(
  userId: string,
  encryptionKey: string,
): Promise<AlpacaClient | null> {
  const creds = await getCredentials(userId, "alpaca")
  if (!creds) return null

  return {
    apiKey: await decrypt(creds.encryptedKey, encryptionKey),
    apiSecret: await decrypt(creds.encryptedSecret, encryptionKey),
    baseUrl: "https://data.alpaca.markets",
  }
}
```

### Encryption Helpers

```ts
// packages/data-ops/src/utils/crypto.ts

const ALGO = "AES-GCM"
const IV_LENGTH = 12

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret)
  const hash = await crypto.subtle.digest("SHA-256", raw)
  return crypto.subtle.importKey("raw", hash, ALGO, false, ["encrypt", "decrypt"])
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const data = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv }, key, data)
  const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), IV_LENGTH)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(ciphertext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LENGTH)
  const data = combined.slice(IV_LENGTH)
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data)
  return new TextDecoder().decode(decrypted)
}
```

---

## Market Data Provider

```ts
// packages/data-ops/src/providers/alpaca/market-data.ts

import type { AlpacaClient } from "./client"
import type { Bar, Timeframe } from "../../agents/ta/types"

interface GetBarsOptions {
  limit?: number
  adjustment?: "raw" | "split" | "dividend" | "all"
  start?: string
  end?: string
}

interface AlpacaBarResponse {
  bars: AlpacaBar[]
  next_page_token: string | null
}

interface AlpacaBar {
  t: string   // RFC3339 timestamp
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
  n: number   // trade count
  vw: number  // VWAP
}

export class AlpacaMarketDataProvider {
  private client: AlpacaClient

  constructor(client: AlpacaClient) {
    this.client = client
  }

  async getBars(symbol: string, timeframe: Timeframe, opts: GetBarsOptions = {}): Promise<Bar[]> {
    const { limit = 250, adjustment = "split", start, end } = opts
    const params = new URLSearchParams({
      timeframe: this.mapTimeframe(timeframe),
      limit: String(limit),
      adjustment,
    })
    if (start) params.set("start", start)
    if (end) params.set("end", end)

    const url = `${this.client.baseUrl}/v2/stocks/${symbol}/bars?${params}`
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": this.client.apiKey,
        "APCA-API-SECRET-KEY": this.client.apiSecret,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Alpaca API error ${res.status}: ${body}`)
    }

    const data: AlpacaBarResponse = await res.json()
    return data.bars ?? []
  }

  private mapTimeframe(tf: Timeframe): string {
    const map: Record<Timeframe, string> = {
      "1Min": "1Min",
      "5Min": "5Min",
      "15Min": "15Min",
      "1Hour": "1Hour",
      "1Day": "1Day",
    }
    return map[tf]
  }
}
```

---

## Technical Calculations

```ts
// packages/data-ops/src/providers/technicals/calculations.ts

import type { Bar, TechnicalIndicators } from "../../agents/ta/types"

export function computeTechnicals(symbol: string, bars: Bar[]): TechnicalIndicators {
  const closes = bars.map(b => b.c)
  const highs = bars.map(b => b.h)
  const lows = bars.map(b => b.l)
  const volumes = bars.map(b => b.v)
  const latest = bars[bars.length - 1]

  return {
    symbol,
    timestamp: latest.t,
    price: latest.c,
    sma_20: calculateSMA(closes, 20),
    sma_50: calculateSMA(closes, 50),
    sma_200: calculateSMA(closes, 200),
    ema_12: calculateEMA(closes, 12),
    ema_26: calculateEMA(closes, 26),
    rsi_14: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    bollinger: calculateBollingerBands(closes, 20, 2),
    atr_14: calculateATR(highs, lows, closes, 14),
    volume_sma_20: calculateSMA(volumes, 20),
    relative_volume: calculateRelativeVolume(volumes, 20),
  }
}

function calculateSMA(data: number[], period: number): number | null {
  if (data.length < period) return null
  const slice = data.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period) return null
  const k = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k)
  }
  return ema
}

function calculateRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null
  let avgGain = 0
  let avgLoss = 0

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss += Math.abs(diff)
  }
  avgGain /= period
  avgLoss /= period

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period
    }
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  const ema12 = calculateEMA(closes, 12)
  const ema26 = calculateEMA(closes, 26)
  if (ema12 === null || ema26 === null) return null

  // Build MACD line series for signal line EMA
  const macdLine: number[] = []
  const k12 = 2 / 13
  const k26 = 2 / 27
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26

  for (let i = 26; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12)
    e26 = closes[i] * k26 + e26 * (1 - k26)
    macdLine.push(e12 - e26)
  }

  if (macdLine.length < 9) return null
  const signalLine = calculateEMA(macdLine, 9)
  if (signalLine === null) return null

  const macdValue = macdLine[macdLine.length - 1]
  return { macd: macdValue, signal: signalLine, histogram: macdValue - signalLine }
}

function calculateBollingerBands(
  closes: number[], period: number, stdDevMultiplier: number,
): { upper: number; middle: number; lower: number; width: number } | null {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / period
  const variance = slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period
  const stdDev = Math.sqrt(variance)
  const upper = mean + stdDevMultiplier * stdDev
  const lower = mean - stdDevMultiplier * stdDev
  return { upper, middle: mean, lower, width: (upper - lower) / mean }
}

function calculateATR(
  highs: number[], lows: number[], closes: number[], period: number,
): number | null {
  if (highs.length < period + 1) return null
  const trueRanges: number[] = []
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    )
    trueRanges.push(tr)
  }
  // Wilder's smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }
  return atr
}

function calculateRelativeVolume(volumes: number[], period: number): number | null {
  if (volumes.length < period + 1) return null
  const avgVol = volumes.slice(-(period + 1), -1).reduce((a, b) => a + b, 0) / period
  if (avgVol === 0) return null
  return volumes[volumes.length - 1] / avgVol
}
```

---

## Signal Detection

```ts
// packages/data-ops/src/providers/technicals/signals.ts

import type { TechnicalIndicators, TechnicalSignal, SignalDirection } from "../../agents/ta/types"

export function detectSignals(ind: TechnicalIndicators): TechnicalSignal[] {
  const signals: TechnicalSignal[] = []

  // RSI
  if (ind.rsi_14 !== null) {
    if (ind.rsi_14 < 30) {
      signals.push({
        type: "rsi_oversold",
        direction: "bullish",
        strength: Math.min(1, (30 - ind.rsi_14) / 30),
        description: `RSI at ${ind.rsi_14.toFixed(1)} — oversold`,
      })
    } else if (ind.rsi_14 > 70) {
      signals.push({
        type: "rsi_overbought",
        direction: "bearish",
        strength: Math.min(1, (ind.rsi_14 - 70) / 30),
        description: `RSI at ${ind.rsi_14.toFixed(1)} — overbought`,
      })
    }
  }

  // MACD crossover
  if (ind.macd !== null) {
    if (ind.macd.histogram > 0 && ind.macd.macd > 0) {
      signals.push({
        type: "macd_bullish",
        direction: "bullish",
        strength: Math.min(1, Math.abs(ind.macd.histogram) / ind.price * 100),
        description: `MACD bullish crossover (histogram: ${ind.macd.histogram.toFixed(3)})`,
      })
    } else if (ind.macd.histogram < 0 && ind.macd.macd < 0) {
      signals.push({
        type: "macd_bearish",
        direction: "bearish",
        strength: Math.min(1, Math.abs(ind.macd.histogram) / ind.price * 100),
        description: `MACD bearish crossover (histogram: ${ind.macd.histogram.toFixed(3)})`,
      })
    }
  }

  // Bollinger Band touch
  if (ind.bollinger !== null) {
    const { upper, lower } = ind.bollinger
    if (ind.price <= lower) {
      signals.push({
        type: "bb_lower_touch",
        direction: "bullish",
        strength: Math.min(1, (lower - ind.price) / ind.price * 100 + 0.3),
        description: `Price touching lower Bollinger Band ($${lower.toFixed(2)})`,
      })
    } else if (ind.price >= upper) {
      signals.push({
        type: "bb_upper_touch",
        direction: "bearish",
        strength: Math.min(1, (ind.price - upper) / ind.price * 100 + 0.3),
        description: `Price touching upper Bollinger Band ($${upper.toFixed(2)})`,
      })
    }
  }

  // SMA golden/death cross
  if (ind.sma_50 !== null && ind.sma_200 !== null) {
    if (ind.sma_50 > ind.sma_200) {
      signals.push({
        type: "golden_cross_active",
        direction: "bullish",
        strength: Math.min(1, (ind.sma_50 - ind.sma_200) / ind.sma_200 * 10),
        description: `Golden cross active (SMA50 ${ind.sma_50.toFixed(2)} > SMA200 ${ind.sma_200.toFixed(2)})`,
      })
    } else {
      signals.push({
        type: "death_cross_active",
        direction: "bearish",
        strength: Math.min(1, (ind.sma_200 - ind.sma_50) / ind.sma_200 * 10),
        description: `Death cross active (SMA50 ${ind.sma_50.toFixed(2)} < SMA200 ${ind.sma_200.toFixed(2)})`,
      })
    }
  }

  // Volume spike
  if (ind.relative_volume !== null && ind.relative_volume > 2.0) {
    signals.push({
      type: "high_volume",
      direction: "neutral",
      strength: Math.min(1, (ind.relative_volume - 1) / 4),
      description: `Volume ${ind.relative_volume.toFixed(1)}x above 20-day average`,
    })
  }

  return signals
}
```

---
