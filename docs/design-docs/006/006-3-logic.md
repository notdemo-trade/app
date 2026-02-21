# Phase 6: LLM Analysis Agent — Part 3: Business Logic

## LLMAnalysisAgent

```ts
// apps/data-service/src/agents/llm-analysis-agent.ts

import { Agent, callable } from "agents"
import type { LLMAgentRPC, LLMAgentState, AnalysisRequest, AnalysisResult, StrategyTemplate } from "@repo/data-ops/agents/llm/types"
import { createLLMProvider } from "@repo/data-ops/providers/llm/factory"
import { estimateCost } from "@repo/data-ops/providers/llm/pricing"
import { TRADE_RECOMMENDATION_PROMPT, RESEARCH_REPORT_PROMPT, EVENT_CLASSIFICATION_PROMPT } from "@repo/data-ops/providers/llm/prompts"
import { initDatabase, getDb } from "@repo/data-ops/db"
import { getCredentials } from "@repo/data-ops/queries/credentials"
import { decrypt } from "@repo/data-ops/utils/crypto"

export class LLMAnalysisAgent extends Agent<Env, LLMAgentState> implements LLMAgentRPC {
  initialState: LLMAgentState = {
    totalAnalyses: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    lastAnalysisAt: null,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    initDatabase(this.env)
    this.sql`CREATE TABLE IF NOT EXISTS usage_log (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, model TEXT NOT NULL, provider TEXT NOT NULL,
      prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER,
      estimated_cost_usd REAL, strategy_id TEXT, created_at TEXT NOT NULL
    )`
    this.sql`CREATE TABLE IF NOT EXISTS provider_config (
      key TEXT PRIMARY KEY DEFAULT 'main', data TEXT NOT NULL
    )`
  }

  @callable()
  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const userId = this.name
    const db = getDb()

    // Get user's LLM credentials (encrypted in DB, decrypt with env key)
    const creds = await getCredentials(db, userId)
    if (!creds) throw new Error("LLM credentials not configured")
    const llmCreds = {
      provider: creds.provider,
      apiKey: await decrypt(creds.encryptedApiKey, this.env.CREDENTIALS_ENCRYPTION_KEY),
      model: creds.model,
    }

    const llm = createLLMProvider({
      provider: llmCreds.provider,
      apiKey: llmCreds.apiKey,
      model: llmCreds.model,
    })

    // Build strategy-aware prompt
    const strategyContext = buildStrategyContext(request.strategy)
    const contextStr = JSON.stringify({
      symbol: request.symbol,
      signals: request.signals,
      technicals: request.technicals,
    }, null, 2)

    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    // Generate recommendation
    const recResult = await llm.complete({
      messages: [
        { role: "system", content: `You are a trading analyst. ${strategyContext}` },
        { role: "user", content: TRADE_RECOMMENDATION_PROMPT + contextStr },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    })

    totalUsage.prompt_tokens += recResult.usage.prompt_tokens
    totalUsage.completion_tokens += recResult.usage.completion_tokens
    totalUsage.total_tokens += recResult.usage.total_tokens

    const recommendation = parseRecommendation(recResult.content)

    // Optional research
    let research: string | undefined
    if (request.includeResearch) {
      const resResult = await llm.complete({
        messages: [
          { role: "system", content: RESEARCH_REPORT_PROMPT },
          { role: "user", content: `Research report for ${request.symbol}.\n\nContext:\n${contextStr}` },
        ],
        temperature: 0.5,
        max_tokens: 2000,
      })
      research = resResult.content
      totalUsage.prompt_tokens += resResult.usage.prompt_tokens
      totalUsage.completion_tokens += resResult.usage.completion_tokens
      totalUsage.total_tokens += resResult.usage.total_tokens
    }

    const estimatedCost = estimateCost(llmCreds.model, totalUsage.prompt_tokens, totalUsage.completion_tokens)

    const result: AnalysisResult = {
      id: crypto.randomUUID(),
      userId,
      symbol: request.symbol,
      timestamp: new Date().toISOString(),
      recommendation,
      research,
      strategyId: request.strategy.id,
      usage: { ...totalUsage, estimated_cost_usd: estimatedCost },
      model: llmCreds.model,
      provider: llmCreds.provider,
    }

    // Log to SQLite
    this.sql`INSERT INTO usage_log (id, symbol, model, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, strategy_id, created_at)
      VALUES (${result.id}, ${result.symbol}, ${result.model}, ${result.provider}, ${totalUsage.prompt_tokens}, ${totalUsage.completion_tokens}, ${totalUsage.total_tokens}, ${estimatedCost}, ${request.strategy.id}, ${result.timestamp})`

    // Write to shared PG
    await insertAnalysis(db, result)
    await updateUsage(db, userId, result.provider, result.model, {
      promptTokens: totalUsage.prompt_tokens,
      completionTokens: totalUsage.completion_tokens,
      totalTokens: totalUsage.total_tokens,
      estimatedCostUsd: estimatedCost,
    })

    this.setState({
      ...this.state,
      totalAnalyses: this.state.totalAnalyses + 1,
      totalTokens: this.state.totalTokens + totalUsage.total_tokens,
      totalCostUsd: this.state.totalCostUsd + estimatedCost,
      lastAnalysisAt: new Date().toISOString(),
    })

    return result
  }

  @callable()
  async classifyEvent(rawContent: string) {
    const userId = this.name
    const db = getDb()
    const creds = await getCredentials(db, userId)
    if (!creds) throw new Error("LLM credentials not configured")
    const llmCreds = {
      provider: creds.provider,
      apiKey: await decrypt(creds.encryptedApiKey, this.env.CREDENTIALS_ENCRYPTION_KEY),
      model: creds.model,
    }

    const llm = createLLMProvider({ provider: llmCreds.provider, apiKey: llmCreds.apiKey, model: llmCreds.model })

    const result = await llm.complete({
      messages: [
        { role: "system", content: "You are a precise financial event classifier." },
        { role: "user", content: EVENT_CLASSIFICATION_PROMPT + rawContent.slice(0, 4000) },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    })

    const parsed = JSON.parse(result.content)
    return {
      event_type: String(parsed.event_type || "rumor"),
      symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map(String) : [],
      summary: String(parsed.summary || rawContent.slice(0, 200)),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    }
  }

  @callable()
  async generateReport(symbol: string, context: Record<string, unknown>) {
    const userId = this.name
    const db = getDb()
    const creds = await getCredentials(db, userId)
    if (!creds) throw new Error("LLM credentials not configured")
    const llmCreds = {
      provider: creds.provider,
      apiKey: await decrypt(creds.encryptedApiKey, this.env.CREDENTIALS_ENCRYPTION_KEY),
      model: creds.model,
    }

    const llm = createLLMProvider({ provider: llmCreds.provider, apiKey: llmCreds.apiKey, model: llmCreds.model })

    const result = await llm.complete({
      messages: [
        { role: "system", content: RESEARCH_REPORT_PROMPT },
        { role: "user", content: `Research report for ${symbol}.\n\n${JSON.stringify(context, null, 2)}` },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    })

    return { report: result.content }
  }

  @callable()
  async getUsage(days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const rows = this.sql<{ total_tokens: number; estimated_cost_usd: number }>`
      SELECT SUM(total_tokens) as total_tokens, SUM(estimated_cost_usd) as estimated_cost_usd
      FROM usage_log WHERE created_at >= ${since}
    `
    return {
      totalTokens: rows[0]?.total_tokens ?? 0,
      totalCostUsd: rows[0]?.estimated_cost_usd ?? 0,
    }
  }
}

function buildStrategyContext(strategy: StrategyTemplate): string {
  return `Risk tolerance: ${strategy.riskTolerance}. Position size bias: ${strategy.positionSizeBias * 100}%. Preferred timeframe: ${strategy.preferredTimeframe}. Focus: ${strategy.analysisFocus.join(", ")}.${strategy.customPromptSuffix ? ` ${strategy.customPromptSuffix}` : ""}`
}

function parseRecommendation(content: string): TradeRecommendation {
  try {
    const parsed = JSON.parse(content)
    return {
      action: ["buy", "sell", "hold"].includes(parsed.action) ? parsed.action : "hold",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      rationale: String(parsed.rationale || "Insufficient data"),
      entry_price: parsed.entry_price ?? undefined,
      target_price: parsed.target_price ?? undefined,
      stop_loss: parsed.stop_loss ?? undefined,
      position_size_pct: Math.max(1, Math.min(10, Number(parsed.position_size_pct) || 2)),
      timeframe: ["intraday", "swing", "position"].includes(parsed.timeframe) ? parsed.timeframe : "swing",
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    }
  } catch {
    return { action: "hold", confidence: 0.1, rationale: "Failed to parse", risks: ["Analysis error"] }
  }
}
```

---

## LLM Provider Factory

```ts
// packages/data-ops/src/providers/llm/factory.ts
// (unchanged from original — same createLLMProvider, createLLMProviderForUser)
```

---

## Analysis Prompts

```ts
// packages/data-ops/src/providers/llm/prompts.ts

export const TRADE_RECOMMENDATION_PROMPT = `Analyze the following market data and produce a JSON trade recommendation.

Required JSON fields:
- action: "buy" | "sell" | "hold"
- confidence: 0-1
- rationale: string explanation
- entry_price: number (optional)
- target_price: number (optional)
- stop_loss: number (optional)
- position_size_pct: 1-10 (optional)
- timeframe: "intraday" | "swing" | "position" (optional)
- risks: string[] of key risk factors

Consider all signals holistically. Weight recent signals higher. Account for the user's strategy parameters.

Market data:
`

export const RESEARCH_REPORT_PROMPT = `You are an equity research analyst. Generate a concise research report covering:
1. Technical outlook (trend, support/resistance, momentum)
2. Signal summary (what signals are saying)
3. Risk factors
4. Actionable conclusion

Write in professional, concise prose. No markdown headers — use short paragraphs.`

export const EVENT_CLASSIFICATION_PROMPT = `Classify the following financial event. Return JSON with:
- event_type: one of "earnings", "merger", "insider", "regulatory", "macro", "rumor", "other"
- symbols: array of affected ticker symbols
- summary: one-sentence summary
- confidence: 0-1

Event content:
`
```

---

## Database Queries

```ts
// packages/data-ops/src/queries/llm-analysis.ts
// (mostly unchanged — same insertAnalysis, getAnalyses, updateUsage, getUsageSummary)
// Added: strategyId field in insertAnalysis
```

---
