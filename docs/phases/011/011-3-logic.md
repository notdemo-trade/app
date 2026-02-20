# Phase 11: Telegram Approvals — Part 3: Business Logic
> Split from `011-phase-11-telegram-approvals.md`. See other parts in this directory.

## Query Functions

```ts
// packages/data-ops/src/queries/telegram-approvals.ts

import { eq, and, lt, desc } from "drizzle-orm"
import { pending_approvals, notification_settings } from "../drizzle/schema"
import type { Database } from "../database/setup"
import type { NewPendingApproval, PendingApprovalRecord } from "../drizzle/schema"

export async function createPendingApproval(
  db: Database,
  data: Omit<NewPendingApproval, "id" | "createdAt">
): Promise<PendingApprovalRecord> {
  const [result] = await db
    .insert(pending_approvals)
    .values(data)
    .returning()
  return result
}

export async function getPendingApprovalById(
  db: Database,
  id: string
): Promise<PendingApprovalRecord | null> {
  const [result] = await db
    .select()
    .from(pending_approvals)
    .where(eq(pending_approvals.id, id))
    .limit(1)
  return result ?? null
}

export async function getPendingApprovalsByUser(
  db: Database,
  userId: string
): Promise<PendingApprovalRecord[]> {
  return db
    .select()
    .from(pending_approvals)
    .where(
      and(
        eq(pending_approvals.userId, userId),
        eq(pending_approvals.status, "pending")
      )
    )
    .orderBy(desc(pending_approvals.createdAt))
}

export async function updateApprovalStatus(
  db: Database,
  id: string,
  status: "approved" | "rejected" | "expired",
  reason?: string
): Promise<void> {
  const now = new Date()
  await db
    .update(pending_approvals)
    .set({
      status,
      ...(status === "approved" && { approvedAt: now }),
      ...(status === "rejected" && { rejectedAt: now, rejectedReason: reason }),
      ...(status === "expired" && { rejectedAt: now, rejectedReason: "Approval timeout" }),
    })
    .where(eq(pending_approvals.id, id))
}

export async function setTelegramMessageId(
  db: Database,
  approvalId: string,
  messageId: number
): Promise<void> {
  await db
    .update(pending_approvals)
    .set({ telegramMessageId: messageId })
    .where(eq(pending_approvals.id, approvalId))
}

export async function getExpiredApprovals(
  db: Database
): Promise<PendingApprovalRecord[]> {
  return db
    .select()
    .from(pending_approvals)
    .where(
      and(
        eq(pending_approvals.status, "pending"),
        lt(pending_approvals.expiresAt, new Date())
      )
    )
}

// Notification settings queries
export async function getNotificationSettings(
  db: Database,
  userId: string
): Promise<NotificationSettingsRecord | null> {
  const [result] = await db
    .select()
    .from(notification_settings)
    .where(eq(notification_settings.userId, userId))
    .limit(1)
  return result ?? null
}

export async function upsertNotificationSettings(
  db: Database,
  userId: string,
  settings: Partial<Omit<NotificationSettingsRecord, "userId" | "updatedAt">>
): Promise<void> {
  await db
    .insert(notification_settings)
    .values({ userId, ...settings })
    .onConflictDoUpdate({
      target: notification_settings.userId,
      set: { ...settings, updatedAt: new Date() },
    })
}
```

---


## Telegram Service

```ts
// packages/data-ops/src/services/telegram-service.ts

import type { TelegramMessage, TelegramUpdate, TelegramInlineKeyboard } from "../telegram/types"

const TELEGRAM_API = "https://api.telegram.org/bot"

interface TelegramServiceConfig {
  botToken: string
  chatId: string
}

export class TelegramService {
  private baseUrl: string
  private chatId: string

  constructor(config: TelegramServiceConfig) {
    this.baseUrl = `${TELEGRAM_API}${config.botToken}`
    this.chatId = config.chatId
  }

  async sendMessage(text: string, replyMarkup?: TelegramInlineKeyboard): Promise<number> {
    const body: TelegramMessage = {
      chat_id: this.chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup && { reply_markup: replyMarkup }),
    }

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new TelegramApiError(res.status, error)
    }

    const data = await res.json() as { result: { message_id: number } }
    return data.result.message_id
  }

  async editMessage(messageId: number, text: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new TelegramApiError(res.status, error)
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    })
  }

  // Test bot connection
  async testConnection(): Promise<{ ok: boolean; username?: string }> {
    const res = await fetch(`${this.baseUrl}/getMe`)
    if (!res.ok) return { ok: false }
    const data = await res.json() as { result: { username: string } }
    return { ok: true, username: data.result.username }
  }
}

export class TelegramApiError extends Error {
  constructor(public statusCode: number, public body: string) {
    super(`Telegram API error (${statusCode}): ${body}`)
    this.name = "TelegramApiError"
  }
}
```

---


## Notification Message Builders

```ts
// packages/data-ops/src/services/telegram-messages.ts

import type { TelegramInlineKeyboard } from "../telegram/types"
import type { PendingApprovalRecord } from "../drizzle/schema"

export function buildApprovalMessage(approval: PendingApprovalRecord): {
  text: string
  keyboard: TelegramInlineKeyboard
} {
  const emoji = approval.action === "buy" ? "📈" : "📉"
  const actionText = approval.action.toUpperCase()
  const expiresIn = Math.round((approval.expiresAt.getTime() - Date.now()) / 60000)
  const totalValue = (approval.quantity * approval.estimatedPrice).toFixed(2)

  const text = `${emoji} <b>Trade Approval Required</b>

<b>Symbol:</b> ${approval.symbol}
<b>Action:</b> ${actionText}
<b>Quantity:</b> ${approval.quantity}
<b>Est. Price:</b> $${approval.estimatedPrice.toFixed(2)}
<b>Total Value:</b> $${totalValue}
<b>Confidence:</b> ${(approval.confidence * 100).toFixed(0)}%

<b>Rationale:</b>
${approval.rationale}

<i>Expires in ${expiresIn} minutes</i>`

  const keyboard: TelegramInlineKeyboard = {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve:${approval.id}` },
      { text: "❌ Reject", callback_data: `reject:${approval.id}` },
    ]],
  }

  return { text, keyboard }
}

export function buildTradeExecutedMessage(params: {
  symbol: string
  action: "buy" | "sell"
  quantity: number
  fillPrice: number
  orderId: string
}): string {
  const emoji = params.action === "buy" ? "🟢" : "🔴"
  const totalValue = (params.quantity * params.fillPrice).toFixed(2)

  return `${emoji} <b>Trade Executed</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Quantity:</b> ${params.quantity}
<b>Fill Price:</b> $${params.fillPrice.toFixed(2)}
<b>Total Value:</b> $${totalValue}
<b>Order ID:</b> <code>${params.orderId}</code>`
}

export function buildTradeRejectedMessage(params: {
  symbol: string
  action: "buy" | "sell"
  reason: string
}): string {
  return `⛔ <b>Trade Rejected</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Reason:</b> ${params.reason}`
}

export function buildDailySummaryMessage(params: {
  date: string
  totalTrades: number
  wins: number
  losses: number
  pnlUsd: number
  pnlPct: number
  equity: number
}): string {
  const emoji = params.pnlUsd >= 0 ? "📈" : "📉"
  const pnlSign = params.pnlUsd >= 0 ? "+" : ""
  const winRate = params.totalTrades > 0
    ? ((params.wins / params.totalTrades) * 100).toFixed(0)
    : "0"

  return `${emoji} <b>Daily Summary - ${params.date}</b>

<b>Trades:</b> ${params.totalTrades}
<b>Win Rate:</b> ${winRate}% (${params.wins}W/${params.losses}L)
<b>P&L:</b> ${pnlSign}$${params.pnlUsd.toFixed(2)} (${pnlSign}${params.pnlPct.toFixed(2)}%)
<b>Equity:</b> $${params.equity.toFixed(2)}`
}

export function buildRiskAlertMessage(params: {
  type: "daily_loss_limit" | "kill_switch"
  reason: string
  details?: string
}): string {
  const title = params.type === "daily_loss_limit"
    ? "⚠️ Daily Loss Limit Reached"
    : "🛑 Kill Switch Activated"

  let text = `${title}

<b>Reason:</b> ${params.reason}`

  if (params.details) {
    text += `\n<b>Details:</b> ${params.details}`
  }

  text += "\n\n<i>Trading has been paused.</i>"
  return text
}

export function buildPositionUpdateMessage(params: {
  positions: Array<{
    symbol: string
    qty: number
    avgPrice: number
    currentPrice: number
    pnlUsd: number
    pnlPct: number
  }>
  totalPnl: number
}): string {
  if (params.positions.length === 0) {
    return "📊 <b>Position Update</b>\n\nNo open positions."
  }

  let text = "📊 <b>Position Update</b>\n\n"

  for (const pos of params.positions) {
    const emoji = pos.pnlUsd >= 0 ? "🟢" : "🔴"
    const pnlSign = pos.pnlUsd >= 0 ? "+" : ""
    text += `${emoji} <b>${pos.symbol}</b>: ${pos.qty} @ $${pos.currentPrice.toFixed(2)} (${pnlSign}${pos.pnlPct.toFixed(1)}%)\n`
  }

  const totalEmoji = params.totalPnl >= 0 ? "📈" : "📉"
  const totalSign = params.totalPnl >= 0 ? "+" : ""
  text += `\n${totalEmoji} <b>Total P&L:</b> ${totalSign}$${params.totalPnl.toFixed(2)}`

  return text
}

export function buildApprovalUpdatedMessage(
  approval: PendingApprovalRecord,
  status: "approved" | "rejected" | "expired"
): string {
  const emoji = status === "approved" ? "✅" : "❌"
  const statusText = status === "expired" ? "Expired" : status.charAt(0).toUpperCase() + status.slice(1)

  return `${emoji} <b>Trade ${statusText}</b>

<b>Symbol:</b> ${approval.symbol}
<b>Action:</b> ${approval.action.toUpperCase()}
<b>Quantity:</b> ${approval.quantity}
<b>Est. Price:</b> $${approval.estimatedPrice.toFixed(2)}`
}
```

---


## Notification Dispatcher

```ts
// packages/data-ops/src/services/notification-dispatcher.ts

import { TelegramService } from "./telegram-service"
import { getNotificationSettings } from "../queries/telegram-approvals"
import { getTelegramCredential } from "../queries/credentials"
import type { Database } from "../database/setup"
import type { NotificationType } from "../telegram/types"

interface DispatcherConfig {
  db: Database
  userId: string
  masterKey: string
}

export async function dispatchNotification(
  config: DispatcherConfig,
  type: NotificationType,
  message: string,
  keyboard?: import("../telegram/types").TelegramInlineKeyboard
): Promise<{ sent: boolean; messageId?: number; reason?: string }> {
  const settings = await getNotificationSettings(config.db, config.userId)

  // Check if notification type enabled
  if (settings) {
    if (type === "trade_approval" && !settings.enableTradeApprovals) {
      return { sent: false, reason: "disabled" }
    }
    if (type === "trade_executed" && !settings.enableTradeResults) {
      return { sent: false, reason: "disabled" }
    }
    if (type === "daily_summary" && !settings.enableDailySummary) {
      return { sent: false, reason: "disabled" }
    }
    if (type === "risk_alert" && !settings.enableRiskAlerts) {
      return { sent: false, reason: "disabled" }
    }
    if (type === "position_update" && !settings.enablePositionUpdates) {
      return { sent: false, reason: "disabled" }
    }

    // Check quiet hours (skip for risk alerts)
    if (type !== "risk_alert" && type !== "trade_approval") {
      if (isQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
        return { sent: false, reason: "quiet_hours" }
      }
    }
  }

  // Get Telegram credentials
  const cred = await getTelegramCredential(config.db, config.userId, config.masterKey)
  if (!cred) {
    return { sent: false, reason: "no_credentials" }
  }

  const telegram = new TelegramService(cred)

  try {
    const messageId = await telegram.sendMessage(message, keyboard)
    return { sent: true, messageId }
  } catch (err) {
    console.error("Telegram send failed:", err)
    return { sent: false, reason: "send_failed" }
  }
}

function isQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false

  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const currentMins = hours * 60 + minutes

  const [startH, startM] = start.split(":").map(Number)
  const [endH, endM] = end.split(":").map(Number)
  const startMins = startH * 60 + startM
  const endMins = endH * 60 + endM

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins < endMins
  } else {
    // Spans midnight
    return currentMins >= startMins || currentMins < endMins
  }
}
```

---


## Webhook Handler

```ts
// apps/data-service/src/hono/handlers/telegram-webhook-handlers.ts

import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { TelegramWebhookUpdateSchema } from "@repo/data-ops/zod-schema/telegram"
import {
  getPendingApprovalById,
  updateApprovalStatus,
  getNotificationSettings,
} from "@repo/data-ops/queries/telegram-approvals"
import { getTelegramCredential, saveUserChatId } from "@repo/data-ops/queries/credentials"
import { TelegramService } from "@repo/data-ops/services/telegram-service"
import { buildApprovalUpdatedMessage } from "@repo/data-ops/services/telegram-messages"

const telegramWebhook = new Hono<{ Bindings: Env }>()

// Webhook receives Telegram updates for a specific user
// Route: POST /api/telegram/webhook/:userId
telegramWebhook.post(
  "/webhook/:userId",
  zValidator("param", z.object({ userId: z.string() })),
  async (c) => {
    const { userId } = c.req.valid("param")

    // Parse update
    let update: z.infer<typeof TelegramWebhookUpdateSchema>
    try {
      update = TelegramWebhookUpdateSchema.parse(await c.req.json())
    } catch {
      return c.json({ ok: false, error: "Invalid update" }, 400)
    }

    // Handle /start command - capture chat_id
    if (update.message?.text === "/start") {
      const chatId = String(update.message.chat.id)
      await saveUserChatId(c.get("db"), userId, chatId, c.env.CREDENTIALS_ENCRYPTION_KEY)

      const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)
      if (cred) {
        const telegram = new TelegramService(cred)
        await telegram.sendMessage(
          "✅ <b>Setup Complete!</b>\n\nYou'll now receive trade approvals and notifications here."
        )
      }

      return c.json({ ok: true })
    }

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const { id: callbackId, data } = update.callback_query

      // Parse callback data: "approve:uuid" or "reject:uuid"
      const [action, approvalId] = data.split(":")
      if (!approvalId || (action !== "approve" && action !== "reject")) {
        return c.json({ ok: true }) // Ignore invalid callback
      }

      // Get approval
      const approval = await getPendingApprovalById(c.get("db"), approvalId)
      if (!approval) {
        return c.json({ ok: true })
      }

      // Verify user owns this approval
      if (approval.userId !== userId) {
        return c.json({ ok: true })
      }

      // Check not already processed
      if (approval.status !== "pending") {
        const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)
        if (cred) {
          const telegram = new TelegramService(cred)
          await telegram.answerCallbackQuery(callbackId, "This approval has already been processed")
        }
        return c.json({ ok: true })
      }

      // Check not expired
      if (new Date() > approval.expiresAt) {
        await updateApprovalStatus(c.get("db"), approvalId, "expired")
        const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)
        if (cred) {
          const telegram = new TelegramService(cred)
          await telegram.answerCallbackQuery(callbackId, "This approval has expired")
        }
        return c.json({ ok: true })
      }

      // Process action
      const status = action === "approve" ? "approved" : "rejected"
      await updateApprovalStatus(c.get("db"), approvalId, status)

      // Update message and answer callback
      const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)
      if (cred && approval.telegramMessageId) {
        const telegram = new TelegramService(cred)

        // Update the message to show new status (removes buttons)
        const updatedApproval = { ...approval, status }
        await telegram.editMessage(
          approval.telegramMessageId,
          buildApprovalUpdatedMessage(updatedApproval, status)
        )

        await telegram.answerCallbackQuery(
          callbackId,
          status === "approved" ? "Trade approved!" : "Trade rejected"
        )
      }

      // If approved, trigger order execution via Agent RPC
      if (status === "approved") {
        const { getAgentByName } = await import("agents")
        const agent = await getAgentByName<TradingAgent>(c.env.TradingAgent, userId)
        await agent.executeApproval(approvalId)
      }

      return c.json({ ok: true })
    }

    return c.json({ ok: true })
  }
)

// Test Telegram connection
telegramWebhook.post(
  "/test",
  async (c) => {
    const userId = c.get("userId")
    const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)

    if (!cred) {
      return c.json({ success: false, error: "No Telegram credentials configured" }, 400)
    }

    const telegram = new TelegramService(cred)

    try {
      await telegram.sendMessage("🔔 <b>Test Notification</b>\n\nYour Telegram is configured correctly!")
      return c.json({ success: true })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 400)
    }
  }
)

// Get Telegram bot status
telegramWebhook.get(
  "/status",
  async (c) => {
    const userId = c.get("userId")
    const cred = await getTelegramCredential(c.get("db"), userId, c.env.CREDENTIALS_ENCRYPTION_KEY)

    if (!cred) {
      return c.json({ connected: false, reason: "no_credentials" })
    }

    const telegram = new TelegramService(cred)
    const result = await telegram.testConnection()

    return c.json({
      connected: result.ok,
      botUsername: result.username,
      chatId: cred.chatId,
    })
  }
)

export { telegramWebhook }
```

---


## TradingAgent Integration (Agents SDK)

Update TradingAgent (Agents SDK, see Phase 12) to use approval flow. Agent uses `this.sql` for approval timeouts and `getAgentByName()` RPC for webhook→agent communication.

```ts
// apps/data-service/src/agents/trading-agent.ts (additions)

import { createPendingApproval, setTelegramMessageId, updateApprovalStatus, getPendingApprovalById } from "@repo/data-ops/queries/telegram-approvals"
import { dispatchNotification } from "@repo/data-ops/services/notification-dispatcher"
import { buildApprovalMessage, buildTradeExecutedMessage } from "@repo/data-ops/services/telegram-messages"

// In TradingAgent class (extends Agent<Env, AgentState>):

private async proposeTradeFromRecommendation(
  rec: { symbol: string; action: "buy" | "sell"; confidence: number; rationale: string },
  config: AgentConfig
): Promise<void> {
  const { symbol, action, confidence, rationale } = rec
  const userId = this.name // Agent name = userId

  const quantity = await this.calculatePositionSize(symbol, config)
  const estimatedPrice = await this.getEstimatedPrice(symbol)
  const notional = quantity * estimatedPrice

  if (config.autoApproveEnabled && notional <= config.autoApproveMaxNotional) {
    await this.executeOrder({ symbol, action, quantity, estimatedPrice })
    return
  }

  // Create pending approval in PostgreSQL (shared with Telegram webhook)
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

  // Track approval timeout in SQLite (checked by scheduleEvery(60, "processExpiredApprovals"))
  const expiresAtStr = expiresAt.toISOString()
  this.sql`INSERT INTO approval_timeouts (approval_id, expires_at) VALUES (${approval.id}, ${expiresAtStr})`

  this.logActivity("trade_proposed", symbol, {
    action, confidence, quantity, estimatedPrice,
  })
}

// Scheduled every 60s via scheduleEvery() — replaces alarm-based timeout checking
async processExpiredApprovals(): Promise<void> {
  const now = new Date().toISOString()
  const expired = this.sql<{ approval_id: string }>`
    SELECT approval_id FROM approval_timeouts WHERE expires_at <= ${now}
  `
  for (const row of expired) {
    await updateApprovalStatus(this.env.DB, row.approval_id, "expired")
    this.logActivity("trade_rejected", undefined, { approvalId: row.approval_id, reason: "timeout" })
  }
  if (expired.length > 0) {
    this.sql`DELETE FROM approval_timeouts WHERE expires_at <= ${now}`
  }
}

// Called from Telegram webhook via getAgentByName() RPC (NOT @callable — server-only)
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

  const userId = this.name
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

  this.sql`DELETE FROM approval_timeouts WHERE approval_id = ${approvalId}`
  return { success: true, orderId: result.orderId }
}
```

---

