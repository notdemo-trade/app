# Phase 12: Orchestrator Agent — Part 3: Business Logic

## OrchestratorAgent Implementation (MVP)

> **AUDIT 2025-02-21**: Issues found in implementation below:
> 1. `getSignalsForSymbols()` called (line ~271) but never defined/imported — needs query in data-ops
> 2. `filterSignalsForSymbol()` called (line ~206) but never defined/imported — needs utility
> 3. `getDb()` called (line ~269) but never defined — DO needs PG access pattern (env.HYPERDRIVE or direct)
> 4. TA agent errors silently swallowed with `/* log */` — replace with actual error handling
> 5. No `this.retry()` on external calls (getAgentByName RPC, PG queries) — add per agents-sdk-features.md
> 6. Missing `static options = { hibernate: true }` — add per agents-sdk-features.md
> 7. `StrategyTemplate` type comes from Phase 6 (LLM agent) — cross-phase dependency, verify import path

```ts
// apps/data-service/src/agents/orchestrator-agent.ts

import { Agent, callable, getAgentByName, type StreamingResponse } from "agents"
import type { OrchestratorConfig, OrchestratorState, AgentEntitlement, AgentActivity, AgentAction, OrchestratorStatus } from "@repo/data-ops/agents/orchestrator/types"
import type { TAAgentRPC } from "@repo/data-ops/agents/ta/types"
import type { LLMAgentRPC, StrategyTemplate, AnalysisResult } from "@repo/data-ops/agents/llm/types"
import { getDefaultOrchestratorConfig, DEFAULT_STRATEGIES } from "@repo/data-ops/agents/orchestrator/defaults"
import { initDatabase, getDb } from "@repo/data-ops/db"
import { signals } from "@repo/data-ops/drizzle/schema"
import { and, gte, eq, inArray } from "drizzle-orm"

export class OrchestratorAgent extends Agent<Env, OrchestratorState> {
  static options = { hibernate: true }

  initialState: OrchestratorState = {
    enabled: false,
    lastDataGatherAt: null,
    lastAnalysisAt: null,
    lastTradeAt: null,
    currentCycleStartedAt: null,
    cycleCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    initDatabase(this.env)
    this.initDb()
  }

  private initDb() {
    this.sql`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY DEFAULT 'main', data TEXT NOT NULL)`
    this.sql`CREATE TABLE IF NOT EXISTS entitlements (agent_type TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1)`
    this.sql`CREATE TABLE IF NOT EXISTS strategy_templates (id TEXT PRIMARY KEY, name TEXT, data TEXT NOT NULL, is_default INTEGER DEFAULT 0, created_at TEXT)`
    this.sql`CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, timestamp TEXT, action TEXT, symbol TEXT, details TEXT DEFAULT '{}')`
    this.sql`CREATE TABLE IF NOT EXISTS recommendations (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, action TEXT NOT NULL, confidence REAL NOT NULL, rationale TEXT NOT NULL, strategy_id TEXT NOT NULL, signals_summary TEXT, created_at TEXT DEFAULT (datetime('now')))`
    // Phase 10 adds: approval_timeouts table

    const entCount = this.sql<{ cnt: number }>`SELECT COUNT(*) as cnt FROM entitlements`
    if (entCount[0].cnt === 0) {
      this.seedDefaults()
    }
  }

  private seedDefaults() {
    // MVP: only TA + LLM enabled
    const defaults = [
      { type: "TechnicalAnalysisAgent", enabled: 1 },
      { type: "LLMAnalysisAgent", enabled: 1 },
      { type: "StockTwitsAgent", enabled: 0 },
      { type: "TwitterAgent", enabled: 0 },
      { type: "SecFilingsAgent", enabled: 0 },
      { type: "FredAgent", enabled: 0 },
    ]
    for (const d of defaults) {
      this.sql`INSERT OR IGNORE INTO entitlements (agent_type, enabled) VALUES (${d.type}, ${d.enabled})`
    }
    for (const s of DEFAULT_STRATEGIES) {
      this.sql`INSERT OR IGNORE INTO strategy_templates (id, name, data, is_default, created_at)
        VALUES (${s.id}, ${s.name}, ${JSON.stringify(s)}, 1, ${new Date().toISOString()})`
    }
  }

  // --- Config ---

  private getConfig(): OrchestratorConfig {
    const rows = this.sql<{ data: string }>`SELECT data FROM config WHERE key = 'main'`
    if (rows.length === 0) return getDefaultOrchestratorConfig()
    return JSON.parse(rows[0].data) as OrchestratorConfig
  }

  private saveConfig(config: OrchestratorConfig) {
    this.sql`INSERT OR REPLACE INTO config (key, data) VALUES ('main', ${JSON.stringify(config)})`
  }

  private getEntitlements(): AgentEntitlement[] {
    return this.sql<{ agent_type: string; enabled: number }>`SELECT agent_type, enabled FROM entitlements`
      .map(r => ({ agentType: r.agent_type, enabled: r.enabled === 1 }))
  }

  private isAgentEnabled(agentType: string): boolean {
    const rows = this.sql<{ enabled: number }>`SELECT enabled FROM entitlements WHERE agent_type = ${agentType}`
    return rows.length > 0 && rows[0].enabled === 1
  }

  private getActiveStrategy(): StrategyTemplate {
    const config = this.getConfig()
    const rows = this.sql<{ data: string }>`SELECT data FROM strategy_templates WHERE id = ${config.activeStrategyId}`
    if (rows.length === 0) return DEFAULT_STRATEGIES[1] // moderate fallback
    return JSON.parse(rows[0].data) as StrategyTemplate
  }

  // --- Callable methods ---

  @callable()
  async enable(): Promise<{ success: true }> {
    const config = this.getConfig()
    // MVP: only schedule runAnalysis. No gatherSignals (no signal agents) or processExpiredApprovals (no approval flow).
    await this.scheduleEvery(config.analystIntervalSec, "runAnalysis", {})
    // Phase 4 adds: this.scheduleEvery(config.dataPollIntervalSec, "gatherSignals", {})
    // Phase 10 adds: this.scheduleEvery(60, "processExpiredApprovals", {})

    this.setState({ ...this.state, enabled: true, errorCount: 0, lastError: null })
    this.logActivity("started")
    return { success: true }
  }

  @callable()
  async disable(): Promise<{ success: true }> {
    const schedules = this.getSchedules()
    for (const s of schedules) await this.cancelSchedule(s.id)

    this.setState({ ...this.state, enabled: false })
    this.logActivity("stopped")
    return { success: true }
  }

  @callable()
  getStatus(): OrchestratorStatus {
    return {
      enabled: this.state.enabled,
      state: this.state,
      config: this.getConfig(),
      entitlements: this.getEntitlements(),
      recentActivity: this.getRecentActivity(10),
      stats: this.getTodayStats(),
    }
  }

  @callable()
  getOrchestratorConfig(): OrchestratorConfig {
    return this.getConfig()
  }

  @callable()
  async updateConfig(updates: Partial<OrchestratorConfig>): Promise<OrchestratorConfig> {
    const current = this.getConfig()
    const updated = { ...current, ...updates }
    this.saveConfig(updated)

    if (this.state.enabled && updates.analystIntervalSec) {
      await this.disable()
      await this.enable()
    }
    return updated
  }

  @callable()
  async updateEntitlement(agentType: string, enabled: boolean): Promise<AgentEntitlement[]> {
    this.sql`INSERT OR REPLACE INTO entitlements (agent_type, enabled) VALUES (${agentType}, ${enabled ? 1 : 0})`
    return this.getEntitlements()
  }

  @callable()
  async trigger(): Promise<{ success: true }> {
    if (!this.state.enabled) throw new Error("Orchestrator not enabled")
    await this.runAnalysis()
    return { success: true }
  }

  @callable()
  getActivity(limit = 50): AgentActivity[] {
    return this.getRecentActivity(limit)
  }

  @callable()
  getRecommendations(limit = 20): Array<{
    id: string; symbol: string; action: string; confidence: number
    rationale: string; strategyId: string; signalsSummary: string | null; createdAt: string
  }> {
    return this.sql`SELECT id, symbol, action, confidence, rationale, strategy_id as strategyId, signals_summary as signalsSummary, created_at as createdAt FROM recommendations ORDER BY created_at DESC LIMIT ${limit}`
  }

  // --- Analysis + Recommendation Loop (scheduled) ---

  async runAnalysis(): Promise<void> {
    if (!this.state.enabled) return
    const config = this.getConfig()
    const userId = this.name

    this.logActivity("analysis_started")
    const strategy = this.getActiveStrategy()

    // Gather TA for each watchlist symbol
    const taSignals: Record<string, unknown> = {}
    if (this.isAgentEnabled("TechnicalAnalysisAgent")) {
      for (const symbol of config.watchlistSymbols) {
        try {
          const taAgent = await getAgentByName<TAAgentRPC>(this.env.TechnicalAnalysisAgent, `${userId}:${symbol}`)
          taSignals[symbol] = {
            signals: await taAgent.getSignals(),
            indicators: await taAgent.getIndicators(),
          }
        } catch (err) { /* log */ }
      }
    }

    // Collect all signals from shared PG (TA writes there)
    const allSignals = await this.collectAllSignals()

    // LLM analysis → log recommendation (MVP: no trade proposal)
    if (this.isAgentEnabled("LLMAnalysisAgent")) {
      try {
        const llmAgent = await getAgentByName<LLMAgentRPC>(this.env.LLMAnalysisAgent, userId)

        for (const symbol of config.watchlistSymbols) {
          const symbolSignals = this.filterSignalsForSymbol(allSignals, symbol)
          if (symbolSignals.length === 0) continue

          const result = await llmAgent.analyze({
            symbol,
            signals: symbolSignals,
            technicals: taSignals[symbol] as Record<string, unknown>,
            strategy,
          })

          // MVP: log recommendation instead of proposing trade
          await this.logRecommendation(result, strategy.id)

          // Phase 8 adds:
          // if (result.recommendation.action !== "hold" && result.recommendation.confidence >= config.minAnalystConfidence) {
          //   await this.proposeTradeFromRecommendation(result, config)
          // }
        }
      } catch (err) {
        this.setState({ ...this.state, errorCount: this.state.errorCount + 1, lastError: String(err) })
      }
    }

    this.logActivity("analysis_completed")
    this.setState({
      ...this.state,
      lastAnalysisAt: new Date().toISOString(),
      cycleCount: this.state.cycleCount + 1,
    })
  }

  // --- MVP: Recommendation logging ---

  private async logRecommendation(result: AnalysisResult, strategyId: string): Promise<void> {
    const { symbol } = result
    const { action, confidence, rationale } = result.recommendation
    const id = crypto.randomUUID()

    this.sql`INSERT INTO recommendations (id, symbol, action, confidence, rationale, strategy_id, signals_summary)
      VALUES (${id}, ${symbol}, ${action}, ${confidence}, ${rationale}, ${strategyId}, ${JSON.stringify(result.signalsSummary ?? null)})`

    this.logActivity("recommendation_logged", symbol, { action, confidence, strategyId })
  }

  // --- Phase 4 adds: gatherSignals() ---
  // async gatherSignals(): Promise<void> {
  //   Calls enabled signal agents via getAgentByName() RPC.
  //   See Phase 4 design doc for full implementation.
  // }

  // --- Phase 8 adds: Trade Execution ---
  // proposeTradeFromRecommendation(), executeOrder(), calculatePositionSize(), getEstimatedPrice()

  // --- Phase 10 adds: Approval Flow ---
  // executeApproval(), processExpiredApprovals()

  // --- Private helpers ---

  private getUserId(): string { return this.name }

  private async collectAllSignals(): Promise<Array<{ type: string; direction: string; strength: number; source: string }>> {
    const db = getDb()
    const config = this.getConfig()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const rows = await db.select().from(signals)
      .where(and(
        inArray(signals.symbol, config.watchlistSymbols),
        gte(signals.createdAt, since),
      ))
      .orderBy(signals.createdAt)

    return rows.map(r => ({
      type: r.signalType,
      direction: r.direction,
      strength: Number(r.strength),
      source: r.sourceAgent,
      symbol: r.symbol,
    }))
  }

  private filterSignalsForSymbol(
    allSignals: Array<{ type: string; direction: string; strength: number; source: string; symbol?: string | null }>,
    symbol: string,
  ) {
    return allSignals.filter(s => s.symbol === symbol)
  }

  // --- Activity log ---

  private logActivity(action: AgentAction, symbol?: string, details: Record<string, unknown> = {}) {
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    this.sql`INSERT INTO activity_log (id, timestamp, action, symbol, details) VALUES (${id}, ${timestamp}, ${action}, ${symbol ?? null}, ${JSON.stringify(details)})`
  }

  private getRecentActivity(limit: number): AgentActivity[] {
    return this.sql<AgentActivity>`SELECT id, timestamp, action, symbol, details FROM activity_log ORDER BY timestamp DESC LIMIT ${limit}`
  }

  private getTodayStats() {
    const today = new Date().toISOString().slice(0, 10)
    const rows = this.sql<{ action: string; cnt: number }>`SELECT action, COUNT(*) as cnt FROM activity_log WHERE timestamp >= ${today} GROUP BY action`
    const counts = Object.fromEntries(rows.map(r => [r.action, r.cnt]))
    return {
      signalsToday: counts["signals_aggregated"] ?? 0,
      recommendationsToday: counts["recommendation_logged"] ?? 0,
      proposalsToday: counts["trade_proposed"] ?? 0,        // Phase 8
      tradesExecutedToday: counts["trade_executed"] ?? 0,    // Phase 8
    }
  }
}
```

---

## Worker Entry Point (MVP)

> **AUDIT 2025-02-21**: Current codebase uses `WorkerEntrypoint` class (for Queues/Workflows).
> **Decision**: Keep `WorkerEntrypoint`. Call `routeAgentRequest()` inside `fetch()` method.
> Agent class exports go at module level (alongside `WorkerEntrypoint` export).

```ts
// apps/data-service/src/index.ts

import { routeAgentRequest } from "agents"
import app from "./hono/app"

// MVP: only 3 agents
export { OrchestratorAgent } from "./agents/orchestrator-agent"
export { TechnicalAnalysisAgent } from "./agents/technical-analysis-agent"
export { LLMAnalysisAgent } from "./agents/llm-analysis-agent"

// Phase 4 adds:
// export { StockTwitsAgent } from "./agents/stocktwits-agent"
// export { TwitterAgent } from "./agents/twitter-agent"
// export { SecFilingsAgent } from "./agents/sec-filings-agent"
// export { FredAgent } from "./agents/fred-agent"

// Keep WorkerEntrypoint for Queues/Workflows. routeAgentRequest inside fetch().
export default class Worker extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    const agentResponse = await routeAgentRequest(request, this.env)
    if (agentResponse) return agentResponse
    return app.fetch(request, this.env, this.ctx)
  }
  // existing scheduled(), queue() methods preserved
}
```

---
