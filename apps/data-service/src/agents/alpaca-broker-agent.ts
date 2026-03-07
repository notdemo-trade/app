import type {
	AlpacaBrokerAgentState,
	BrokerAccount,
	BrokerPosition,
	MarketClock,
	OrderRequest,
	OrderResult,
	PortfolioHistory,
} from '@repo/data-ops/agents/broker/types';
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
		throw new Error('AlpacaBrokerAgent.getAccount not yet implemented');
	}

	async getPositions(): Promise<BrokerPosition[]> {
		throw new Error('AlpacaBrokerAgent.getPositions not yet implemented');
	}

	async placeOrder(_order: OrderRequest): Promise<OrderResult> {
		throw new Error('AlpacaBrokerAgent.placeOrder not yet implemented');
	}

	async cancelOrder(_orderId: string): Promise<void> {
		throw new Error('AlpacaBrokerAgent.cancelOrder not yet implemented');
	}

	async getPortfolioHistory(): Promise<PortfolioHistory> {
		throw new Error('AlpacaBrokerAgent.getPortfolioHistory not yet implemented');
	}

	async getClock(): Promise<MarketClock> {
		throw new Error('AlpacaBrokerAgent.getClock not yet implemented');
	}
}
