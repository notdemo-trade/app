# Phase 5: Technical Analysis — Part 3: Business Logic
> Split from `005-phase-5-technical-analysis.md`. See other parts in this directory.

## Market Data Provider

```ts
// packages/data-ops/src/providers/alpaca/market-data.ts

import { AlpacaClient } from "./client"
import type { Bar } from "../technicals/types"

const DATA_BASE_URL = "https://data.alpaca.markets"

export interface BarsParams {
  start?: string
  end?: string
  limit?: number
  adjustment?: "raw" | "split" | "dividend" | "all"
  feed?: "iex" | "sip"
  timeframe?: string
}

export class AlpacaMarketDataProvider {
  private client: AlpacaClient
  private dataHeaders: Record<string, string>

  constructor(client: AlpacaClient) {
    this.client = client
    this.dataHeaders = {
      "APCA-API-KEY-ID": client.config.apiKey,
      "APCA-API-SECRET-KEY": client.config.apiSecret,
      "Content-Type": "application/json",
    }
  }

  async getBars(
    symbol: string,
    timeframe: string,
    params?: BarsParams
  ): Promise<Bar[]> {
    const searchParams = new URLSearchParams()
    searchParams.set("timeframe", timeframe)

    if (params?.start) searchParams.set("start", params.start)
    if (params?.end) searchParams.set("end", params.end)
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.adjustment) searchParams.set("adjustment", params.adjustment)
    if (params?.feed) searchParams.set("feed", params.feed)

    const url = `${DATA_BASE_URL}/v2/stocks/${symbol}/bars?${searchParams}`
    const response = await fetch(url, { headers: this.dataHeaders })

    if (!response.ok) {
      throw new AlpacaDataError(response.status, await response.text())
    }

    const data = await response.json()
    return data.bars || []
  }

  async getLatestBar(symbol: string): Promise<Bar | null> {
    const url = `${DATA_BASE_URL}/v2/stocks/${symbol}/bars/latest`
    const response = await fetch(url, { headers: this.dataHeaders })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new AlpacaDataError(response.status, await response.text())
    }

    const data = await response.json()
    return data.bar || null
  }

  async getLatestBars(symbols: string[]): Promise<Record<string, Bar>> {
    const params = new URLSearchParams()
    params.set("symbols", symbols.join(","))

    const url = `${DATA_BASE_URL}/v2/stocks/bars/latest?${params}`
    const response = await fetch(url, { headers: this.dataHeaders })

    if (!response.ok) {
      throw new AlpacaDataError(response.status, await response.text())
    }

    const data = await response.json()
    return data.bars || {}
  }
}

export class AlpacaDataError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`Alpaca Data API error (${statusCode}): ${body}`)
    this.name = "AlpacaDataError"
  }
}

export function createMarketDataProvider(client: AlpacaClient): AlpacaMarketDataProvider {
  return new AlpacaMarketDataProvider(client)
}
```

---


## Technical Calculations

```ts
// packages/data-ops/src/providers/technicals/calculations.ts

import type { Bar, TechnicalIndicators } from "./types"

export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const slice = prices.slice(-period)
  return slice.reduce((sum, p) => sum + p, 0) / period
}

export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null

  const multiplier = 2 / (period + 1)

  // Seed with SMA
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period

  // Apply EMA formula
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }

  return ema
}

export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null

  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }

  const gains = changes.map(c => (c > 0 ? c : 0))
  const losses = changes.map(c => (c < 0 ? -c : 0))

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function calculateMACD(
  prices: number[]
): { macd: number; signal: number; histogram: number } | null {
  if (prices.length < 35) return null // 26 + 9 for signal

  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)

  if (ema12 === null || ema26 === null) return null

  // Build MACD history for signal line
  const macdHistory: number[] = []

  for (let i = 26; i <= prices.length; i++) {
    const slice = prices.slice(0, i)
    const e12 = calculateEMA(slice, 12)
    const e26 = calculateEMA(slice, 26)
    if (e12 !== null && e26 !== null) {
      macdHistory.push(e12 - e26)
    }
  }

  if (macdHistory.length < 9) return null

  const macdLine = ema12 - ema26
  const signalLine = calculateEMA(macdHistory, 9)

  if (signalLine === null) return null

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  }
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number; width: number } | null {
  if (prices.length < period) return null

  const slice = prices.slice(-period)
  const middle = slice.reduce((a, b) => a + b, 0) / period

  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period
  const stdDev = Math.sqrt(variance)

  const upper = middle + stdDevMultiplier * stdDev
  const lower = middle - stdDevMultiplier * stdDev
  const width = (upper - lower) / middle

  return { upper, middle, lower, width }
}

export function calculateATR(bars: Bar[], period: number = 14): number | null {
  if (bars.length < period + 1) return null

  const trueRanges: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const current = bars[i]
    const prev = bars[i - 1]
    const tr = Math.max(
      current.h - current.l,
      Math.abs(current.h - prev.c),
      Math.abs(current.l - prev.c)
    )
    trueRanges.push(tr)
  }

  // Initial ATR is simple average
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period

  // Smooth subsequent values
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }

  return atr
}

export function computeTechnicals(symbol: string, bars: Bar[]): TechnicalIndicators {
  const closes = bars.map(b => b.c)
  const volumes = bars.map(b => b.v)
  const latestBar = bars[bars.length - 1]

  const volumeSma20 = calculateSMA(volumes, 20)
  const currentVolume = volumes[volumes.length - 1]

  return {
    symbol,
    timestamp: latestBar.t,
    price: latestBar.c,
    sma_20: calculateSMA(closes, 20),
    sma_50: calculateSMA(closes, 50),
    sma_200: calculateSMA(closes, 200),
    ema_12: calculateEMA(closes, 12),
    ema_26: calculateEMA(closes, 26),
    rsi_14: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    bollinger: calculateBollingerBands(closes, 20, 2),
    atr_14: calculateATR(bars, 14),
    volume_sma_20: volumeSma20,
    relative_volume: volumeSma20 ? currentVolume / volumeSma20 : null,
  }
}
```

---


## Signal Detection

```ts
// packages/data-ops/src/providers/technicals/signals.ts

import type { TechnicalIndicators, TechnicalSignal, SignalDirection } from "./types"

export function detectSignals(t: TechnicalIndicators): TechnicalSignal[] {
  const signals: TechnicalSignal[] = []

  // RSI Signals
  if (t.rsi_14 !== null) {
    if (t.rsi_14 < 30) {
      signals.push({
        type: "rsi_oversold",
        direction: "bullish",
        strength: Math.min(1, (30 - t.rsi_14) / 30),
        description: `RSI oversold at ${t.rsi_14.toFixed(1)}`,
      })
    } else if (t.rsi_14 > 70) {
      signals.push({
        type: "rsi_overbought",
        direction: "bearish",
        strength: Math.min(1, (t.rsi_14 - 70) / 30),
        description: `RSI overbought at ${t.rsi_14.toFixed(1)}`,
      })
    }
  }

  // MACD Signals
  if (t.macd !== null) {
    const { macd, signal, histogram } = t.macd
    if (histogram > 0 && macd > signal) {
      signals.push({
        type: "macd_bullish",
        direction: "bullish",
        strength: Math.min(1, Math.abs(histogram) * 10),
        description: "MACD bullish crossover",
      })
    } else if (histogram < 0 && macd < signal) {
      signals.push({
        type: "macd_bearish",
        direction: "bearish",
        strength: Math.min(1, Math.abs(histogram) * 10),
        description: "MACD bearish crossover",
      })
    }
  }

  // Bollinger Band Signals
  if (t.bollinger !== null) {
    const { upper, lower } = t.bollinger
    const range = upper - lower
    const position = range > 0 ? (t.price - lower) / range : 0.5

    if (position < 0.1) {
      signals.push({
        type: "bb_lower_touch",
        direction: "bullish",
        strength: 1 - position * 10,
        description: "Price near lower Bollinger Band",
      })
    } else if (position > 0.9) {
      signals.push({
        type: "bb_upper_touch",
        direction: "bearish",
        strength: (position - 0.9) * 10,
        description: "Price near upper Bollinger Band",
      })
    }
  }

  // SMA Cross Signals
  if (t.sma_20 !== null && t.sma_50 !== null) {
    const crossDistance = Math.abs(t.sma_20 - t.sma_50) / t.price

    if (t.sma_20 > t.sma_50) {
      signals.push({
        type: "golden_cross_active",
        direction: "bullish",
        strength: Math.min(1, crossDistance * 20),
        description: "SMA 20 above SMA 50 (golden cross)",
      })
    } else {
      signals.push({
        type: "death_cross_active",
        direction: "bearish",
        strength: Math.min(1, crossDistance * 20),
        description: "SMA 20 below SMA 50 (death cross)",
      })
    }
  }

  // Volume Signal
  if (t.relative_volume !== null && t.relative_volume > 2) {
    signals.push({
      type: "high_volume",
      direction: "neutral",
      strength: Math.min(1, (t.relative_volume - 1) / 4),
      description: `Volume ${t.relative_volume.toFixed(1)}x average`,
    })
  }

  return signals
}
```

---


## Analysis Service

```ts
// packages/data-ops/src/services/analysis-service.ts

import { AlpacaClient } from "../providers/alpaca/client"
import { createMarketDataProvider } from "../providers/alpaca/market-data"
import { computeTechnicals } from "../providers/technicals/calculations"
import { detectSignals } from "../providers/technicals/signals"
import type { AnalysisResult, Timeframe, Bar } from "../providers/technicals/types"

const MIN_BARS = 50
const DEFAULT_BARS = 250

export interface AnalysisServiceConfig {
  alpacaClient: AlpacaClient
}

export async function analyzeSymbol(
  config: AnalysisServiceConfig,
  symbol: string,
  timeframe: Timeframe = "1Day"
): Promise<AnalysisResult> {
  const marketData = createMarketDataProvider(config.alpacaClient)

  const bars = await marketData.getBars(symbol.toUpperCase(), timeframe, {
    limit: DEFAULT_BARS,
    adjustment: "split",
  })

  if (bars.length < MIN_BARS) {
    throw new InsufficientDataError(symbol, bars.length, MIN_BARS)
  }

  const indicators = computeTechnicals(symbol, bars)
  const signals = detectSignals(indicators)

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    indicators,
    signals,
    bars,
  }
}

export async function analyzeMultiple(
  config: AnalysisServiceConfig,
  symbols: string[],
  timeframe: Timeframe = "1Day"
): Promise<Map<string, AnalysisResult | Error>> {
  const results = new Map<string, AnalysisResult | Error>()

  // Process in parallel with concurrency limit
  const batchSize = 5
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(sym => analyzeSymbol(config, sym, timeframe))
    )

    batch.forEach((sym, idx) => {
      const result = batchResults[idx]
      if (result.status === "fulfilled") {
        results.set(sym, result.value)
      } else {
        results.set(sym, result.reason)
      }
    })
  }

  return results
}

export class InsufficientDataError extends Error {
  constructor(
    public symbol: string,
    public actual: number,
    public required: number
  ) {
    super(`Insufficient data for ${symbol}: ${actual} bars, need ${required}`)
    this.name = "InsufficientDataError"
  }
}
```

---

