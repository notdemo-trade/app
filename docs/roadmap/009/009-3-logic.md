# Phase 9: Risk Management — Part 3: Business Logic
> Split from `009-phase-9-risk-management.md`. See other parts in this directory.

## Policy Engine

```ts
// packages/data-ops/src/policy/engine.ts

import type {
  PolicyConfig,
  PolicyResult,
  PolicyViolation,
  PolicyWarning,
  RiskState,
} from "./types"
import type { Account, Position, MarketClock, OrderPreview } from "../providers/alpaca/types"

export interface PolicyContext {
  order: OrderPreview
  account: Account
  positions: Position[]
  clock: MarketClock
  riskState: RiskState
}

export class PolicyEngine {
  constructor(private config: PolicyConfig) {}

  evaluate(ctx: PolicyContext): PolicyResult {
    const violations: PolicyViolation[] = []
    const warnings: PolicyWarning[] = []

    // Critical checks first
    this.checkKillSwitch(ctx, violations)
    this.checkCooldown(ctx, violations)
    this.checkDailyLossLimit(ctx, violations)

    // Trading environment checks
    this.checkTradingHours(ctx, violations, warnings)

    // Symbol checks
    this.checkSymbolFilters(ctx, violations)

    // Order validation
    this.checkOrderType(ctx, violations)
    this.checkNotionalLimit(ctx, violations)

    // Position checks
    this.checkPositionSize(ctx, violations, warnings)
    this.checkOpenPositionsLimit(ctx, violations)
    this.checkShortSelling(ctx, violations)

    // Buying power
    this.checkBuyingPower(ctx, violations)

    return {
      allowed: violations.length === 0,
      violations,
      warnings,
    }
  }

  private checkKillSwitch(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (ctx.riskState.killSwitchActive) {
      violations.push({
        rule: "kill_switch",
        message: `Trading halted: ${ctx.riskState.killSwitchReason ?? "Kill switch activated"}`,
        currentValue: true,
        limitValue: false,
      })
    }
  }

  private checkCooldown(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (!ctx.riskState.cooldownUntil) return

    const cooldownEnd = new Date(ctx.riskState.cooldownUntil)
    const now = new Date()

    if (now < cooldownEnd) {
      violations.push({
        rule: "loss_cooldown",
        message: `In cooldown period until ${ctx.riskState.cooldownUntil}`,
        currentValue: now.toISOString(),
        limitValue: ctx.riskState.cooldownUntil,
      })
    }
  }

  private checkDailyLossLimit(ctx: PolicyContext, violations: PolicyViolation[]): void {
    const dailyLossPct = ctx.riskState.dailyLossUsd / ctx.account.equity

    if (dailyLossPct >= this.config.maxDailyLossPct) {
      violations.push({
        rule: "daily_loss_limit",
        message: `Daily loss limit reached: ${(dailyLossPct * 100).toFixed(2)}% of equity`,
        currentValue: dailyLossPct,
        limitValue: this.config.maxDailyLossPct,
      })
    }
  }

  private checkTradingHours(
    ctx: PolicyContext,
    violations: PolicyViolation[],
    warnings: PolicyWarning[]
  ): void {
    if (!this.config.tradingHoursOnly) return
    if (ctx.order.asset_class === "crypto") return // 24/7

    if (!ctx.clock.is_open) {
      if (!this.config.extendedHoursAllowed) {
        violations.push({
          rule: "trading_hours",
          message: "Trading outside market hours not allowed",
          currentValue: ctx.clock.is_open,
          limitValue: true,
        })
      } else {
        warnings.push({
          rule: "extended_hours",
          message: "Order will be placed during extended hours",
        })
      }
    }
  }

  private checkSymbolFilters(ctx: PolicyContext, violations: PolicyViolation[]): void {
    const symbol = ctx.order.symbol.toUpperCase()

    if (this.config.denySymbols.map((s) => s.toUpperCase()).includes(symbol)) {
      violations.push({
        rule: "symbol_denied",
        message: `Symbol ${symbol} is on the deny list`,
        currentValue: symbol,
        limitValue: "not in deny list",
      })
      return
    }

    if (this.config.allowedSymbols !== null) {
      const allowed = this.config.allowedSymbols.map((s) => s.toUpperCase())
      if (!allowed.includes(symbol)) {
        violations.push({
          rule: "symbol_not_allowed",
          message: `Symbol ${symbol} is not on the allow list`,
          currentValue: symbol,
          limitValue: "in allow list",
        })
      }
    }
  }

  private checkOrderType(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (!this.config.allowedOrderTypes.includes(ctx.order.order_type)) {
      violations.push({
        rule: "order_type_not_allowed",
        message: `Order type '${ctx.order.order_type}' is not allowed`,
        currentValue: ctx.order.order_type,
        limitValue: this.config.allowedOrderTypes,
      })
    }
  }

  private checkNotionalLimit(ctx: PolicyContext, violations: PolicyViolation[]): void {
    const notional = this.estimateNotional(ctx.order)

    if (notional > this.config.maxNotionalPerTrade) {
      violations.push({
        rule: "max_notional",
        message: `Order notional $${notional.toFixed(2)} exceeds limit of $${this.config.maxNotionalPerTrade}`,
        currentValue: notional,
        limitValue: this.config.maxNotionalPerTrade,
      })
    }
  }

  private checkPositionSize(
    ctx: PolicyContext,
    violations: PolicyViolation[],
    warnings: PolicyWarning[]
  ): void {
    if (ctx.order.side !== "buy") return

    const notional = this.estimateNotional(ctx.order)
    const existing = ctx.positions.find(
      (p) => p.symbol.toUpperCase() === ctx.order.symbol.toUpperCase()
    )
    const existingValue = existing?.market_value ?? 0
    const totalValue = notional + existingValue
    const positionPct = totalValue / ctx.account.equity

    if (positionPct > this.config.maxPositionPctEquity) {
      violations.push({
        rule: "max_position_pct",
        message: `Position would be ${(positionPct * 100).toFixed(2)}% of equity (limit: ${(this.config.maxPositionPctEquity * 100).toFixed(0)}%)`,
        currentValue: positionPct,
        limitValue: this.config.maxPositionPctEquity,
      })
    } else if (positionPct > this.config.maxPositionPctEquity * 0.8) {
      warnings.push({
        rule: "position_size_warning",
        message: `Position will be ${(positionPct * 100).toFixed(2)}% of equity, approaching limit`,
      })
    }
  }

  private checkOpenPositionsLimit(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (ctx.order.side !== "buy") return

    const existing = ctx.positions.find(
      (p) => p.symbol.toUpperCase() === ctx.order.symbol.toUpperCase()
    )
    const isNew = !existing
    const count = ctx.positions.length

    if (isNew && count >= this.config.maxOpenPositions) {
      violations.push({
        rule: "max_open_positions",
        message: `Already at max ${this.config.maxOpenPositions} open positions`,
        currentValue: count,
        limitValue: this.config.maxOpenPositions,
      })
    }
  }

  private checkShortSelling(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (ctx.order.side !== "sell") return
    if (this.config.allowShortSelling) return

    const existing = ctx.positions.find(
      (p) => p.symbol.toUpperCase() === ctx.order.symbol.toUpperCase()
    )

    if (!existing) {
      violations.push({
        rule: "short_selling_blocked",
        message: `Short selling disabled. You don't own ${ctx.order.symbol}.`,
        currentValue: 0,
        limitValue: "must own position to sell",
      })
      return
    }

    const sellQty =
      ctx.order.qty ?? (ctx.order.notional ? ctx.order.notional / (ctx.order.estimated_price || 1) : 0)
    if (sellQty > existing.qty) {
      violations.push({
        rule: "short_selling_blocked",
        message: `Cannot sell ${sellQty} shares - you only own ${existing.qty}. Short selling disabled.`,
        currentValue: sellQty,
        limitValue: existing.qty,
      })
    }
  }

  private checkBuyingPower(ctx: PolicyContext, violations: PolicyViolation[]): void {
    if (ctx.order.side !== "buy") return

    const notional = this.estimateNotional(ctx.order)
    const available = this.config.useCashOnly ? ctx.account.cash : ctx.account.buying_power
    const fundType = this.config.useCashOnly ? "cash" : "buying power"

    if (notional > available) {
      violations.push({
        rule: "insufficient_funds",
        message: `Insufficient ${fundType}: need $${notional.toFixed(2)}, have $${available.toFixed(2)}`,
        currentValue: available,
        limitValue: notional,
      })
    }
  }

  private estimateNotional(order: OrderPreview): number {
    if (order.notional) return order.notional
    const price = order.estimated_price ?? order.limit_price ?? order.stop_price ?? 0
    return (order.qty ?? 0) * price
  }
}
```

---


## Default Policy Config

```ts
// packages/data-ops/src/policy/defaults.ts

import type { PolicyConfig, OptionsPolicyConfig } from "./types"

export function getDefaultOptionsPolicyConfig(): OptionsPolicyConfig {
  return {
    optionsEnabled: false,
    maxPctPerOptionTrade: 0.02,       // 2%
    maxTotalOptionsExposurePct: 0.1,  // 10%
    minDte: 30,
    maxDte: 60,
    minDelta: 0.3,
    maxDelta: 0.7,
    allowedStrategies: ["long_call", "long_put"],
    noAveragingDown: true,
    maxOptionPositions: 3,
  }
}

export function getDefaultPolicyConfig(): PolicyConfig {
  return {
    maxPositionPctEquity: 0.1,         // 10%
    maxOpenPositions: 10,
    maxNotionalPerTrade: 5000,
    maxDailyLossPct: 0.02,             // 2%
    cooldownMinutesAfterLoss: 30,
    allowedOrderTypes: ["market", "limit", "stop", "stop_limit"],
    tradingHoursOnly: true,
    extendedHoursAllowed: false,
    allowShortSelling: false,
    allowedSymbols: null,              // All allowed
    denySymbols: [],
    useCashOnly: true,
    options: getDefaultOptionsPolicyConfig(),
  }
}
```

---


## Risk State Queries

```ts
// packages/data-ops/src/db/queries/risk-state.ts

import { eq } from "drizzle-orm"
import type { DbClient } from "../client"
import { riskStates } from "../schema/risk"
import type { RiskState } from "../../policy/types"

export async function getRiskState(db: DbClient, userId: string): Promise<RiskState> {
  const [row] = await db
    .select()
    .from(riskStates)
    .where(eq(riskStates.userId, userId))
    .limit(1)

  if (!row) {
    // Initialize default state
    const now = new Date().toISOString()
    return {
      killSwitchActive: false,
      killSwitchReason: null,
      killSwitchAt: null,
      dailyLossUsd: 0,
      dailyLossResetAt: now,
      lastLossAt: null,
      cooldownUntil: null,
      updatedAt: now,
    }
  }

  return {
    killSwitchActive: row.killSwitchActive,
    killSwitchReason: row.killSwitchReason,
    killSwitchAt: row.killSwitchAt?.toISOString() ?? null,
    dailyLossUsd: row.dailyLossUsd,
    dailyLossResetAt: row.dailyLossResetAt?.toISOString() ?? null,
    lastLossAt: row.lastLossAt?.toISOString() ?? null,
    cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function enableKillSwitch(
  db: DbClient,
  userId: string,
  reason: string
): Promise<void> {
  const now = new Date()

  await db
    .insert(riskStates)
    .values({
      userId,
      killSwitchActive: true,
      killSwitchReason: reason,
      killSwitchAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: riskStates.userId,
      set: {
        killSwitchActive: true,
        killSwitchReason: reason,
        killSwitchAt: now,
        updatedAt: now,
      },
    })
}

export async function disableKillSwitch(db: DbClient, userId: string): Promise<void> {
  await db
    .update(riskStates)
    .set({
      killSwitchActive: false,
      killSwitchReason: null,
      killSwitchAt: null,
      updatedAt: new Date(),
    })
    .where(eq(riskStates.userId, userId))
}

export async function recordDailyLoss(
  db: DbClient,
  userId: string,
  lossUsd: number
): Promise<void> {
  const now = new Date()

  // Get current state
  const state = await getRiskState(db, userId)

  await db
    .insert(riskStates)
    .values({
      userId,
      dailyLossUsd: lossUsd,
      lastLossAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: riskStates.userId,
      set: {
        dailyLossUsd: state.dailyLossUsd + lossUsd,
        lastLossAt: now,
        updatedAt: now,
      },
    })
}

export async function setCooldown(
  db: DbClient,
  userId: string,
  cooldownMinutes: number
): Promise<void> {
  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000)

  await db
    .update(riskStates)
    .set({
      cooldownUntil,
      updatedAt: new Date(),
    })
    .where(eq(riskStates.userId, userId))
}

export async function resetDailyLoss(db: DbClient, userId: string): Promise<void> {
  await db
    .update(riskStates)
    .set({
      dailyLossUsd: 0,
      dailyLossResetAt: new Date(),
      cooldownUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(riskStates.userId, userId))
}
```

---


## Policy Config Queries

```ts
// packages/data-ops/src/db/queries/policy-config.ts

import { eq } from "drizzle-orm"
import type { DbClient } from "../client"
import { policyConfigs } from "../schema/risk"
import type { PolicyConfig } from "../../policy/types"
import { getDefaultPolicyConfig } from "../../policy/defaults"

export async function getPolicyConfig(db: DbClient, userId: string): Promise<PolicyConfig> {
  const [row] = await db
    .select()
    .from(policyConfigs)
    .where(eq(policyConfigs.userId, userId))
    .limit(1)

  if (!row) {
    return getDefaultPolicyConfig()
  }

  return {
    maxPositionPctEquity: row.maxPositionPctEquity,
    maxOpenPositions: row.maxOpenPositions,
    maxNotionalPerTrade: row.maxNotionalPerTrade,
    maxDailyLossPct: row.maxDailyLossPct,
    cooldownMinutesAfterLoss: row.cooldownMinutesAfterLoss,
    allowedOrderTypes: row.allowedOrderTypes,
    tradingHoursOnly: row.tradingHoursOnly,
    extendedHoursAllowed: row.extendedHoursAllowed,
    allowShortSelling: row.allowShortSelling,
    allowedSymbols: row.allowedSymbols ?? null,
    denySymbols: row.denySymbols,
    useCashOnly: row.useCashOnly,
    options: row.optionsConfig ?? getDefaultPolicyConfig().options,
  }
}

export async function updatePolicyConfig(
  db: DbClient,
  userId: string,
  config: Partial<PolicyConfig>
): Promise<void> {
  await db
    .insert(policyConfigs)
    .values({
      userId,
      ...config,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: policyConfigs.userId,
      set: {
        ...config,
        updatedAt: new Date(),
      },
    })
}
```

---


## Cron: Daily Loss Reset

```ts
// apps/data-service/src/cron/reset-daily-loss.ts

import type { DbClient } from "@repo/data-ops/db/client"
import { resetDailyLoss } from "@repo/data-ops/db/queries/risk-state"
import { getAllUserIds } from "@repo/data-ops/db/queries/users"

export async function resetAllDailyLoss(db: DbClient): Promise<void> {
  const userIds = await getAllUserIds(db)

  for (const userId of userIds) {
    await resetDailyLoss(db, userId)
  }

  console.log(`Reset daily loss for ${userIds.length} users`)
}

// In wrangler.toml:
// [triggers]
// crons = ["0 9 * * 1-5"]  # 9 AM UTC on weekdays (market open)
```

---

