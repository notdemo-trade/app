# Phase 6: Llm Analysis — Part 3: Business Logic
> Split from `006-phase-6-llm-analysis.md`. See other parts in this directory.

## LLM Provider Factory

```ts
// packages/data-ops/src/providers/llm/factory.ts

import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"
import { generateText } from "ai"
import type { CompletionParams, CompletionResult, LLMProvider, LLMProviderName } from "./types"

export const SUPPORTED_PROVIDERS: Record<LLMProviderName, { envKey: string; name: string }> = {
  openai: { envKey: "OPENAI_API_KEY", name: "OpenAI" },
  anthropic: { envKey: "ANTHROPIC_API_KEY", name: "Anthropic" },
  google: { envKey: "GOOGLE_GENERATIVE_AI_API_KEY", name: "Google" },
  xai: { envKey: "XAI_API_KEY", name: "xAI (Grok)" },
  deepseek: { envKey: "DEEPSEEK_API_KEY", name: "DeepSeek" },
}

export const DEFAULT_MODELS: Record<LLMProviderName, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-0",
  google: "gemini-2.5-flash",
  xai: "grok-3",
  deepseek: "deepseek-chat",
}

export interface LLMFactoryConfig {
  provider: LLMProviderName
  apiKey: string
  model?: string
  baseUrl?: string
}

export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  const model = config.model ?? DEFAULT_MODELS[config.provider]

  const providerFactories = {
    openai: () => {
      const opts: { apiKey: string; baseURL?: string } = { apiKey: config.apiKey }
      if (config.baseUrl) opts.baseURL = config.baseUrl
      return createOpenAI(opts)
    },
    anthropic: () => createAnthropic({ apiKey: config.apiKey }),
    google: () => createGoogleGenerativeAI({ apiKey: config.apiKey }),
    xai: () => createXai({ apiKey: config.apiKey }),
    deepseek: () => createDeepSeek({ apiKey: config.apiKey }),
  }

  const factory = providerFactories[config.provider]
  if (!factory) {
    throw new Error(`Unsupported provider: ${config.provider}`)
  }

  const sdkProvider = factory()

  return {
    async complete(params: CompletionParams): Promise<CompletionResult> {
      const result = await generateText({
        model: sdkProvider(model),
        messages: params.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.max_tokens ?? 1024,
      })

      return {
        content: result.text,
        usage: {
          prompt_tokens: result.usage?.inputTokens ?? 0,
          completion_tokens: result.usage?.outputTokens ?? 0,
          total_tokens: result.usage?.totalTokens ?? 0,
        },
      }
    },
  }
}

export function createLLMProviderForUser(
  credentials: {
    provider: LLMProviderName
    apiKey: string
    model?: string
  }
): LLMProvider {
  return createLLMProvider({
    provider: credentials.provider,
    apiKey: credentials.apiKey,
    model: credentials.model,
  })
}
```

---


## Analysis Prompts

```ts
// packages/data-ops/src/providers/llm/prompts.ts

export const EVENT_CLASSIFICATION_PROMPT = `You are a financial event classifier. Analyze the following content and extract structured information.

Respond ONLY with valid JSON:
{
  "event_type": "earnings_beat|earnings_miss|merger|acquisition|lawsuit|sec_filing|insider_buy|insider_sell|analyst_upgrade|analyst_downgrade|product_launch|macro|rumor|social_momentum",
  "symbols": ["ARRAY", "OF", "TICKERS"],
  "summary": "Brief 1-2 sentence summary",
  "confidence": 0.0 to 1.0
}

Rules:
- Only include directly mentioned ticker symbols
- Use uppercase for all symbols
- Set confidence based on information clarity
- If multiple event types, choose most significant
- Default to "rumor" with low confidence if unclear

Content:
`

export const RESEARCH_REPORT_PROMPT = `You are a senior equity research analyst. Write a concise research report.

Structure:
1. **Overview** - Company and sector
2. **Recent Developments** - Key news
3. **Technical Levels** - Support/resistance
4. **Catalysts** - Upcoming events
5. **Risks** - Key risks
6. **Summary** - 2-3 sentence conclusion

Be factual. Acknowledge limited data.
`

export const TRADE_RECOMMENDATION_PROMPT = `You are a trading analyst. Based on the provided data, generate a trade recommendation.

Respond ONLY with valid JSON:
{
  "action": "buy" | "sell" | "hold",
  "confidence": 0.0 to 1.0,
  "rationale": "2-3 sentence explanation",
  "entry_price": number or null,
  "target_price": number or null,
  "stop_loss": number or null,
  "position_size_pct": 1-10 (percentage of portfolio),
  "timeframe": "intraday" | "swing" | "position",
  "risks": ["risk1", "risk2"]
}

Rules:
- Conservative position sizing (max 5% for high conviction)
- Always include stop_loss for buy/sell recommendations
- Consider risk/reward ratio (min 2:1 preferred)
- Factor in current portfolio exposure
- Account for market conditions

Data:
`

export const SIGNAL_SUMMARY_PROMPT = `You are analyzing market signals. Summarize the key insights.

Consider:
- Technical indicator signals (RSI, MACD, etc.)
- Social sentiment signals
- News events
- Price action

Provide a brief summary of the overall signal picture and bias (bullish/bearish/neutral).
`
```

---


## Analysis Service

```ts
// packages/data-ops/src/services/llm-analysis-service.ts

import { estimateCost } from "../providers/llm/pricing"
import {
  EVENT_CLASSIFICATION_PROMPT,
  RESEARCH_REPORT_PROMPT,
  TRADE_RECOMMENDATION_PROMPT,
} from "../providers/llm/prompts"
import type {
  AnalysisResult,
  CompletionResult,
  LLMProvider,
  LLMProviderName,
  TradeRecommendation,
} from "../providers/llm/types"
import type { AnalysisResult as TAResult } from "../providers/technicals/types"

export interface AnalysisContext {
  symbol: string
  technicals?: TAResult
  signals?: Array<{ type: string; direction: string; strength: number; description: string }>
  news?: Array<{ headline: string; date: string }>
  price?: { current: number; change_pct: number }
  position?: { qty: number; avg_entry_price: number; unrealized_pl: number }
}

export async function generateTradeRecommendation(
  llm: LLMProvider,
  context: AnalysisContext
): Promise<{ recommendation: TradeRecommendation; usage: CompletionResult["usage"] }> {
  const contextStr = JSON.stringify(context, null, 2)

  const result = await llm.complete({
    messages: [
      { role: "system", content: "You are a precise trading analyst. Always respond with valid JSON." },
      { role: "user", content: TRADE_RECOMMENDATION_PROMPT + contextStr },
    ],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: "json_object" },
  })

  try {
    const parsed = JSON.parse(result.content) as TradeRecommendation

    // Validate and normalize
    const recommendation: TradeRecommendation = {
      action: ["buy", "sell", "hold"].includes(parsed.action) ? parsed.action : "hold",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      rationale: String(parsed.rationale || "Insufficient data for strong recommendation"),
      entry_price: parsed.entry_price ?? undefined,
      target_price: parsed.target_price ?? undefined,
      stop_loss: parsed.stop_loss ?? undefined,
      position_size_pct: Math.max(1, Math.min(10, Number(parsed.position_size_pct) || 2)),
      timeframe: ["intraday", "swing", "position"].includes(parsed.timeframe ?? "")
        ? parsed.timeframe
        : "swing",
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    }

    return { recommendation, usage: result.usage }
  } catch {
    return {
      recommendation: {
        action: "hold",
        confidence: 0.1,
        rationale: "Failed to parse recommendation",
        risks: ["Analysis error"],
      },
      usage: result.usage,
    }
  }
}

export async function generateResearchReport(
  llm: LLMProvider,
  symbol: string,
  context: AnalysisContext
): Promise<{ report: string; usage: CompletionResult["usage"] }> {
  const contextStr = JSON.stringify(context, null, 2)

  const result = await llm.complete({
    messages: [
      { role: "system", content: RESEARCH_REPORT_PROMPT },
      { role: "user", content: `Generate research report for ${symbol}.\n\nContext:\n${contextStr}` },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  })

  const report = `# Research Report: ${symbol}\n\n_Generated: ${new Date().toISOString()}_\n\n${result.content}`

  return { report, usage: result.usage }
}

export async function classifyEvent(
  llm: LLMProvider,
  rawContent: string
): Promise<{
  event_type: string
  symbols: string[]
  summary: string
  confidence: number
  usage: CompletionResult["usage"]
}> {
  const result = await llm.complete({
    messages: [
      { role: "system", content: "You are a precise financial event classifier." },
      { role: "user", content: EVENT_CLASSIFICATION_PROMPT + rawContent.slice(0, 4000) },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" },
  })

  try {
    const parsed = JSON.parse(result.content)
    return {
      event_type: String(parsed.event_type || "rumor"),
      symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map(String) : [],
      summary: String(parsed.summary || rawContent.slice(0, 200)),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      usage: result.usage,
    }
  } catch {
    return {
      event_type: "rumor",
      symbols: [],
      summary: rawContent.slice(0, 200),
      confidence: 0.1,
      usage: result.usage,
    }
  }
}

export async function runFullAnalysis(
  llm: LLMProvider,
  context: AnalysisContext,
  options: {
    includeResearch?: boolean
    model: string
    provider: LLMProviderName
    userId: string
  }
): Promise<AnalysisResult> {
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  // Get recommendation
  const { recommendation, usage: recUsage } = await generateTradeRecommendation(llm, context)
  totalUsage.prompt_tokens += recUsage.prompt_tokens
  totalUsage.completion_tokens += recUsage.completion_tokens
  totalUsage.total_tokens += recUsage.total_tokens

  // Optional research report
  let research: string | undefined
  if (options.includeResearch) {
    const { report, usage: resUsage } = await generateResearchReport(llm, context.symbol, context)
    research = report
    totalUsage.prompt_tokens += resUsage.prompt_tokens
    totalUsage.completion_tokens += resUsage.completion_tokens
    totalUsage.total_tokens += resUsage.total_tokens
  }

  const estimatedCost = estimateCost(options.model, totalUsage.prompt_tokens, totalUsage.completion_tokens)

  return {
    id: crypto.randomUUID(),
    userId: options.userId,
    symbol: context.symbol,
    timestamp: new Date().toISOString(),
    recommendation,
    research,
    technicals: context.technicals?.indicators as Record<string, unknown> | undefined,
    signals: context.signals,
    usage: { ...totalUsage, estimated_cost_usd: estimatedCost },
    model: options.model,
    provider: options.provider,
  }
}
```

---


## Database Queries

```ts
// packages/data-ops/src/db/queries/llm-analysis.ts

import { and, desc, eq, gte, sql } from "drizzle-orm"
import type { DbClient } from "../client"
import { llmAnalyses, llmUsage, type NewLLMAnalysis } from "../schema/llm-analysis"

export async function insertAnalysis(db: DbClient, analysis: NewLLMAnalysis): Promise<string> {
  const [result] = await db.insert(llmAnalyses).values(analysis).returning({ id: llmAnalyses.id })
  return result.id
}

export async function getAnalyses(
  db: DbClient,
  userId: string,
  options?: { symbol?: string; limit?: number }
): Promise<typeof llmAnalyses.$inferSelect[]> {
  const conditions = [eq(llmAnalyses.userId, userId)]
  if (options?.symbol) {
    conditions.push(eq(llmAnalyses.symbol, options.symbol.toUpperCase()))
  }

  return db
    .select()
    .from(llmAnalyses)
    .where(and(...conditions))
    .orderBy(desc(llmAnalyses.createdAt))
    .limit(options?.limit ?? 50)
}

export async function getAnalysisById(
  db: DbClient,
  userId: string,
  analysisId: string
): Promise<typeof llmAnalyses.$inferSelect | undefined> {
  const [result] = await db
    .select()
    .from(llmAnalyses)
    .where(and(eq(llmAnalyses.id, analysisId), eq(llmAnalyses.userId, userId)))
    .limit(1)
  return result
}

export async function updateUsage(
  db: DbClient,
  userId: string,
  provider: string,
  model: string,
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
): Promise<void> {
  const date = new Date().toISOString().split("T")[0]

  await db
    .insert(llmUsage)
    .values({
      userId,
      date,
      provider,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: [llmUsage.userId, llmUsage.date, llmUsage.provider],
      set: {
        promptTokens: sql`${llmUsage.promptTokens} + ${usage.promptTokens}`,
        completionTokens: sql`${llmUsage.completionTokens} + ${usage.completionTokens}`,
        totalTokens: sql`${llmUsage.totalTokens} + ${usage.totalTokens}`,
        estimatedCostUsd: sql`${llmUsage.estimatedCostUsd} + ${usage.estimatedCostUsd}`,
        requestCount: sql`${llmUsage.requestCount} + 1`,
      },
    })
}

export async function getUsageSummary(
  db: DbClient,
  userId: string,
  days: number = 30
): Promise<{
  totalTokens: number
  totalCostUsd: number
  byProvider: Record<string, { tokens: number; cost: number }>
  byDay: Array<{ date: string; tokens: number; cost: number }>
}> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split("T")[0]

  const rows = await db
    .select()
    .from(llmUsage)
    .where(and(eq(llmUsage.userId, userId), gte(llmUsage.date, startDateStr)))
    .orderBy(desc(llmUsage.date))

  let totalTokens = 0
  let totalCostUsd = 0
  const byProvider: Record<string, { tokens: number; cost: number }> = {}
  const byDayMap: Record<string, { tokens: number; cost: number }> = {}

  for (const row of rows) {
    totalTokens += row.totalTokens
    totalCostUsd += row.estimatedCostUsd

    if (!byProvider[row.provider]) {
      byProvider[row.provider] = { tokens: 0, cost: 0 }
    }
    byProvider[row.provider].tokens += row.totalTokens
    byProvider[row.provider].cost += row.estimatedCostUsd

    if (!byDayMap[row.date]) {
      byDayMap[row.date] = { tokens: 0, cost: 0 }
    }
    byDayMap[row.date].tokens += row.totalTokens
    byDayMap[row.date].cost += row.estimatedCostUsd
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { totalTokens, totalCostUsd, byProvider, byDay }
}
```

---

