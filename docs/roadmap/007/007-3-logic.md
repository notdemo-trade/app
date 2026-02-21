# Phase 7: Strategy Templates — Part 3: Business Logic
> Split from `007-phase-7-strategy-templates.md`. See other parts in this directory.

## Database Queries

```ts
// packages/data-ops/src/queries/strategies.ts

import { and, desc, eq, sql, ne } from "drizzle-orm"
import type { DbClient } from "../drizzle/client"
import {
  strategyTemplates,
  strategyVersions,
  strategyStars,
  type NewStrategyTemplate,
} from "../drizzle/schema/strategies"
import type { StrategyParameters, CreateStrategyInput, UpdateStrategyInput } from "../zod-schema/strategies"

const MAX_VERSIONS = 10

export async function createStrategy(
  db: DbClient,
  userId: string,
  input: CreateStrategyInput
): Promise<string> {
  const [result] = await db
    .insert(strategyTemplates)
    .values({
      userId,
      name: input.name,
      description: input.description,
      systemPrompt: input.systemPrompt,
      parameters: input.parameters,
      requiredVariables: input.requiredVariables,
      isPublic: input.isPublic,
    })
    .returning({ id: strategyTemplates.id })

  return result.id
}

export async function updateStrategy(
  db: DbClient,
  userId: string,
  strategyId: string,
  input: UpdateStrategyInput
): Promise<{ success: boolean; newVersion?: number }> {
  const existing = await db
    .select()
    .from(strategyTemplates)
    .where(and(eq(strategyTemplates.id, strategyId), eq(strategyTemplates.userId, userId)))
    .limit(1)

  if (existing.length === 0) {
    return { success: false }
  }

  const strategy = existing[0]
  const newVersion = strategy.version + 1

  // Save current version to history
  await db.insert(strategyVersions).values({
    strategyId,
    version: strategy.version,
    systemPrompt: strategy.systemPrompt,
    parameters: strategy.parameters,
    createdBy: userId,
  })

  // Cleanup old versions (keep last MAX_VERSIONS)
  const oldVersions = await db
    .select({ id: strategyVersions.id })
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategyId))
    .orderBy(desc(strategyVersions.version))
    .offset(MAX_VERSIONS)

  if (oldVersions.length > 0) {
    for (const v of oldVersions) {
      await db.delete(strategyVersions).where(eq(strategyVersions.id, v.id))
    }
  }

  // Update strategy
  const updateData: Partial<typeof strategyTemplates.$inferInsert> = {
    version: newVersion,
    updatedAt: new Date(),
  }

  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.systemPrompt !== undefined) updateData.systemPrompt = input.systemPrompt
  if (input.parameters !== undefined) {
    updateData.parameters = { ...strategy.parameters, ...input.parameters } as StrategyParameters
  }
  if (input.requiredVariables !== undefined) updateData.requiredVariables = input.requiredVariables
  if (input.isPublic !== undefined) updateData.isPublic = input.isPublic

  await db.update(strategyTemplates).set(updateData).where(eq(strategyTemplates.id, strategyId))

  return { success: true, newVersion }
}

export async function getStrategy(
  db: DbClient,
  strategyId: string,
  userId?: string
): Promise<typeof strategyTemplates.$inferSelect | null> {
  const conditions = [eq(strategyTemplates.id, strategyId)]

  // If userId provided, allow owner or public strategies
  if (userId) {
    conditions.push(
      sql`(${strategyTemplates.userId} = ${userId} OR ${strategyTemplates.isPublic} = true)`
    )
  } else {
    conditions.push(eq(strategyTemplates.isPublic, true))
  }

  const [result] = await db
    .select()
    .from(strategyTemplates)
    .where(and(...conditions))
    .limit(1)

  return result ?? null
}

export async function getUserStrategies(
  db: DbClient,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<typeof strategyTemplates.$inferSelect[]> {
  return db
    .select()
    .from(strategyTemplates)
    .where(eq(strategyTemplates.userId, userId))
    .orderBy(desc(strategyTemplates.updatedAt))
    .limit(options?.limit ?? 20)
    .offset(options?.offset ?? 0)
}

export async function getPublicStrategies(
  db: DbClient,
  options?: { limit?: number; offset?: number; sortBy?: "stars" | "forks" | "recent" }
): Promise<typeof strategyTemplates.$inferSelect[]> {
  const orderBy =
    options?.sortBy === "stars"
      ? desc(strategyTemplates.starCount)
      : options?.sortBy === "forks"
        ? desc(strategyTemplates.forkCount)
        : desc(strategyTemplates.updatedAt)

  return db
    .select()
    .from(strategyTemplates)
    .where(eq(strategyTemplates.isPublic, true))
    .orderBy(orderBy)
    .limit(options?.limit ?? 20)
    .offset(options?.offset ?? 0)
}

export async function deleteStrategy(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<boolean> {
  const result = await db
    .delete(strategyTemplates)
    .where(and(eq(strategyTemplates.id, strategyId), eq(strategyTemplates.userId, userId)))
    .returning({ id: strategyTemplates.id })

  return result.length > 0
}

export async function forkStrategy(
  db: DbClient,
  userId: string,
  sourceStrategyId: string
): Promise<{ success: boolean; newId?: string; error?: string }> {
  const source = await getStrategy(db, sourceStrategyId, userId)
  if (!source) {
    return { success: false, error: "Strategy not found or not accessible" }
  }

  const [result] = await db
    .insert(strategyTemplates)
    .values({
      userId,
      name: `${source.name} (Fork)`,
      description: source.description,
      systemPrompt: source.systemPrompt,
      parameters: source.parameters,
      requiredVariables: source.requiredVariables,
      forkedFrom: sourceStrategyId,
      isPublic: false,
    })
    .returning({ id: strategyTemplates.id })

  // Increment fork count on source
  await db
    .update(strategyTemplates)
    .set({ forkCount: sql`${strategyTemplates.forkCount} + 1` })
    .where(eq(strategyTemplates.id, sourceStrategyId))

  return { success: true, newId: result.id }
}

export async function starStrategy(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<boolean> {
  const strategy = await getStrategy(db, strategyId, userId)
  if (!strategy || !strategy.isPublic) {
    return false
  }

  try {
    await db.insert(strategyStars).values({ userId, strategyId })
    await db
      .update(strategyTemplates)
      .set({ starCount: sql`${strategyTemplates.starCount} + 1` })
      .where(eq(strategyTemplates.id, strategyId))
    return true
  } catch {
    // Already starred
    return false
  }
}

export async function unstarStrategy(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<boolean> {
  const result = await db
    .delete(strategyStars)
    .where(and(eq(strategyStars.userId, userId), eq(strategyStars.strategyId, strategyId)))
    .returning()

  if (result.length > 0) {
    await db
      .update(strategyTemplates)
      .set({ starCount: sql`${strategyTemplates.starCount} - 1` })
      .where(eq(strategyTemplates.id, strategyId))
    return true
  }

  return false
}

export async function isStrategyStarred(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<boolean> {
  const [result] = await db
    .select()
    .from(strategyStars)
    .where(and(eq(strategyStars.userId, userId), eq(strategyStars.strategyId, strategyId)))
    .limit(1)

  return !!result
}

export async function setActiveStrategy(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<boolean> {
  // Verify ownership
  const strategy = await db
    .select()
    .from(strategyTemplates)
    .where(and(eq(strategyTemplates.id, strategyId), eq(strategyTemplates.userId, userId)))
    .limit(1)

  if (strategy.length === 0) {
    return false
  }

  // Deactivate all user strategies
  await db
    .update(strategyTemplates)
    .set({ isActive: false })
    .where(eq(strategyTemplates.userId, userId))

  // Activate selected
  await db
    .update(strategyTemplates)
    .set({ isActive: true })
    .where(eq(strategyTemplates.id, strategyId))

  return true
}

export async function getActiveStrategy(
  db: DbClient,
  userId: string
): Promise<typeof strategyTemplates.$inferSelect | null> {
  const [result] = await db
    .select()
    .from(strategyTemplates)
    .where(and(eq(strategyTemplates.userId, userId), eq(strategyTemplates.isActive, true)))
    .limit(1)

  return result ?? null
}

export async function getStrategyVersions(
  db: DbClient,
  userId: string,
  strategyId: string
): Promise<typeof strategyVersions.$inferSelect[]> {
  // Verify ownership
  const strategy = await db
    .select()
    .from(strategyTemplates)
    .where(and(eq(strategyTemplates.id, strategyId), eq(strategyTemplates.userId, userId)))
    .limit(1)

  if (strategy.length === 0) {
    return []
  }

  return db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategyId))
    .orderBy(desc(strategyVersions.version))
}

export async function rollbackToVersion(
  db: DbClient,
  userId: string,
  strategyId: string,
  targetVersion: number
): Promise<boolean> {
  const [versionData] = await db
    .select()
    .from(strategyVersions)
    .where(
      and(eq(strategyVersions.strategyId, strategyId), eq(strategyVersions.version, targetVersion))
    )
    .limit(1)

  if (!versionData) {
    return false
  }

  // Update creates new version, so use updateStrategy
  const result = await updateStrategy(db, userId, strategyId, {
    systemPrompt: versionData.systemPrompt,
    parameters: versionData.parameters,
  })

  return result.success
}
```

---


## Strategy Execution Service

```ts
// packages/data-ops/src/services/strategy-execution-service.ts

import { TradeRecommendationSchema } from "../zod-schema/llm-analysis"
import type { LLMProvider, CompletionResult, TradeRecommendation } from "../providers/llm/types"
import type { AnalysisContext } from "./llm-analysis-service"
import type { StrategyTemplate } from "../drizzle/schema/strategies"
import type { StrategyParameters, CustomVariable } from "../zod-schema/strategies"

const STANDARD_VARIABLES = [
  "technicals",
  "signals",
  "portfolio",
  "news",
  "position_state",
  "price",
  "symbol",
]

interface ExecutionContext extends AnalysisContext {
  portfolio?: {
    cash: number
    equity: number
    positions: Array<{ symbol: string; qty: number; market_value: number }>
  }
  news?: Array<{ headline: string; date: string; sentiment?: string }>
  position_state?: {
    hasPosition: boolean
    qty?: number
    avgEntry?: number
    unrealizedPl?: number
  }
}

export interface StrategyExecutionResult {
  recommendation: TradeRecommendation
  usage: CompletionResult["usage"]
  validationErrors?: string[]
  fallbackUsed: boolean
}

export async function executeStrategyPrompt(
  llm: LLMProvider,
  strategy: StrategyTemplate,
  context: ExecutionContext
): Promise<StrategyExecutionResult> {
  // 1. Validate custom variables exist
  const variableErrors = validateCustomVariables(
    strategy.parameters.customVariables,
    context
  )

  if (variableErrors.length > 0) {
    console.warn(`Custom variable validation warnings: ${variableErrors.join(", ")}`)
  }

  // 2. Build enriched prompt
  const enrichedPrompt = injectVariables(strategy.systemPrompt, context, strategy.parameters)

  // 3. Call LLM
  const result = await llm.complete({
    messages: [
      { role: "system", content: enrichedPrompt },
      {
        role: "user",
        content: buildAnalysisRequest(context, strategy.parameters.riskTolerance),
      },
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  })

  // 4. Validate JSON response
  try {
    const parsed = JSON.parse(result.content)
    const validated = TradeRecommendationSchema.safeParse(parsed)

    if (!validated.success) {
      // Log validation errors but try to salvage
      const errors = validated.error.flatten().fieldErrors
      const errorMsgs = Object.entries(errors).map(([k, v]) => `${k}: ${v?.join(", ")}`)

      // Attempt to fix common issues
      const recommendation = normalizeRecommendation(parsed)

      return {
        recommendation,
        usage: result.usage,
        validationErrors: errorMsgs,
        fallbackUsed: false,
      }
    }

    return {
      recommendation: validated.data,
      usage: result.usage,
      fallbackUsed: false,
    }
  } catch (parseError) {
    // JSON parse failed - use fallback
    console.error(`Strategy prompt JSON parse failed: ${parseError}`)

    return {
      recommendation: {
        action: "hold",
        confidence: 0.1,
        rationale: "Strategy prompt returned invalid JSON. Manual review recommended.",
        risks: ["Analysis error - invalid response format"],
      },
      usage: result.usage,
      validationErrors: ["Invalid JSON response from LLM"],
      fallbackUsed: true,
    }
  }
}

function injectVariables(
  prompt: string,
  context: ExecutionContext,
  params: StrategyParameters
): string {
  let result = prompt

  // Standard variables
  const standardVars: Record<string, string> = {
    symbol: context.symbol,
    price: context.price ? JSON.stringify(context.price) : "N/A",
    technicals: context.technicals ? JSON.stringify(context.technicals) : "N/A",
    signals: context.signals ? JSON.stringify(context.signals) : "[]",
    portfolio: context.portfolio ? JSON.stringify(context.portfolio) : "N/A",
    news: context.news ? JSON.stringify(context.news) : "[]",
    position_state: context.position_state ? JSON.stringify(context.position_state) : "{}",
    risk_tolerance: params.riskTolerance,
    timeframe: params.timeframe,
    preferred_assets: params.preferredAssets.join(", "),
  }

  for (const [key, value] of Object.entries(standardVars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value)
  }

  // Custom variables with defaults
  for (const cv of params.customVariables) {
    const placeholder = `{${cv.name}}`
    if (result.includes(placeholder)) {
      result = result.replace(new RegExp(`\\{${cv.name}\\}`, "gi"), String(cv.defaultValue))
    }
  }

  return result
}

function validateCustomVariables(
  customVars: CustomVariable[],
  context: ExecutionContext
): string[] {
  const errors: string[] = []

  for (const cv of customVars) {
    if (cv.defaultValue === undefined || cv.defaultValue === null) {
      errors.push(`Custom variable '${cv.name}' has no default value`)
    }
  }

  return errors
}

function buildAnalysisRequest(context: ExecutionContext, riskTolerance: string): string {
  const positionInfo = context.position_state?.hasPosition
    ? `Current position: ${context.position_state.qty} shares at $${context.position_state.avgEntry?.toFixed(2)} avg, P&L: $${context.position_state.unrealizedPl?.toFixed(2)}`
    : "No current position"

  return `
Analyze ${context.symbol} and provide a trade recommendation.

Current price: $${context.price?.current?.toFixed(2) ?? "N/A"}
Risk tolerance: ${riskTolerance}
${positionInfo}

Respond with valid JSON matching this schema:
{
  "action": "buy" | "sell" | "hold",
  "confidence": 0.0-1.0,
  "rationale": "2-3 sentence explanation",
  "entry_price": number | null,
  "target_price": number | null,
  "stop_loss": number | null,
  "position_size_pct": 1-10,
  "timeframe": "intraday" | "swing" | "position",
  "risks": ["risk1", "risk2"]
}
`.trim()
}

function normalizeRecommendation(raw: Record<string, unknown>): TradeRecommendation {
  return {
    action: ["buy", "sell", "hold"].includes(String(raw.action))
      ? (raw.action as "buy" | "sell" | "hold")
      : "hold",
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    rationale: String(raw.rationale || "No rationale provided"),
    entry_price: typeof raw.entry_price === "number" ? raw.entry_price : undefined,
    target_price: typeof raw.target_price === "number" ? raw.target_price : undefined,
    stop_loss: typeof raw.stop_loss === "number" ? raw.stop_loss : undefined,
    position_size_pct: Math.max(1, Math.min(10, Number(raw.position_size_pct) || 2)),
    timeframe: ["intraday", "swing", "position"].includes(String(raw.timeframe))
      ? (raw.timeframe as "intraday" | "swing" | "position")
      : "swing",
    risks: Array.isArray(raw.risks) ? raw.risks.map(String) : [],
  }
}

export function extractVariablesFromPrompt(prompt: string): string[] {
  const regex = /\{([a-z_][a-z0-9_]*)\}/gi
  const matches = prompt.matchAll(regex)
  const variables = new Set<string>()

  for (const match of matches) {
    variables.add(match[1].toLowerCase())
  }

  return Array.from(variables)
}

export function validatePromptVariables(prompt: string): {
  standard: string[]
  custom: string[]
  unknown: string[]
} {
  const found = extractVariablesFromPrompt(prompt)
  const standard: string[] = []
  const custom: string[] = []
  const unknown: string[] = []

  for (const v of found) {
    if (STANDARD_VARIABLES.includes(v)) {
      standard.push(v)
    } else if (v.startsWith("my_") || v.startsWith("custom_")) {
      custom.push(v)
    } else {
      unknown.push(v)
    }
  }

  return { standard, custom, unknown }
}
```

---


## Default Templates

```ts
// packages/data-ops/src/strategies/default-templates.ts

import type { StrategyParameters, CreateStrategyInput } from "../zod-schema/strategies"

export const CONSERVATIVE_MEAN_REVERSION: CreateStrategyInput = {
  name: "Conservative Mean Reversion",
  description: "Risk-averse approach focusing on oversold conditions with strong fundamentals. Small position sizes, wide stops, targets established support/resistance levels.",
  systemPrompt: `# Conservative Mean Reversion Strategy

You are a risk-averse trading analyst specializing in mean reversion setups. Your goal is capital preservation with opportunistic entries on oversold conditions.


## Analysis Framework

1. **Technical Confirmation Required**
   - RSI below 30 (oversold) or above 70 (overbought)
   - Price near Bollinger Band extremes (lower band for buys, upper for sells)
   - Volume confirmation (elevated volume on reversal signals)

2. **Risk Management**
   - Maximum position size: 3-5% of portfolio
   - Stop loss: 5-8% from entry
   - Target: 5-10% profit (minimum 2:1 reward/risk)
   - Scale into positions (50% initial, 50% on confirmation)

3. **Entry Conditions for BUY**
   - RSI < 30
   - Price within 2% of lower Bollinger Band
   - No major negative news
   - Relative volume > 1.2x average

4. **Entry Conditions for SELL (existing position)**
   - RSI > 65 OR target reached
   - Price approaching resistance/upper Bollinger Band
   - Momentum fading (MACD turning negative)

5. **HOLD if**
   - RSI between 35-65
   - No clear technical signal
   - Major economic event pending


## Current Context
Symbol: {symbol}
Price: {price}
Technicals: {technicals}
Signals: {signals}
Position: {position_state}


## Response Format
Provide conservative, well-reasoned recommendations. Default to HOLD if uncertain. Always include stop loss for any buy/sell recommendation.`,
  parameters: {
    riskTolerance: "conservative",
    timeframe: "swing",
    preferredAssets: ["stocks"],
    customVariables: [],
  },
  requiredVariables: ["technicals", "signals", "price", "position_state"],
  isPublic: true,
}

export const AGGRESSIVE_MOMENTUM: CreateStrategyInput = {
  name: "Aggressive Momentum",
  description: "High-conviction momentum plays targeting breakouts and strong trends. Larger position sizes, tighter stops, trailing stop strategy for runners.",
  systemPrompt: `# Aggressive Momentum Strategy

You are an aggressive momentum trader hunting breakouts and strong trends. Capitalize on price continuation with conviction sizing.


## Analysis Framework

1. **Momentum Indicators**
   - MACD histogram expanding (increasing momentum)
   - RSI 50-70 zone (strong but not exhausted)
   - Price above SMA 20 and SMA 50
   - Volume surge (>1.5x average)

2. **Breakout Criteria**
   - New 52-week high or breaking key resistance
   - Relative strength vs sector/market
   - Clean chart pattern (flag, cup-handle, ascending triangle)

3. **Position Sizing**
   - Base size: 5-8% of portfolio
   - Add on confirmation: up to 10% total
   - Pyramid into winners only

4. **Risk Management**
   - Initial stop: 3-5% below entry (tight)
   - Trailing stop: 2x ATR below recent swing low
   - Take partial profits at 10%, let remainder run

5. **BUY Signals**
   - Breakout above resistance with volume
   - MACD bullish cross with expanding histogram
   - RSI above 50 and rising
   - Price momentum positive

6. **SELL Signals**
   - Trailing stop hit
   - Momentum divergence (price higher, MACD lower)
   - RSI > 80 with exhaustion candle
   - Volume declining on rallies


## Current Context
Symbol: {symbol}
Price: {price}
Technicals: {technicals}
Signals: {signals}
Portfolio: {portfolio}


## Response Format
Be decisive. Momentum requires conviction. If setup is strong, recommend action with appropriate size. Include trailing stop strategy for winners.`,
  parameters: {
    riskTolerance: "aggressive",
    timeframe: "swing",
    preferredAssets: ["stocks"],
    customVariables: [],
  },
  requiredVariables: ["technicals", "signals", "price", "portfolio"],
  isPublic: true,
}

export const CRYPTO_VOLATILITY_SCALPING: CreateStrategyInput = {
  name: "Crypto Volatility Scalping",
  description: "24/7 cryptocurrency trading exploiting volatility. Quick entries/exits, tight stops, high trade frequency. Designed for liquid large-cap crypto.",
  systemPrompt: `# Crypto Volatility Scalping Strategy

You are a crypto volatility trader operating 24/7. Exploit short-term price swings with rapid entries and exits.


## Market Characteristics
- 24/7 trading, no overnight gaps
- High volatility (typical 3-10% daily range)
- Momentum-driven, sentiment-sensitive
- Liquidity varies by time (best during US/Asia overlap)


## Scalping Framework

1. **Volatility Assessment**
   - ATR > 3% of price (minimum volatility threshold)
   - Bollinger Band width expanding
   - Volume elevated vs 24h average

2. **Entry Signals - LONG**
   - Quick RSI bounce from <25
   - Price touches lower Bollinger and reverses
   - MACD histogram turning positive
   - Bullish engulfing on 5-15min

3. **Entry Signals - SHORT**
   - RSI rejection from >75
   - Price touches upper Bollinger and reverses
   - MACD histogram turning negative
   - Bearish engulfing on 5-15min

4. **Risk Parameters**
   - Position size: 2-3% of portfolio per trade
   - Stop loss: 1-2% (tight!)
   - Target: 2-4% (minimum 2:1 R/R)
   - Max trades per day: 5

5. **Exit Rules**
   - Hit target or stop, no exceptions
   - Exit before major announcements (Fed, CPI)
   - Reduce size during low liquidity hours

6. **AVOID Trading When**
   - Bollinger Bands contracting (consolidation)
   - Major news pending in <1 hour
   - Sunday evening (lowest liquidity)
   - Already max trades for the day


## Current Context
Symbol: {symbol}
Price: {price}
Technicals: {technicals}
Signals: {signals}
News: {news}


## Response Format
Quick decision required. Crypto moves fast. Be precise with entry/stop/target levels. Default to HOLD if setup isn't textbook.`,
  parameters: {
    riskTolerance: "aggressive",
    timeframe: "intraday",
    preferredAssets: ["crypto"],
    customVariables: [],
  },
  requiredVariables: ["technicals", "signals", "price", "news"],
  isPublic: true,
}

export const DEFAULT_TEMPLATES = [
  CONSERVATIVE_MEAN_REVERSION,
  AGGRESSIVE_MOMENTUM,
  CRYPTO_VOLATILITY_SCALPING,
]

export async function seedDefaultTemplates(
  db: DbClient,
  systemUserId: string
): Promise<void> {
  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(strategyTemplates).values({
      userId: systemUserId,
      ...template,
      isPublic: true,
    }).onConflictDoNothing()
  }
}
```

---

