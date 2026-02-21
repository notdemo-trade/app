# Phase 8: Order Execution — Part 3: Business Logic
> Split from `008-phase-8-order-execution.md`. See other parts in this directory.

## Alpaca Trading Client

```ts
// packages/data-ops/src/providers/alpaca/trading.ts

import type {
  Account,
  Order,
  OrderParams,
  Position,
  MarketClock,
  AssetClass,
} from "./types"

const TRADING_BASE_URL = "https://api.alpaca.markets"
const PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets"

export interface AlpacaTradingConfig {
  apiKey: string
  apiSecret: string
  paper: boolean
}

export class AlpacaTradingClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(config: AlpacaTradingConfig) {
    this.baseUrl = config.paper ? PAPER_TRADING_BASE_URL : TRADING_BASE_URL
    this.headers = {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
      "Content-Type": "application/json",
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new AlpacaError(response.status, text)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  }

  // Account
  async getAccount(): Promise<Account> {
    const raw = await this.request<RawAccount>("GET", "/v2/account")
    return parseAccount(raw)
  }

  // Positions
  async getPositions(): Promise<Position[]> {
    const raw = await this.request<RawPosition[]>("GET", "/v2/positions")
    return raw.map(parsePosition)
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const raw = await this.request<RawPosition>("GET", `/v2/positions/${encodeURIComponent(symbol)}`)
      return parsePosition(raw)
    } catch (err) {
      if (err instanceof AlpacaError && err.statusCode === 404) {
        return null
      }
      throw err
    }
  }

  async closePosition(symbol: string, qty?: number, percentage?: number): Promise<Order> {
    const params = new URLSearchParams()
    if (qty !== undefined) params.set("qty", String(qty))
    else if (percentage !== undefined) params.set("percentage", String(percentage))

    const query = params.toString()
    const path = `/v2/positions/${encodeURIComponent(symbol)}${query ? `?${query}` : ""}`
    return this.request<Order>("DELETE", path)
  }

  // Orders
  async createOrder(params: OrderParams): Promise<Order> {
    const body: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      time_in_force: params.time_in_force,
    }

    if (params.qty !== undefined) body.qty = String(params.qty)
    if (params.notional !== undefined) body.notional = String(params.notional)
    if (params.limit_price !== undefined) body.limit_price = String(params.limit_price)
    if (params.stop_price !== undefined) body.stop_price = String(params.stop_price)
    if (params.extended_hours !== undefined) body.extended_hours = params.extended_hours
    if (params.client_order_id !== undefined) body.client_order_id = params.client_order_id

    return this.request<Order>("POST", "/v2/orders", body)
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.request<Order>("GET", `/v2/orders/${encodeURIComponent(orderId)}`)
  }

  async listOrders(params?: {
    status?: "open" | "closed" | "all"
    limit?: number
    symbols?: string[]
  }): Promise<Order[]> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set("status", params.status)
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.symbols?.length) searchParams.set("symbols", params.symbols.join(","))

    const query = searchParams.toString()
    return this.request<Order[]>("GET", `/v2/orders${query ? `?${query}` : ""}`)
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request<void>("DELETE", `/v2/orders/${encodeURIComponent(orderId)}`)
  }

  async cancelAllOrders(): Promise<void> {
    await this.request<void>("DELETE", "/v2/orders")
  }

  // Market
  async getClock(): Promise<MarketClock> {
    return this.request<MarketClock>("GET", "/v2/clock")
  }

  async getAsset(symbol: string): Promise<{ class: AssetClass; tradable: boolean } | null> {
    try {
      return this.request<{ class: AssetClass; tradable: boolean }>(
        "GET",
        `/v2/assets/${encodeURIComponent(symbol)}`
      )
    } catch (err) {
      if (err instanceof AlpacaError && err.statusCode === 404) {
        return null
      }
      throw err
    }
  }
}

export class AlpacaError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`Alpaca API error (${statusCode}): ${body}`)
    this.name = "AlpacaError"
  }
}

// Raw types (string numbers from API)
interface RawAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: string
  buying_power: string
  equity: string
  portfolio_value: string
  pattern_day_trader: boolean
  trading_blocked: boolean
  daytrade_count: number
}

interface RawPosition {
  asset_id: string
  symbol: string
  exchange: string
  asset_class: string
  avg_entry_price: string
  qty: string
  side: string
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  current_price: string
}

function parseAccount(raw: RawAccount): Account {
  return {
    id: raw.id,
    account_number: raw.account_number,
    status: raw.status,
    currency: raw.currency,
    cash: parseFloat(raw.cash),
    buying_power: parseFloat(raw.buying_power),
    equity: parseFloat(raw.equity),
    portfolio_value: parseFloat(raw.portfolio_value),
    pattern_day_trader: raw.pattern_day_trader,
    trading_blocked: raw.trading_blocked,
    daytrade_count: raw.daytrade_count,
  }
}

function parsePosition(raw: RawPosition): Position {
  return {
    asset_id: raw.asset_id,
    symbol: raw.symbol,
    exchange: raw.exchange,
    asset_class: raw.asset_class,
    avg_entry_price: parseFloat(raw.avg_entry_price),
    qty: parseFloat(raw.qty),
    side: raw.side as "long" | "short",
    market_value: parseFloat(raw.market_value),
    cost_basis: parseFloat(raw.cost_basis),
    unrealized_pl: parseFloat(raw.unrealized_pl),
    unrealized_plpc: parseFloat(raw.unrealized_plpc),
    current_price: parseFloat(raw.current_price),
  }
}

export function createAlpacaTradingClient(config: AlpacaTradingConfig): AlpacaTradingClient {
  return new AlpacaTradingClient(config)
}
```

---


## Options Client

```ts
// packages/data-ops/src/providers/alpaca/options.ts

import type { OptionContract, OptionSnapshot, OptionsChain } from "./types"

const OPTIONS_DATA_URL = "https://data.alpaca.markets"
const TRADING_BASE_URL = "https://api.alpaca.markets"
const PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets"

export interface AlpacaOptionsConfig {
  apiKey: string
  apiSecret: string
  paper: boolean
}

export class AlpacaOptionsClient {
  private tradingUrl: string
  private dataUrl = OPTIONS_DATA_URL
  private headers: Record<string, string>

  constructor(config: AlpacaOptionsConfig) {
    this.tradingUrl = config.paper ? PAPER_TRADING_BASE_URL : TRADING_BASE_URL
    this.headers = {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
      "Content-Type": "application/json",
    }
  }

  async getExpirations(underlying: string): Promise<string[]> {
    const contracts = await this.getContracts({ underlying, limit: 1000 })
    const expirations = new Set<string>()
    for (const c of contracts) {
      expirations.add(c.expiration)
    }
    return Array.from(expirations).sort()
  }

  async getChain(underlying: string, expiration: string): Promise<OptionsChain> {
    const contracts = await this.getContracts({
      underlying,
      expiration,
      limit: 500,
    })

    const calls = contracts.filter(c => c.type === "call").sort((a, b) => a.strike - b.strike)
    const puts = contracts.filter(c => c.type === "put").sort((a, b) => a.strike - b.strike)

    return { symbol: underlying.toUpperCase(), expiration, calls, puts }
  }

  async getSnapshot(contractSymbol: string): Promise<OptionSnapshot> {
    const snapshots = await this.getSnapshots([contractSymbol])
    return (
      snapshots[contractSymbol] ?? {
        symbol: contractSymbol,
        latest_quote: { bid_price: 0, bid_size: 0, ask_price: 0, ask_size: 0 },
      }
    )
  }

  async getSnapshots(symbols: string[]): Promise<Record<string, OptionSnapshot>> {
    if (symbols.length === 0) return {}

    const url = `${this.dataUrl}/v1beta1/options/snapshots?symbols=${encodeURIComponent(symbols.join(","))}`
    const response = await fetch(url, { headers: this.headers })

    if (!response.ok) {
      throw new Error(`Options snapshot error: ${response.status}`)
    }

    const data = (await response.json()) as { snapshots: Record<string, RawOptionSnapshot> }
    const result: Record<string, OptionSnapshot> = {}

    for (const [sym, snap] of Object.entries(data.snapshots ?? {})) {
      result[sym] = {
        symbol: sym,
        latest_quote: {
          bid_price: snap.latest_quote?.bid_price ?? 0,
          bid_size: snap.latest_quote?.bid_size ?? 0,
          ask_price: snap.latest_quote?.ask_price ?? 0,
          ask_size: snap.latest_quote?.ask_size ?? 0,
        },
        greeks: snap.greeks,
        implied_volatility: snap.implied_volatility,
      }
    }

    return result
  }

  async getContracts(params: {
    underlying: string
    expiration?: string
    type?: "call" | "put"
    minStrike?: number
    maxStrike?: number
    limit?: number
  }): Promise<OptionContract[]> {
    const searchParams = new URLSearchParams()
    searchParams.set("underlying_symbols", params.underlying.toUpperCase())
    searchParams.set("status", "active")

    if (params.expiration) searchParams.set("expiration_date", params.expiration)
    if (params.type) searchParams.set("type", params.type)
    if (params.minStrike !== undefined) searchParams.set("strike_price_gte", String(params.minStrike))
    if (params.maxStrike !== undefined) searchParams.set("strike_price_lte", String(params.maxStrike))
    if (params.limit) searchParams.set("limit", String(params.limit))

    const url = `${this.tradingUrl}/v2/options/contracts?${searchParams}`
    const response = await fetch(url, { headers: this.headers })

    if (!response.ok) {
      throw new Error(`Options contracts error: ${response.status}`)
    }

    const data = (await response.json()) as { option_contracts: RawOptionContract[] }

    return (data.option_contracts ?? []).map(c => ({
      symbol: c.symbol,
      underlying: c.underlying_symbol,
      expiration: c.expiration_date,
      strike: parseFloat(c.strike_price),
      type: c.type,
      open_interest: parseInt(c.open_interest, 10) || 0,
      volume: 0,
    }))
  }

  async findContractsByDelta(
    underlying: string,
    type: "call" | "put",
    expiration: string,
    minDelta: number,
    maxDelta: number
  ): Promise<Array<OptionContract & { delta: number }>> {
    const contracts = await this.getContracts({ underlying, expiration, type })
    const snapshots = await this.getSnapshots(contracts.map(c => c.symbol))

    const results: Array<OptionContract & { delta: number }> = []

    for (const contract of contracts) {
      const snap = snapshots[contract.symbol]
      const delta = snap?.greeks?.delta
      if (delta !== undefined) {
        const absDelta = Math.abs(delta)
        if (absDelta >= minDelta && absDelta <= maxDelta) {
          results.push({ ...contract, delta })
        }
      }
    }

    // Sort by delta proximity to middle of range
    const targetDelta = (minDelta + maxDelta) / 2
    results.sort((a, b) => Math.abs(Math.abs(a.delta) - targetDelta) - Math.abs(Math.abs(b.delta) - targetDelta))

    return results
  }
}

interface RawOptionContract {
  symbol: string
  underlying_symbol: string
  expiration_date: string
  strike_price: string
  type: "call" | "put"
  open_interest: string
}

interface RawOptionSnapshot {
  latest_quote?: {
    bid_price: number
    bid_size: number
    ask_price: number
    ask_size: number
  }
  greeks?: {
    delta: number
    gamma: number
    theta: number
    vega: number
    rho: number
  }
  implied_volatility?: number
}

export function getDTE(expiration: string): number {
  const exp = new Date(expiration)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function createAlpacaOptionsClient(config: AlpacaOptionsConfig): AlpacaOptionsClient {
  return new AlpacaOptionsClient(config)
}
```

---


## Order Service

```ts
// packages/data-ops/src/services/order-service.ts

import { AlpacaTradingClient } from "../providers/alpaca/trading"
import { AlpacaOptionsClient, getDTE } from "../providers/alpaca/options"
import type { Order, OrderParams, Position, MarketClock, AssetClass } from "../providers/alpaca/types"

export interface OrderPreview {
  symbol: string
  asset_class: AssetClass
  side: "buy" | "sell"
  qty?: number
  notional?: number
  order_type: string
  limit_price?: number
  stop_price?: number
  time_in_force: string
  estimated_price: number
  estimated_cost: number
}

export interface OptionsOrderPreview extends OrderPreview {
  underlying: string
  expiration: string
  strike: number
  option_type: "call" | "put"
  dte: number
  delta?: number
  estimated_premium: number
}

export async function previewOrder(
  trading: AlpacaTradingClient,
  params: OrderParams
): Promise<{ preview: OrderPreview; clock: MarketClock }> {
  const [clock, asset, quote] = await Promise.all([
    trading.getClock(),
    trading.getAsset(params.symbol),
    getEstimatedPrice(trading, params),
  ])

  const assetClass: AssetClass = asset?.class === "crypto" ? "crypto" : "us_equity"
  const estimatedCost = params.notional ?? (params.qty ?? 0) * quote

  // Adjust TIF for crypto
  let tif = params.time_in_force
  if (assetClass === "crypto" && (tif === "day" || tif === "fok")) {
    tif = "gtc"
  }

  return {
    preview: {
      symbol: params.symbol.toUpperCase(),
      asset_class: assetClass,
      side: params.side,
      qty: params.qty,
      notional: params.notional,
      order_type: params.type,
      limit_price: params.limit_price,
      stop_price: params.stop_price,
      time_in_force: tif,
      estimated_price: quote,
      estimated_cost: estimatedCost,
    },
    clock,
  }
}

export async function previewOptionsOrder(
  trading: AlpacaTradingClient,
  options: AlpacaOptionsClient,
  params: {
    contract_symbol: string
    side: "buy" | "sell"
    qty: number
    order_type: "market" | "limit"
    limit_price?: number
    time_in_force: "day" | "gtc"
  }
): Promise<{ preview: OptionsOrderPreview; clock: MarketClock }> {
  const [clock, snapshot] = await Promise.all([
    trading.getClock(),
    options.getSnapshot(params.contract_symbol),
  ])

  const parsed = parseOptionsSymbol(params.contract_symbol)
  if (!parsed) {
    throw new Error("Invalid options contract symbol")
  }

  const estimatedPremium =
    params.limit_price ??
    (params.side === "buy" ? snapshot.latest_quote.ask_price : snapshot.latest_quote.bid_price)

  return {
    preview: {
      symbol: params.contract_symbol.toUpperCase(),
      asset_class: "us_equity",
      side: params.side,
      qty: params.qty,
      order_type: params.order_type,
      limit_price: params.limit_price,
      time_in_force: params.time_in_force,
      estimated_price: estimatedPremium,
      estimated_cost: params.qty * estimatedPremium * 100,
      underlying: parsed.underlying,
      expiration: parsed.expiration,
      strike: parsed.strike,
      option_type: parsed.type,
      dte: getDTE(parsed.expiration),
      delta: snapshot.greeks?.delta,
      estimated_premium: estimatedPremium,
    },
    clock,
  }
}

export async function submitOrder(
  trading: AlpacaTradingClient,
  params: OrderParams
): Promise<Order> {
  return trading.createOrder(params)
}

async function getEstimatedPrice(trading: AlpacaTradingClient, params: OrderParams): Promise<number> {
  if (params.limit_price) return params.limit_price
  if (params.stop_price) return params.stop_price

  // Would need market data client for real quote
  // For now, return 0 and let frontend handle
  return 0
}

function parseOptionsSymbol(
  symbol: string
): { underlying: string; expiration: string; type: "call" | "put"; strike: number } | null {
  // Format: AAPL240119C00150000
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d+)$/)
  if (!match) return null

  const [, underlying, dateStr, typeChar, strikeStr] = match
  if (!underlying || !dateStr || !typeChar || !strikeStr) return null

  const year = 2000 + parseInt(dateStr.slice(0, 2), 10)
  const month = parseInt(dateStr.slice(2, 4), 10)
  const day = parseInt(dateStr.slice(4, 6), 10)

  return {
    underlying,
    expiration: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    type: typeChar === "C" ? "call" : "put",
    strike: parseInt(strikeStr, 10) / 1000,
  }
}
```

---

