import type {
	AlpacaBrokerAgentState,
	BrokerAccount,
	BrokerPosition,
	MarketClock,
	OrderLogEntry,
	OrderRequest,
	OrderResult,
	PortfolioHistory,
} from '@repo/data-ops/agents/broker/types';
import type { AlpacaCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import { AlpacaClient, AlpacaTradingProvider } from '@repo/data-ops/providers/alpaca';
import { Agent } from 'agents';

export class AlpacaBrokerAgent extends Agent<Env, AlpacaBrokerAgentState> {
	initialState: AlpacaBrokerAgentState = {
		lastSyncAt: null,
		positionCount: 0,
		portfolioValue: null,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		this.sql`CREATE TABLE IF NOT EXISTS account_cache (
			id              TEXT PRIMARY KEY DEFAULT 'current',
			data            TEXT NOT NULL,
			synced_at       INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS positions_cache (
			symbol          TEXT PRIMARY KEY,
			data            TEXT NOT NULL,
			synced_at       INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS order_log (
			id              TEXT PRIMARY KEY,
			client_order_id TEXT NOT NULL,
			symbol          TEXT NOT NULL,
			side            TEXT NOT NULL,
			type            TEXT NOT NULL,
			qty             REAL,
			notional        REAL,
			status          TEXT NOT NULL,
			filled_qty      REAL,
			filled_avg_price REAL,
			created_at      INTEGER NOT NULL,
			updated_at      INTEGER NOT NULL
		)`;

		this.sql`CREATE INDEX IF NOT EXISTS idx_orders_symbol ON order_log(symbol, created_at DESC)`;
	}

	async getAccount(): Promise<BrokerAccount> {
		const { provider } = await this.createClientAndProvider();
		const account = await provider.getAccount();
		return {
			id: account.id,
			currency: account.currency,
			cash: account.cash,
			portfolioValue: account.portfolio_value,
			buyingPower: account.buying_power,
			daytradeCount: account.daytrade_count,
			status: account.status,
		};
	}

	async getPositions(): Promise<BrokerPosition[]> {
		const { provider } = await this.createClientAndProvider();
		const positions = await provider.getPositions();
		return positions.map((p) => ({
			symbol: p.symbol,
			qty: p.qty,
			side: p.side,
			avgEntryPrice: p.avg_entry_price,
			currentPrice: p.current_price,
			marketValue: p.market_value,
			unrealizedPl: p.unrealized_pl,
			unrealizedPlPct: p.unrealized_plpc,
		}));
	}

	async placeOrder(order: OrderRequest): Promise<OrderResult> {
		const { client } = await this.createClientAndProvider();
		const alpacaOrder = await client.request<{
			id: string;
			client_order_id: string;
			status: string;
			symbol: string;
			side: string;
			qty: string;
			filled_qty: string;
			filled_avg_price: string | null;
			created_at: string;
		}>('POST', '/v2/orders', {
			symbol: order.symbol,
			side: order.side,
			type: order.type,
			qty: order.qty?.toString(),
			notional: order.notional?.toString(),
			limit_price: order.limitPrice?.toString(),
			stop_price: order.stopPrice?.toString(),
			time_in_force: order.timeInForce,
		});

		const result: OrderResult = {
			id: alpacaOrder.id,
			clientOrderId: alpacaOrder.client_order_id,
			status: alpacaOrder.status,
			symbol: alpacaOrder.symbol,
			side: alpacaOrder.side,
			qty: Number.parseFloat(alpacaOrder.qty),
			filledQty: Number.parseFloat(alpacaOrder.filled_qty),
			filledAvgPrice: alpacaOrder.filled_avg_price
				? Number.parseFloat(alpacaOrder.filled_avg_price)
				: null,
			createdAt: new Date(alpacaOrder.created_at).getTime(),
		};

		this.sql`INSERT OR REPLACE INTO order_log
			(id, client_order_id, symbol, side, type, qty, notional, status, filled_qty, filled_avg_price, created_at, updated_at)
			VALUES (${result.id}, ${result.clientOrderId}, ${result.symbol}, ${result.side}, ${order.type},
				${order.qty ?? null}, ${order.notional ?? null}, ${result.status},
				${result.filledQty}, ${result.filledAvgPrice}, ${result.createdAt}, ${result.createdAt})`;

		return result;
	}

	async cancelOrder(orderId: string): Promise<void> {
		const { client } = await this.createClientAndProvider();
		await client.request('DELETE', `/v2/orders/${orderId}`);
	}

	async getPortfolioHistory(): Promise<PortfolioHistory> {
		const { provider } = await this.createClientAndProvider();
		const history = await provider.getPortfolioHistory({ period: '1M', timeframe: '1D' });
		return {
			timestamps: history.timestamp,
			equity: history.equity,
			profitLoss: history.profit_loss,
			profitLossPct: history.profit_loss_pct,
		};
	}

	async getClock(): Promise<MarketClock> {
		const { provider } = await this.createClientAndProvider();
		const clock = await provider.getClock();
		return {
			isOpen: clock.is_open,
			nextOpenAt: new Date(clock.next_open).getTime(),
			nextCloseAt: new Date(clock.next_close).getTime(),
		};
	}

	async getOrderHistory(symbol: string): Promise<OrderLogEntry[]> {
		return this.sql<OrderLogEntry>`
			SELECT id, client_order_id as clientOrderId, symbol, side, type,
				qty, notional, status, filled_qty as filledQty,
				filled_avg_price as filledAvgPrice, created_at as createdAt, updated_at as updatedAt
			FROM order_log
			WHERE symbol = ${symbol}
			ORDER BY created_at DESC`;
	}

	private async createClientAndProvider(): Promise<{
		client: AlpacaClient;
		provider: AlpacaTradingProvider;
	}> {
		const userId = this.name;
		const cred = await getCredential<AlpacaCredential>({
			userId,
			provider: 'alpaca',
			masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY,
		});
		if (!cred) throw new Error('Alpaca credentials not configured');
		const client = new AlpacaClient({
			apiKey: cred.apiKey,
			apiSecret: cred.apiSecret,
			paper: cred.paper,
		});
		return { client, provider: new AlpacaTradingProvider(client) };
	}
}
