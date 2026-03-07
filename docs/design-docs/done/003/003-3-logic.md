# Phase 3: Account Portfolio View — Part 3: Business Logic
> Split from `003-phase-3-account-portfolio-view.md`. See other parts in this directory.

## Alpaca Client Module

```ts
// packages/data-ops/src/providers/alpaca/client.ts

export interface AlpacaClientConfig {
  apiKey: string
  apiSecret: string
  paper: boolean
}

export class AlpacaClient {
  private tradingBaseUrl: string
  private headers: Record<string, string>

  constructor(config: AlpacaClientConfig) {
    this.tradingBaseUrl = config.paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets"
    this.headers = {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
      "Content-Type": "application/json",
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.tradingBaseUrl}${path}`
    const options: RequestInit = { method, headers: this.headers }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const errorBody = await response.text()
      throw new AlpacaApiError(response.status, errorBody)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }
}

export class AlpacaApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`Alpaca API error (${statusCode}): ${body}`)
    this.name = "AlpacaApiError"
  }
}
```

---


## Trading Provider

```ts
// packages/data-ops/src/providers/alpaca/trading.ts

import type { AlpacaClient } from "./client"
import type { Account, Position, Order, PortfolioHistory, MarketClock } from "./types"

interface RawAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: string
  buying_power: string
  regt_buying_power: string
  daytrading_buying_power: string
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  portfolio_value: string
  pattern_day_trader: boolean
  trading_blocked: boolean
  transfers_blocked: boolean
  account_blocked: boolean
  multiplier: string
  shorting_enabled: boolean
  maintenance_margin: string
  initial_margin: string
  daytrade_count: number
  created_at: string
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
  unrealized_intraday_pl: string
  unrealized_intraday_plpc: string
  current_price: string
  lastday_price: string
  change_today: string
}

function parseAccount(raw: RawAccount): Account {
  return {
    ...raw,
    cash: parseFloat(raw.cash),
    buying_power: parseFloat(raw.buying_power),
    equity: parseFloat(raw.equity),
    last_equity: parseFloat(raw.last_equity),
    long_market_value: parseFloat(raw.long_market_value),
    short_market_value: parseFloat(raw.short_market_value),
    portfolio_value: parseFloat(raw.portfolio_value),
    maintenance_margin: parseFloat(raw.maintenance_margin),
    initial_margin: parseFloat(raw.initial_margin),
    regt_buying_power: parseFloat(raw.regt_buying_power),
    daytrading_buying_power: parseFloat(raw.daytrading_buying_power),
  }
}

function parsePosition(raw: RawPosition): Position {
  return {
    ...raw,
    avg_entry_price: parseFloat(raw.avg_entry_price),
    qty: parseFloat(raw.qty),
    market_value: parseFloat(raw.market_value),
    cost_basis: parseFloat(raw.cost_basis),
    unrealized_pl: parseFloat(raw.unrealized_pl),
    unrealized_plpc: parseFloat(raw.unrealized_plpc),
    unrealized_intraday_pl: parseFloat(raw.unrealized_intraday_pl),
    unrealized_intraday_plpc: parseFloat(raw.unrealized_intraday_plpc),
    current_price: parseFloat(raw.current_price),
    lastday_price: parseFloat(raw.lastday_price),
    change_today: parseFloat(raw.change_today),
    side: raw.side as "long" | "short",
  }
}

export class AlpacaTradingProvider {
  constructor(private client: AlpacaClient) {}

  async getAccount(): Promise<Account> {
    const raw = await this.client.request<RawAccount>("GET", "/v2/account")
    return parseAccount(raw)
  }

  async getPositions(): Promise<Position[]> {
    const raw = await this.client.request<RawPosition[]>("GET", "/v2/positions")
    return raw.map(parsePosition)
  }

  async listOrders(params?: {
    status?: "open" | "closed" | "all"
    limit?: number
  }): Promise<Order[]> {
    let path = "/v2/orders"
    const searchParams = new URLSearchParams()

    if (params?.status) searchParams.set("status", params.status)
    if (params?.limit) searchParams.set("limit", String(params.limit))

    const queryString = searchParams.toString()
    if (queryString) path += `?${queryString}`

    return this.client.request<Order[]>("GET", path)
  }

  async getClock(): Promise<MarketClock> {
    return this.client.request<MarketClock>("GET", "/v2/clock")
  }

  async getPortfolioHistory(params?: {
    period?: "1D" | "1W" | "1M" | "3M" | "1A" | "all"
    timeframe?: "1Min" | "5Min" | "15Min" | "1H" | "1D"
  }): Promise<PortfolioHistory> {
    let path = "/v2/account/portfolio/history"
    const searchParams = new URLSearchParams()

    if (params?.period) searchParams.set("period", params.period)
    if (params?.timeframe) searchParams.set("timeframe", params.timeframe)

    const queryString = searchParams.toString()
    if (queryString) path += `?${queryString}`

    return this.client.request<PortfolioHistory>("GET", path)
  }
}

export function createAlpacaTradingProvider(client: AlpacaClient): AlpacaTradingProvider {
  return new AlpacaTradingProvider(client)
}
```

---


## API Service

```ts
// apps/data-service/src/hono/services/portfolio-service.ts

import { AppError, ok, err } from "../types/result"
import type { Result } from "../types/result"
import { getCredential } from "@repo/data-ops/credentials"
import { AlpacaClient, AlpacaApiError } from "@repo/data-ops/providers/alpaca/client"
import { createAlpacaTradingProvider } from "@repo/data-ops/providers/alpaca/trading"
import type { AlpacaCredential } from "@repo/data-ops/credentials"
import type { AlpacaTradingProvider } from "@repo/data-ops/providers/alpaca/trading"
import type { Account, Position, Order, MarketClock, PortfolioHistory } from "@repo/data-ops/providers/alpaca/types"
import type { Database } from "@repo/data-ops/database/setup"

interface PortfolioServiceContext {
  db: Database
  userId: string
  masterKey: string
}

async function getAlpacaProvider(ctx: PortfolioServiceContext): Promise<Result<AlpacaTradingProvider>> {
  const cred = await getCredential<AlpacaCredential>(ctx.db, {
    userId: ctx.userId,
    provider: "alpaca",
    masterKey: ctx.masterKey,
  })

  if (!cred) {
    return err(new AppError("Alpaca credentials not configured. Add credentials in Settings.", 400))
  }

  const client = new AlpacaClient({
    apiKey: cred.apiKey,
    apiSecret: cred.apiSecret,
    paper: cred.paper,
  })

  return ok(createAlpacaTradingProvider(client))
}

function handleAlpacaError(e: unknown): AppError {
  if (e instanceof AlpacaApiError) {
    if (e.statusCode === 401) {
      return new AppError("Alpaca authentication failed. Check your API credentials.", 401)
    }
    if (e.statusCode === 403) {
      return new AppError("Alpaca access denied. Your account may be restricted.", 403)
    }
    return new AppError(`Alpaca API error: ${e.body}`, 502)
  }
  return new AppError(e instanceof Error ? e.message : "Unknown error", 500)
}

export async function getAccount(ctx: PortfolioServiceContext): Promise<Result<Account>> {
  const providerResult = await getAlpacaProvider(ctx)
  if (!providerResult.ok) return providerResult
  try {
    return ok(await providerResult.data.getAccount())
  } catch (e) {
    return err(handleAlpacaError(e))
  }
}

export async function getPositions(ctx: PortfolioServiceContext): Promise<Result<Position[]>> {
  const providerResult = await getAlpacaProvider(ctx)
  if (!providerResult.ok) return providerResult
  try {
    return ok(await providerResult.data.getPositions())
  } catch (e) {
    return err(handleAlpacaError(e))
  }
}

export async function getOrders(
  ctx: PortfolioServiceContext,
  params: { status?: "open" | "closed" | "all"; limit?: number }
): Promise<Result<Order[]>> {
  const providerResult = await getAlpacaProvider(ctx)
  if (!providerResult.ok) return providerResult
  try {
    return ok(await providerResult.data.listOrders(params))
  } catch (e) {
    return err(handleAlpacaError(e))
  }
}

export async function getClock(ctx: PortfolioServiceContext): Promise<Result<MarketClock>> {
  const providerResult = await getAlpacaProvider(ctx)
  if (!providerResult.ok) return providerResult
  try {
    return ok(await providerResult.data.getClock())
  } catch (e) {
    return err(handleAlpacaError(e))
  }
}

export async function getPortfolioHistory(
  ctx: PortfolioServiceContext,
  params: { period?: "1D" | "1W" | "1M" | "3M" | "1A" | "all"; timeframe?: "1Min" | "5Min" | "15Min" | "1H" | "1D" }
): Promise<Result<PortfolioHistory>> {
  const providerResult = await getAlpacaProvider(ctx)
  if (!providerResult.ok) return providerResult
  try {
    return ok(await providerResult.data.getPortfolioHistory(params))
  } catch (e) {
    return err(handleAlpacaError(e))
  }
}
```

---


## Error Handling

### Error Cases

| Error | HTTP Code | UI Treatment |
|-------|-----------|--------------|
| No Alpaca credentials | 400 | Show "Connect Alpaca" CTA |
| Invalid credentials | 401 | Show "Credentials invalid" with link to settings |
| Account restricted | 403 | Show restriction message |
| Alpaca API down | 502 | Show retry button |
| Network error | - | Show offline indicator |

### Error Boundary

```tsx
// components/portfolio/portfolio-error-boundary.tsx

export function PortfolioErrorBoundary({ error }: { error: Error }) {
  if (error.message.includes("credentials not configured")) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <h3 className="text-lg font-semibold">Connect Your Broker</h3>
          <p className="text-muted-foreground mt-2">
            Add your Alpaca API credentials to view your portfolio.
          </p>
          <Button asChild className="mt-4">
            <Link to="/settings/credentials">Add Credentials</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (error.message.includes("authentication failed")) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <h3 className="text-lg font-semibold text-destructive">
            Credentials Invalid
          </h3>
          <p className="text-muted-foreground mt-2">
            Your Alpaca credentials are no longer valid.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/settings/credentials">Update Credentials</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-8 text-center">
        <h3 className="text-lg font-semibold text-destructive">
          Failed to Load Portfolio
        </h3>
        <p className="text-muted-foreground mt-2">{error.message}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </CardContent>
    </Card>
  )
}
```

---

