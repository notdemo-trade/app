# Phase 12: Autonomous Agent — Part 3: Business Logic
> Split from `012-phase-12-autonomous-agent.md`. See other parts in this directory.

## Agent Implementation (Agents SDK)

```ts
// apps/data-service/src/agents/trading-agent.ts

import { Agent, callable, type StreamingResponse } from "agents"
import { getAgentByName } from "agents"
import type { AgentConfig, AgentState, AgentActivity, AgentAction } from "@repo/data-ops/agent/types"
import { getDefaultAgentConfig } from "@repo/data-ops/agent/defaults"
import {
  createPendingApproval,
  getPendingApprovalById,
  setTelegramMessageId,
  updateApprovalStatus,
} from "@repo/data-ops/queries/telegram-approvals"
import { dispatchNotification } from "@repo/data-ops/services/notification-dispatcher"
import { buildApprovalMessage, buildTradeExecutedMessage } from "@repo/data-ops/services/telegram-messages"

interface Env {
  DB: D1Database
  CREDENTIALS_ENCRYPTION_KEY: string
  APPROVAL_SECRET: string
  TradingAgent: DurableObjectNamespace
}

export class TradingAgent extends Agent<Env, AgentState> {
  // Initial state — used for new instances, persisted ones load from SQLite
  initialState: AgentState = {
    enabled: false,
    lastDataGatherAt: null,
    lastAnalysisAt: null,
    lastTradeAt: null,
    currentCycleStartedAt: null,
    cycleCount: 0,
    errorCount: 0,
    lastError: null,
  }

  // --- Lifecycle ---

  // Called on start or wake from hibernation
  // Schedules persist in SQLite — no re-registration needed
  async onStart() {
    this.initDb()
  }

  // --- SQLite schema for activity log + config ---

  private initDb() {
    this.sql`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        symbol TEXT,
        details TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `
    this.sql`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY DEFAULT 'main',
        data TEXT NOT NULL
      )
    `
    this.sql`
      CREATE TABLE IF NOT EXISTS approval_timeouts (
        approval_id TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL
      )
    `
  }

  // --- Config (SQLite-persisted) ---

  private getConfig(): AgentConfig {
    const rows = this.sql<{ data: string }>`SELECT data FROM config WHERE key = 'main'`
    if (rows.length === 0) return getDefaultAgentConfig()
    return JSON.parse(rows[0].data) as AgentConfig
  }

  private saveConfig(config: AgentConfig) {
    const data = JSON.stringify(config)
    this.sql`INSERT OR REPLACE INTO config (key, data) VALUES ('main', ${data})`
  }

  // --- Callable methods (invoked via WS from UI or RPC from workers) ---

  @callable()
  async enable(): Promise<{ success: true }> {
    const config = this.getConfig()

    // Start scheduled loops
    await this.scheduleEvery(config.dataPollIntervalSec, "gatherSignals", {})
    await this.scheduleEvery(config.analystIntervalSec, "runAnalysis", {})
    // Check expired approvals every 60s
    await this.scheduleEvery(60, "processExpiredApprovals", {})

    this.setState({ ...this.state, enabled: true, errorCount: 0, lastError: null })
    this.logActivity("started")

    return { success: true }
  }

  @callable()
  async disable(): Promise<{ success: true }> {
    // Cancel all schedules
    const schedules = this.getSchedules()
    for (const s of schedules) {
      await this.cancelSchedule(s.id)
    }

    this.setState({ ...this.state, enabled: false })
    this.logActivity("stopped")

    return { success: true }
  }

  @callable()
  getStatus(): AgentStatus {
    const config = this.getConfig()
    const activity = this.getRecentActivity(10)
    const stats = this.getTodayStats()

    return {
      enabled: this.state.enabled,
      state: this.state,
      config,
      recentActivity: activity,
      stats,
    }
  }

  @callable()
  getAgentConfig(): AgentConfig {
    return this.getConfig()
  }

  @callable()
  async updateConfig(updates: Partial<AgentConfig>): Promise<AgentConfig> {
    const current = this.getConfig()
    const updated = { ...current, ...updates }
    this.saveConfig(updated)

    // Reschedule if intervals changed & agent is running
    if (this.state.enabled) {
      if (updates.dataPollIntervalSec || updates.analystIntervalSec) {
        await this.disable()
        await this.enable()
      }
    }

    return updated
  }

  @callable()
  async trigger(): Promise<{ success: true }> {
    if (!this.state.enabled) {
      throw new Error("Agent not enabled")
    }
    await this.runCycle()
    return { success: true }
  }

  @callable()
  getActivity(limit = 50): AgentActivity[] {
    return this.getRecentActivity(limit)
  }

  // Execute approved trade (called from Telegram webhook via getAgentByName RPC)
  async executeApproval(approvalId: string): Promise<{ success: true; orderId: string }> {
    const approval = await getPendingApprovalById(this.env.DB, approvalId)
    if (!approval || approval.status !== "approved") {
      throw new Error("Invalid approval")
    }

    const result = await this.executeOrder({
      symbol: approval.symbol,
      action: approval.action,
      quantity: approval.quantity,
      estimatedPrice: approval.estimatedPrice,
    })

    // Send execution notification via Telegram
    const userId = this.getUserId()
    await dispatchNotification(
      { db: this.env.DB, userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
      "trade_executed",
      buildTradeExecutedMessage({
        symbol: approval.symbol,
        action: approval.action,
        quantity: approval.quantity,
        fillPrice: result.fillPrice,
        orderId: result.orderId,
      })
    )

    this.logActivity("trade_executed", approval.symbol, {
      approvalId,
      orderId: result.orderId,
    })

    // Remove approval timeout
    this.sql`DELETE FROM approval_timeouts WHERE approval_id = ${approvalId}`

    return { success: true, orderId: result.orderId }
  }

  // Streaming LLM analysis to UI
  @callable({ streaming: true })
  async streamAnalysis(stream: StreamingResponse, symbols?: string[]) {
    const config = this.getConfig()
    const targetSymbols = symbols ?? config.watchlistSymbols

    // TODO: integrate Phase 6 LLM streaming
    // for await (const chunk of llm.stream(analysisPrompt)) {
    //   stream.send(chunk)
    // }
    stream.end()
  }

  // --- Scheduled methods (called by scheduleEvery) ---

  async gatherSignals(): Promise<void> {
    if (!this.state.enabled) return
    const config = this.getConfig()

    const userId = this.getUserId()
    const watchlist = await getWatchlist(this.env.DB, userId)
    const signals = await getSignalFeed(this.env.DB, {
      userId,
      symbols: watchlist.map(w => w.symbol),
      since: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24h
    })

    this.logActivity("signal_gathered", undefined, {
      symbols: config.watchlistSymbols.length,
      signalsCount: signals.length,
    })

    this.setState({ ...this.state, lastDataGatherAt: new Date().toISOString() })
  }

  async runAnalysis(): Promise<void> {
    if (!this.state.enabled) return
    const config = this.getConfig()

    this.logActivity("analysis_started")

    const userId = this.getUserId()
    const signals = await this.gatherSignals()
    if (signals.length === 0) return

    const recommendations: Array<{
      symbol: string
      action: "buy" | "sell" | "hold"
      confidence: number
      rationale: string
    }> = []

    for (const signal of signals) {
      // Get technicals from Phase 5
      const technicals = await analyzeTechnicals(signal.symbol)

      // Get LLM recommendation from Phase 6
      const llmRec = await generateTradeRecommendation({
        symbol: signal.symbol,
        signals: [signal],
        technicals,
        model: config.analystModel
      })

      if (llmRec.action !== 'hold' && llmRec.confidence >= config.minAnalystConfidence) {
        recommendations.push(llmRec)
      }
    }

    for (const rec of recommendations) {
      if (rec.action !== "hold" && rec.confidence >= config.minAnalystConfidence) {
        await this.proposeTradeFromRecommendation(rec, config)
      }
    }

    this.logActivity("analysis_completed", undefined, {
      recommendations: recommendations.length,
    })

    this.setState({
      ...this.state,
      lastAnalysisAt: new Date().toISOString(),
      cycleCount: this.state.cycleCount + 1,
      currentCycleStartedAt: new Date().toISOString(),
    })
  }

  async processExpiredApprovals(): Promise<void> {
    const now = new Date().toISOString()
    const expired = this.sql<{ approval_id: string }>`
      SELECT approval_id FROM approval_timeouts WHERE expires_at <= ${now}
    `

    for (const row of expired) {
      await updateApprovalStatus(this.env.DB, row.approval_id, "expired")
      this.logActivity("trade_rejected", undefined, {
        approvalId: row.approval_id,
        reason: "timeout",
      })
    }

    if (expired.length > 0) {
      this.sql`DELETE FROM approval_timeouts WHERE expires_at <= ${now}`
    }
  }

  // --- Private helpers ---

  private getUserId(): string {
    // Agent name = userId (set via getAgentByName(env.TradingAgent, userId))
    return this.name
  }

  private async proposeTradeFromRecommendation(
    rec: { symbol: string; action: "buy" | "sell"; confidence: number; rationale: string },
    config: AgentConfig
  ): Promise<void> {
    const { symbol, action, confidence, rationale } = rec
    const userId = this.getUserId()

    // Calculate position size and get price
    const quantity = await this.calculatePositionSize(symbol, config)
    const estimatedPrice = await this.getEstimatedPrice(symbol)
    const notional = quantity * estimatedPrice

    // Check auto-approve conditions
    if (config.autoApproveEnabled && notional <= config.autoApproveMaxNotional) {
      await this.executeOrder({ symbol, action, quantity, estimatedPrice })
      this.logActivity("trade_executed", symbol, { action, quantity, autoApproved: true })
      return
    }

    // Create pending approval in DB (shared with Telegram webhook)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min
    const approval = await createPendingApproval(this.env.DB, {
      userId,
      symbol,
      action,
      quantity,
      estimatedPrice,
      rationale,
      confidence,
      status: "pending",
      expiresAt,
    })

    // Send Telegram approval request
    const { text, keyboard } = buildApprovalMessage(approval)
    const result = await dispatchNotification(
      { db: this.env.DB, userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
      "trade_approval",
      text,
      keyboard
    )

    if (result.sent && result.messageId) {
      await setTelegramMessageId(this.env.DB, approval.id, result.messageId)
    }

    // Track approval timeout in SQLite
    const expiresAtStr = expiresAt.toISOString()
    this.sql`INSERT INTO approval_timeouts (approval_id, expires_at) VALUES (${approval.id}, ${expiresAtStr})`

    this.logActivity("trade_proposed", symbol, {
      action,
      confidence,
      quantity,
      estimatedPrice,
      approvalId: approval.id,
    })
  }

  // TODO: integrate Phase 4
  private async calculatePositionSize(symbol: string, config: AgentConfig): Promise<number> {
    return 1
  }

  // TODO: integrate market data
  private async getEstimatedPrice(symbol: string): Promise<number> {
    return 0
  }

  private async executeOrder(params: {
    symbol: string
    action: string
    quantity: number
    estimatedPrice: number
  }): Promise<{ orderId: string; fillPrice: number }> {
    const userId = this.getUserId()

    // Get Alpaca credentials
    const alpacaCreds = await getCredential(this.env.DB, userId, 'alpaca')
    if (!alpacaCreds) throw new Error('Alpaca credentials not configured')

    const alpacaClient = new AlpacaClient(alpacaCreds.data)

    // Submit order via Phase 8
    const order = await alpacaClient.submitOrder({
      symbol: params.symbol,
      qty: params.quantity,
      side: params.action,
      type: 'market',
      time_in_force: 'day'
    })

    // Log to activity
    await this.logActivity('order_executed', params.symbol, {
      orderId: order.id,
      symbol: params.symbol
    })

    return { orderId: order.id, fillPrice: parseFloat(order.filled_avg_price || params.estimatedPrice.toString()) }
  }

  // --- Activity log (SQLite) ---

  private logActivity(
    action: AgentAction,
    symbol?: string,
    details: Record<string, unknown> = {}
  ) {
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    const detailsJson = JSON.stringify(details)
    this.sql`
      INSERT INTO activity_log (id, timestamp, action, symbol, details)
      VALUES (${id}, ${timestamp}, ${action}, ${symbol ?? null}, ${detailsJson})
    `
  }

  private getRecentActivity(limit: number): AgentActivity[] {
    return this.sql<AgentActivity>`
      SELECT id, timestamp, action, symbol, details
      FROM activity_log
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `
  }

  private getTodayStats() {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const rows = this.sql<{ action: string; cnt: number }>`
      SELECT action, COUNT(*) as cnt
      FROM activity_log
      WHERE timestamp >= ${today}
      GROUP BY action
    `
    const counts = Object.fromEntries(rows.map(r => [r.action, r.cnt]))
    return {
      signalsToday: counts["signal_gathered"] ?? 0,
      proposalsToday: counts["trade_proposed"] ?? 0,
      tradesExecutedToday: counts["trade_executed"] ?? 0,
    }
  }
}
```

---


## Phase 11 Integration Change (Telegram webhook)

Old pattern (internal HTTP):
```ts
// Before: manual fetch routing
const agentId = c.env.TRADING_AGENT.idFromName(userId)
const agent = c.env.TRADING_AGENT.get(agentId)
await agent.fetch(new Request("http://internal/execute-approval", {
  method: "POST",
  body: JSON.stringify({ approvalId }),
}))
```

New pattern (direct RPC):
```ts
// After: type-safe RPC via getAgentByName
import { getAgentByName } from "agents"

if (status === "approved") {
  const agent = await getAgentByName<TradingAgent>(c.env.TradingAgent, userId)
  await agent.executeApproval(approvalId)
}
```

---


## Worker Entry Point (routing)

```ts
// apps/data-service/src/index.ts

import { routeAgentRequest } from "agents"
import app from "./hono/app"

export { TradingAgent } from "./agents/trading-agent"

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Route /agents/* to Agent instances (WebSocket upgrade etc)
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse

    // Everything else → Hono
    return app.fetch(request, env, ctx)
  },
}
```

---

