# Phase 22: Technical Analysis Configuration Profiles — Part 3: Business Logic

## Overview

Parameterize `computeTechnicals()` and `detectSignals()` to accept a `TechnicalAnalysisConfig` parameter. Update `TechnicalAnalysisAgent` to fetch user config and pass it through the pipeline. Update `AlpacaMarketDataAgent` to accept configurable cache freshness.

---

## Parameterized `computeTechnicals()`

### Current Signature

```ts
export function computeTechnicals(symbol: string, bars: Bar[]): TechnicalIndicators
```

### New Signature

```ts
import type { TechnicalAnalysisConfig } from '../../ta-config/schema';
import { DEFAULT_TA_CONFIG } from '../../ta-config/presets';

export function computeTechnicals(
  symbol: string,
  bars: Bar[],
  config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
): TechnicalIndicators
```

### Implementation

```ts
export function computeTechnicals(
  symbol: string,
  bars: Bar[],
  config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
): TechnicalIndicators {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const volumes = bars.map((b) => b.v);
  const latest = bars[bars.length - 1];
  if (!latest) throw new Error('Empty bars array');

  // Dynamic SMA periods from config
  const sma: SMAResult[] = config.smaPeriods.map((period) => ({
    period,
    value: calculateSMA(closes, period),
  }));

  // Dynamic EMA periods from config
  const ema: EMAResult[] = config.emaPeriods.map((period) => ({
    period,
    value: calculateEMA(closes, period),
  }));

  return {
    symbol,
    timestamp: latest.t,
    price: latest.c,
    sma,
    ema,
    rsi: calculateRSI(closes, config.rsiPeriod),
    macd: calculateMACD(closes, config.emaPeriods, config.macdSignalPeriod),
    bollinger: calculateBollingerBands(closes, config.bollingerPeriod, config.bollingerStdDev),
    atr: calculateATR(highs, lows, closes, config.atrPeriod),
    volumeSma: calculateSMA(volumes, config.volumeSmaPeriod),
    relativeVolume: calculateRelativeVolume(volumes, config.volumeSmaPeriod),
  };
}
```

### `calculateMACD` Signature Change

Currently hardcodes EMA 12/26. Accept periods from config:

```ts
// Current
function calculateMACD(
  closes: number[],
): { macd: number; signal: number; histogram: number } | null

// New
function calculateMACD(
  closes: number[],
  emaPeriods: number[] = [12, 26],
  signalPeriod: number = 9,
): { macd: number; signal: number; histogram: number } | null
```

Implementation uses `emaPeriods[0]` as fast period and `emaPeriods[1]` as slow period (sorted ascending). If `emaPeriods` has fewer than 2 entries, return `null`.

```ts
function calculateMACD(
  closes: number[],
  emaPeriods: number[] = [12, 26],
  signalPeriod: number = 9,
): { macd: number; signal: number; histogram: number } | null {
  const sorted = [...emaPeriods].sort((a, b) => a - b);
  const fastPeriod = sorted[0];
  const slowPeriod = sorted[1];
  if (fastPeriod === undefined || slowPeriod === undefined) return null;

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  if (emaFast === null || emaSlow === null) return null;

  const macdLine: number[] = [];
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  let eFast = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let eSlow = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

  for (let i = slowPeriod; i < closes.length; i++) {
    const c = closes[i] ?? 0;
    eFast = c * kFast + eFast * (1 - kFast);
    eSlow = c * kSlow + eSlow * (1 - kSlow);
    macdLine.push(eFast - eSlow);
  }

  if (macdLine.length < signalPeriod) return null;
  const signalLine = calculateEMA(macdLine, signalPeriod);
  if (signalLine === null) return null;

  const macdValue = macdLine[macdLine.length - 1] ?? 0;
  return { macd: macdValue, signal: signalLine, histogram: macdValue - signalLine };
}
```

---

## Parameterized `detectSignals()`

### Current Signature

```ts
export function detectSignals(ind: TechnicalIndicators): TechnicalSignal[]
```

### New Signature

```ts
import type { TechnicalAnalysisConfig } from '../../ta-config/schema';
import { DEFAULT_TA_CONFIG } from '../../ta-config/presets';

export function detectSignals(
  ind: TechnicalIndicators,
  config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
): TechnicalSignal[]
```

### Implementation Changes

#### RSI Signals

```ts
// Current
if (ind.rsi_14 < 30) { ... }
else if (ind.rsi_14 > 70) { ... }

// New
if (ind.rsi !== null) {
  if (ind.rsi < config.rsiOversold) {
    signals.push({
      type: 'rsi_oversold',
      direction: 'bullish',
      strength: Math.min(1, (config.rsiOversold - ind.rsi) / config.rsiOversold),
      description: `RSI at ${ind.rsi.toFixed(1)} -- oversold (threshold: ${config.rsiOversold})`,
    });
  } else if (ind.rsi > config.rsiOverbought) {
    signals.push({
      type: 'rsi_overbought',
      direction: 'bearish',
      strength: Math.min(1, (ind.rsi - config.rsiOverbought) / (100 - config.rsiOverbought)),
      description: `RSI at ${ind.rsi.toFixed(1)} -- overbought (threshold: ${config.rsiOverbought})`,
    });
  }
}
```

#### Volume Signals

```ts
// Current
if (ind.relative_volume !== null && ind.relative_volume > 2.0) { ... }

// New
if (ind.relativeVolume !== null && ind.relativeVolume > config.volumeSpikeMultiplier) {
  signals.push({
    type: 'high_volume',
    direction: 'neutral',
    strength: Math.min(1, (ind.relativeVolume - 1) / 4),
    description: `Volume ${ind.relativeVolume.toFixed(1)}x above ${config.volumeSmaPeriod}-day average (threshold: ${config.volumeSpikeMultiplier}x)`,
  });
}
```

#### SMA Cross Signals (Golden Cross / Death Cross)

Use the two largest SMA periods from config instead of hardcoded 50/200:

```ts
// Find the two longest SMA values for cross detection
const sortedSma = [...ind.sma]
  .filter((s) => s.value !== null)
  .sort((a, b) => a.period - b.period);

if (sortedSma.length >= 2) {
  const medium = sortedSma[sortedSma.length - 2];
  const long = sortedSma[sortedSma.length - 1];

  if (medium && long && medium.value !== null && long.value !== null) {
    if (medium.value > long.value) {
      signals.push({
        type: 'golden_cross_active',
        direction: 'bullish',
        strength: Math.min(1, ((medium.value - long.value) / long.value) * 10),
        description: `Golden cross active (SMA${medium.period} ${medium.value.toFixed(2)} > SMA${long.period} ${long.value.toFixed(2)})`,
      });
    } else {
      signals.push({
        type: 'death_cross_active',
        direction: 'bearish',
        strength: Math.min(1, ((long.value - medium.value) / long.value) * 10),
        description: `Death cross active (SMA${medium.period} ${medium.value.toFixed(2)} < SMA${long.period} ${long.value.toFixed(2)})`,
      });
    }
  }
}
```

#### MACD and Bollinger

MACD and Bollinger signal detection logic stays the same -- the parameterization happens at the calculation level. The signal detection reads from the already-computed `ind.macd` and `ind.bollinger` values.

---

## TechnicalAnalysisAgent Changes

### Config Fetch

The agent fetches the user's config from Postgres at analysis time:

```ts
// apps/data-service/src/agents/technical-analysis-agent.ts

import { getTaConfig } from '@repo/data-ops/ta-config';
import type { TechnicalAnalysisConfig } from '@repo/data-ops/ta-config';

@callable()
async analyze(
  timeframe: Timeframe = '1Day',
  bars?: Bar[],
  configOverride?: TechnicalAnalysisConfig,
): Promise<AnalysisResult> {
  const { userId, symbol } = this.getIdentity();

  // Fetch user's TA config (or use override if provided)
  const config = configOverride ?? await getTaConfig(userId);

  if (!bars) {
    const marketData = await getAgentByName<Env, AlpacaMarketDataAgent>(
      this.env.AlpacaMarketDataAgent,
      `${userId}:${symbol}`,
    );
    const result = await marketData.fetchBars({
      symbol,
      timeframe,
      limit: config.defaultBarsToFetch,
    });
    bars = result.bars;
  }

  if (bars.length < config.minBarsRequired) {
    throw new Error(
      `Insufficient data for ${symbol}: ${bars.length} bars (need ${config.minBarsRequired})`,
    );
  }

  this.cacheBars(bars);

  const indicators = computeTechnicals(symbol, bars, config);
  const signals = detectSignals(indicators, config);

  // ... rest of method unchanged (store indicators, persist signals, update state)

  return { symbol, timeframe, indicators, signals, bars };
}
```

### Why `configOverride` Parameter?

The orchestrators (DebateOrchestratorAgent, PipelineOrchestratorAgent) already fetch context for the analysis cycle. Passing config as a parameter avoids redundant Postgres queries when the orchestrator has already resolved the config.

---

## AlpacaMarketDataAgent Changes

### Configurable Cache Freshness

Currently uses `const CACHE_FRESHNESS_MS = 60_000`. The agent should accept cache freshness as a parameter:

```ts
// apps/data-service/src/agents/alpaca-market-data-agent.ts

// Remove: const CACHE_FRESHNESS_MS = 60_000;
// Default fallback only if no value provided
const DEFAULT_CACHE_FRESHNESS_MS = 60_000;

async fetchBars(params: MarketDataFetchParams & {
  cacheFreshnessSec?: number;
}): Promise<MarketDataResult> {
  const cacheFreshnessMs = (params.cacheFreshnessSec ?? 60) * 1000;

  // Use cacheFreshnessMs instead of CACHE_FRESHNESS_MS in cache check
  // ... existing logic with parameterized threshold
}
```

The `TechnicalAnalysisAgent` passes `config.cacheFreshnessSec` when calling `fetchBars`:

```ts
const result = await marketData.fetchBars({
  symbol,
  timeframe,
  limit: config.defaultBarsToFetch,
  cacheFreshnessSec: config.cacheFreshnessSec,
});
```

---

## Config Resolution Helper

For cases where agents or server functions need the config with minimal boilerplate:

```ts
// packages/data-ops/src/ta-config/resolve.ts

import { getTaConfig } from './queries';
import { DEFAULT_TA_CONFIG } from './presets';
import type { TechnicalAnalysisConfig } from './schema';

/**
 * Resolve TA config for a user. Returns defaults if user has no config.
 * Merges any partial overrides on top.
 */
export async function resolveTaConfig(
  userId: string,
  overrides?: Partial<TechnicalAnalysisConfig>,
): Promise<TechnicalAnalysisConfig> {
  const base = await getTaConfig(userId);
  if (!overrides) return base;
  return { ...base, ...overrides };
}
```

---

## LLM Prompt Impact

The LLM agents format indicator data into prompts. With dynamic SMA/EMA periods, the prompt formatting must iterate the arrays:

```ts
// In prompt building (llm-analysis-agent.ts or debate-orchestrator-agent.ts)
function formatIndicatorsForPrompt(indicators: TechnicalIndicators): string {
  const lines: string[] = [];

  lines.push(`Price: $${indicators.price.toFixed(2)}`);

  for (const sma of indicators.sma) {
    if (sma.value !== null) {
      lines.push(`SMA(${sma.period}): $${sma.value.toFixed(2)}`);
    }
  }

  for (const ema of indicators.ema) {
    if (ema.value !== null) {
      lines.push(`EMA(${ema.period}): $${ema.value.toFixed(2)}`);
    }
  }

  if (indicators.rsi !== null) {
    lines.push(`RSI: ${indicators.rsi.toFixed(1)}`);
  }

  if (indicators.macd !== null) {
    lines.push(`MACD: ${indicators.macd.macd.toFixed(3)} / Signal: ${indicators.macd.signal.toFixed(3)} / Hist: ${indicators.macd.histogram.toFixed(3)}`);
  }

  if (indicators.bollinger !== null) {
    const bb = indicators.bollinger;
    lines.push(`Bollinger: Upper $${bb.upper.toFixed(2)} / Mid $${bb.middle.toFixed(2)} / Lower $${bb.lower.toFixed(2)} (Width: ${(bb.width * 100).toFixed(1)}%)`);
  }

  if (indicators.atr !== null) {
    lines.push(`ATR: $${indicators.atr.toFixed(2)} (${((indicators.atr / indicators.price) * 100).toFixed(2)}% of price)`);
  }

  if (indicators.relativeVolume !== null) {
    lines.push(`Relative Volume: ${indicators.relativeVolume.toFixed(1)}x`);
  }

  return lines.join('\n');
}
```

This replaces any existing hardcoded prompt formatting that references `ind.sma_20`, `ind.sma_50`, etc.

---

## Barrel Export Update

Update `packages/data-ops/src/providers/technicals/index.ts`:

```ts
export { computeTechnicals } from './calculations';
export { detectSignals } from './signals';
export { getSmaValue } from './helpers';
```

Where `helpers.ts` contains the `getSmaValue` convenience function from Part 2.
