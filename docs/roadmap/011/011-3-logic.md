# Phase 11: Telegram Approvals — Part 3: Business Logic

## Query Functions

```ts
// packages/data-ops/src/queries/notification-settings.ts

import { eq } from "drizzle-orm"
import { notification_settings } from "../drizzle/schema"
import type { Database } from "../database/setup"
import type { NotificationSettingsRecord } from "../drizzle/schema"

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

import type { TelegramMessage, TelegramInlineKeyboard } from "../telegram/types"

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

Adapted to use the existing `TradeProposal` type from `packages/data-ops/src/agents/session/types.ts`.

```ts
// packages/data-ops/src/services/telegram-messages.ts

import type { TelegramInlineKeyboard } from "../telegram/types"
import type { TradeProposal } from "../agents/session/types"

export function buildProposalMessage(proposal: TradeProposal): {
  text: string
  keyboard: TelegramInlineKeyboard
} {
  const actionEmoji = proposal.action === "buy" ? "📈" : "📉"
  const actionText = proposal.action.toUpperCase()
  const expiresIn = Math.round((proposal.expiresAt - Date.now()) / 60000)
  const totalValue = proposal.notional
    ? `$${proposal.notional.toFixed(2)}`
    : proposal.qty && proposal.entryPrice
      ? `$${(proposal.qty * proposal.entryPrice).toFixed(2)}`
      : "N/A"

  const text = `${actionEmoji} <b>Trade Proposal</b>

<b>Symbol:</b> ${proposal.symbol}
<b>Action:</b> ${actionText}
<b>Qty:</b> ${proposal.qty ?? "TBD"}
<b>Est. Price:</b> ${proposal.entryPrice ? `$${proposal.entryPrice.toFixed(2)}` : "market"}
<b>Notional:</b> ${totalValue}
<b>Confidence:</b> ${(proposal.confidence * 100).toFixed(0)}%

<b>Rationale:</b>
${proposal.rationale}
${proposal.risks.length > 0 ? `\n<b>Risks:</b> ${proposal.risks.join(", ")}` : ""}
${proposal.warnings.length > 0 ? `\n<b>Warnings:</b> ${proposal.warnings.join(", ")}` : ""}

<i>Expires in ${expiresIn} minutes</i>`

  const keyboard: TelegramInlineKeyboard = {
    inline_keyboard: [[
      { text: "Approve", callback_data: `approve:${proposal.id}` },
      { text: "Reject", callback_data: `reject:${proposal.id}` },
    ]],
  }

  return { text, keyboard }
}

export function buildTradeExecutedMessage(params: {
  symbol: string
  action: "buy" | "sell"
  filledQty: number
  filledAvgPrice: number
  orderId: string
}): string {
  const emoji = params.action === "buy" ? "BUY" : "SELL"
  const totalValue = (params.filledQty * params.filledAvgPrice).toFixed(2)

  return `<b>Trade Executed — ${emoji}</b>

<b>Symbol:</b> ${params.symbol}
<b>Qty:</b> ${params.filledQty}
<b>Fill Price:</b> $${params.filledAvgPrice.toFixed(2)}
<b>Total Value:</b> $${totalValue}
<b>Order ID:</b> <code>${params.orderId}</code>`
}

export function buildTradeRejectedMessage(params: {
  symbol: string
  action: "buy" | "sell"
  reason: string
}): string {
  return `<b>Trade Rejected</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Reason:</b> ${params.reason}`
}

export function buildTradeFailedMessage(params: {
  symbol: string
  action: "buy" | "sell"
  error: string
}): string {
  return `<b>Trade Failed</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Error:</b> ${params.error}`
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
  const pnlSign = params.pnlUsd >= 0 ? "+" : ""
  const winRate = params.totalTrades > 0
    ? ((params.wins / params.totalTrades) * 100).toFixed(0)
    : "0"

  return `<b>Daily Summary — ${params.date}</b>

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
    ? "Daily Loss Limit Reached"
    : "Kill Switch Activated"

  let text = `<b>${title}</b>

<b>Reason:</b> ${params.reason}`

  if (params.details) {
    text += `\n<b>Details:</b> ${params.details}`
  }

  text += "\n\n<i>Trading has been paused.</i>"
  return text
}

export function buildProposalUpdatedMessage(
  proposal: TradeProposal,
  status: "approved" | "rejected" | "expired"
): string {
  const statusText = status.charAt(0).toUpperCase() + status.slice(1)

  return `<b>Trade ${statusText}</b>

<b>Symbol:</b> ${proposal.symbol}
<b>Action:</b> ${proposal.action.toUpperCase()}
<b>Qty:</b> ${proposal.qty ?? "N/A"}
<b>Est. Price:</b> ${proposal.entryPrice ? `$${proposal.entryPrice.toFixed(2)}` : "market"}`
}
```

---

## Notification Dispatcher

Central dispatch function that checks user preferences + quiet hours before sending.

```ts
// packages/data-ops/src/services/notification-dispatcher.ts

import { TelegramService } from "./telegram-service"
import { getNotificationSettings } from "../queries/notification-settings"
import { getCredential } from "../credential/queries"
import type { Database } from "../database/setup"
import type { NotificationType, TelegramInlineKeyboard } from "../telegram/types"
import type { TelegramCredential } from "../credential/schema"

interface DispatcherConfig {
  db: Database
  userId: string
  masterKey: string
}

export async function dispatchNotification(
  config: DispatcherConfig,
  type: NotificationType,
  message: string,
  keyboard?: TelegramInlineKeyboard
): Promise<{ sent: boolean; messageId?: number; reason?: string }> {
  // Load preferences
  const settings = await getNotificationSettings(config.db, config.userId)

  if (settings) {
    const enabledMap: Record<NotificationType, boolean> = {
      trade_proposal: settings.enableTradeProposals,
      trade_executed: settings.enableTradeResults,
      trade_rejected: settings.enableTradeResults,
      trade_failed: settings.enableTradeResults,
      daily_summary: settings.enableDailySummary,
      risk_alert: settings.enableRiskAlerts,
    }

    if (!enabledMap[type]) {
      return { sent: false, reason: "disabled" }
    }

    // Skip quiet hours for proposals and risk alerts
    if (type !== "risk_alert" && type !== "trade_proposal") {
      if (isQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
        return { sent: false, reason: "quiet_hours" }
      }
    }
  }

  // Load Telegram credential
  const cred = await getCredential<TelegramCredential>(
    config.db, config.userId, "telegram", config.masterKey
  )
  if (!cred || !cred.chatId) {
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
  const currentMins = now.getHours() * 60 + now.getMinutes()

  const [startH, startM] = start.split(":").map(Number)
  const [endH, endM] = end.split(":").map(Number)
  const startMins = startH * 60 + startM
  const endMins = endH * 60 + endM

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins < endMins
  }
  // Spans midnight
  return currentMins >= startMins || currentMins < endMins
}
```

---

## SessionAgent Integration

Add notification dispatch hooks to SessionAgent at key lifecycle points. These are additions to `apps/data-service/src/agents/session-agent.ts`.

### Hook 1: After proposal creation

In `storeProposal()` or after `createProposal()`, dispatch the trade proposal notification:

```ts
// After storing proposal in DO SQLite trade_proposals table:

const { text, keyboard } = buildProposalMessage(proposal)
const result = await dispatchNotification(
  { db: this.pgDb, userId: this.userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
  "trade_proposal",
  text,
  keyboard
)

if (result.sent && result.messageId) {
  // Optionally store for later message editing
  this.sql`UPDATE trade_proposals SET telegram_message_id = ${result.messageId} WHERE id = ${proposal.id}`
}
```

### Hook 2: After successful execution

In `executeApprovedProposal()`, after broker confirms order:

```ts
await dispatchNotification(
  { db: this.pgDb, userId: this.userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
  "trade_executed",
  buildTradeExecutedMessage({
    symbol: proposal.symbol,
    action: proposal.action,
    filledQty: orderResult.filledQty,
    filledAvgPrice: orderResult.filledAvgPrice,
    orderId: orderResult.orderId,
  })
)
```

### Hook 3: After execution failure

When broker throws or execution guard rejects:

```ts
await dispatchNotification(
  { db: this.pgDb, userId: this.userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
  "trade_failed",
  buildTradeFailedMessage({
    symbol: proposal.symbol,
    action: proposal.action,
    error: guardViolation ?? brokerError.message,
  })
)
```

### Hook 4: On risk alert

When `isDailyLossBreached()` returns true or session is force-stopped:

```ts
await dispatchNotification(
  { db: this.pgDb, userId: this.userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
  "risk_alert",
  buildRiskAlertMessage({
    type: "daily_loss_limit",
    reason: "Daily loss limit exceeded",
    details: `Loss: ${currentLoss.toFixed(2)}% (limit: ${config.maxDailyLossPct}%)`,
  })
)
```

### Hook 5: After proposal expiration

In `expireProposals()`, after marking proposals expired:

```ts
for (const expired of expiredProposals) {
  await dispatchNotification(
    { db: this.pgDb, userId: this.userId, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY },
    "trade_rejected",
    buildProposalUpdatedMessage(expired, "expired")
  )
}
```

### PG database access

SessionAgent needs access to the Postgres database for `getNotificationSettings()` and `getCredential()`. This is already available via `this.env.DATABASE_URL` (Neon Postgres) — create a lightweight DB connection in the notification path, or pass via the existing `createDatabase()` utility.

---
