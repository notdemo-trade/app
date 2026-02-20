# Phase 16: Notifications — Part 3: Business Logic
> Split from `016-phase-16-notifications.md`. See other parts in this directory.

## Database Queries

```ts
// packages/data-ops/src/db/queries/notifications.ts

import { eq, desc, and, gte } from "drizzle-orm"
import { notificationConfig, notificationLog } from "../schema/notifications"
import type { DrizzleClient } from "../client"
import type { NotificationConfig, NotificationLog, NotificationEventType, NotificationPayload } from "../../types/notifications"
import { generateId } from "../../lib/utils"

export async function getNotificationConfig(
  db: DrizzleClient,
  userId: string
): Promise<NotificationConfig | null> {
  const row = await db.query.notificationConfig.findFirst({
    where: eq(notificationConfig.userId, userId),
  })

  return row ? mapConfigRow(row) : null
}

// upsertNotificationConfig defined in Phase 11 queries/telegram-approvals.ts
// Uses notification_settings table for Telegram preferences

export async function logNotification(
  db: DrizzleClient,
  params: {
    userId: string
    channel: "telegram"
    eventType: NotificationEventType
    payload: NotificationPayload
    status: "sent" | "failed" | "cooldown"
    errorMessage?: string
  }
): Promise<string> {
  const id = generateId()

  await db.insert(notificationLog).values({
    id,
    userId: params.userId,
    channel: params.channel,
    eventType: params.eventType,
    payloadJson: params.payload,
    status: params.status,
    errorMessage: params.errorMessage ?? null,
    sentAt: new Date(),
  })

  return id
}

export async function getNotificationHistory(
  db: DrizzleClient,
  userId: string,
  limit: number = 50
): Promise<NotificationLog[]> {
  const rows = await db.query.notificationLog.findMany({
    where: eq(notificationLog.userId, userId),
    orderBy: desc(notificationLog.sentAt),
    limit,
  })

  return rows.map(mapLogRow)
}

export async function getLastNotification(
  db: DrizzleClient,
  userId: string,
  eventType: NotificationEventType,
  symbol?: string
): Promise<NotificationLog | null> {
  const rows = await db.query.notificationLog.findMany({
    where: and(
      eq(notificationLog.userId, userId),
      eq(notificationLog.eventType, eventType),
      eq(notificationLog.status, "sent")
    ),
    orderBy: desc(notificationLog.sentAt),
    limit: 1,
  })

  const row = rows[0]
  if (!row) return null

  // Check symbol if provided
  if (symbol) {
    const log = mapLogRow(row)
    if (log.payload.symbol !== symbol) return null
  }

  return mapLogRow(row)
}

// mapConfigRow not needed - uses Phase 11 notification_settings directly

function mapLogRow(row: NotificationLogRow): NotificationLog {
  return {
    id: row.id,
    userId: row.userId,
    channel: "telegram",
    eventType: row.eventType,
    payload: row.payloadJson,
    status: row.status,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt.toISOString(),
  }
}
```

---


## Notification Service

```ts
// packages/data-ops/src/services/notification-service.ts
// Core notification service defined in Phase 11 (notification-dispatcher.ts, telegram-service.ts)
// This extends with additional payload builders for Phase 12 notification types

// Payload builders for common events
export function buildTradeExecutedPayload(params: {
  symbol: string
  side: "buy" | "sell"
  qty: number
  price: number
  orderType: string
}): NotificationPayload {
  const emoji = params.side === "buy" ? "📈" : "📉"
  return {
    eventType: "trade_executed",
    title: `${emoji} Trade Executed: ${params.symbol}`,
    description: `${params.side.toUpperCase()} order filled`,
    color: params.side === "buy" ? "success" : "info",
    fields: [
      { name: "Side", value: params.side.toUpperCase(), inline: true },
      { name: "Quantity", value: String(params.qty), inline: true },
      { name: "Price", value: `$${params.price.toFixed(2)}`, inline: true },
      { name: "Type", value: params.orderType, inline: true },
    ],
    symbol: params.symbol,
    timestamp: new Date().toISOString(),
  }
}

export function buildStopLossPayload(params: {
  symbol: string
  qty: number
  triggerPrice: number
  pnlUsd: number
}): NotificationPayload {
  return {
    eventType: "stop_loss_triggered",
    title: `🛑 Stop Loss: ${params.symbol}`,
    description: "Stop loss order triggered",
    color: "error",
    fields: [
      { name: "Quantity", value: String(params.qty), inline: true },
      { name: "Trigger", value: `$${params.triggerPrice.toFixed(2)}`, inline: true },
      { name: "P&L", value: `$${params.pnlUsd.toFixed(2)}`, inline: true },
    ],
    symbol: params.symbol,
    timestamp: new Date().toISOString(),
  }
}

export function buildKillSwitchPayload(params: {
  reason: string
}): NotificationPayload {
  return {
    eventType: "kill_switch_activated",
    title: "⚠️ Kill Switch Activated",
    description: "All trading halted",
    color: "error",
    fields: [
      { name: "Reason", value: params.reason },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildDailyLossPayload(params: {
  lossUsd: number
  limitUsd: number
}): NotificationPayload {
  return {
    eventType: "daily_loss_limit_hit",
    title: "⛔ Daily Loss Limit Reached",
    description: "Trading paused for the day",
    color: "error",
    fields: [
      { name: "Loss", value: `$${params.lossUsd.toFixed(2)}`, inline: true },
      { name: "Limit", value: `$${params.limitUsd.toFixed(2)}`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildAgentErrorPayload(params: {
  error: string
  context?: string
}): NotificationPayload {
  return {
    eventType: "agent_error",
    title: "❌ Agent Error",
    description: params.error.substring(0, 200),
    color: "error",
    fields: params.context
      ? [{ name: "Context", value: params.context }]
      : [],
    timestamp: new Date().toISOString(),
  }
}

export function buildDailySummaryPayload(params: {
  trades: number
  wins: number
  losses: number
  pnlUsd: number
  equity: number
}): NotificationPayload {
  const winRate = params.trades > 0 ? (params.wins / params.trades) * 100 : 0
  return {
    eventType: "daily_summary",
    title: "📊 Daily Summary",
    description: `${params.trades} trades today`,
    color: params.pnlUsd >= 0 ? "success" : "warning",
    fields: [
      { name: "P&L", value: `$${params.pnlUsd.toFixed(2)}`, inline: true },
      { name: "Win Rate", value: `${winRate.toFixed(0)}%`, inline: true },
      { name: "W/L", value: `${params.wins}/${params.losses}`, inline: true },
      { name: "Equity", value: `$${params.equity.toFixed(2)}`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}
```

---


## Agent Integration

Call notification service from trading agent.

```ts
// Integration in TradingAgent (Agents SDK, see Phase 12)

import {
  sendNotification,
  buildTradeExecutedPayload,
  buildStopLossPayload,
  buildKillSwitchPayload,
  buildAgentErrorPayload,
} from "@repo/data-ops/services/notification-service"

// After order fill
await sendNotification(
  { db, userId },
  buildTradeExecutedPayload({
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    price: order.filled_avg_price,
    orderType: order.type,
  })
)

// On stop loss trigger
await sendNotification(
  { db, userId },
  buildStopLossPayload({
    symbol: position.symbol,
    qty: position.qty,
    triggerPrice: stopPrice,
    pnlUsd: pnl,
  })
)

// On kill switch
await sendNotification(
  { db, userId },
  buildKillSwitchPayload({ reason })
)

// On agent error
await sendNotification(
  { db, userId },
  buildAgentErrorPayload({
    error: err.message,
    context: "signal_processing",
  })
)
```

---

