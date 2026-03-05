import type { AlpacaClient } from './client';
import type { Account, MarketClock, Order, PortfolioHistory, Position } from './types';

interface RawAccount {
	id: string;
	account_number: string;
	status: string;
	currency: string;
	cash: string;
	buying_power: string;
	regt_buying_power: string;
	daytrading_buying_power: string;
	equity: string;
	last_equity: string;
	long_market_value: string;
	short_market_value: string;
	portfolio_value: string;
	pattern_day_trader: boolean;
	trading_blocked: boolean;
	transfers_blocked: boolean;
	account_blocked: boolean;
	multiplier: string;
	shorting_enabled: boolean;
	maintenance_margin: string;
	initial_margin: string;
	daytrade_count: number;
	created_at: string;
}

interface RawPosition {
	asset_id: string;
	symbol: string;
	exchange: string;
	asset_class: string;
	avg_entry_price: string;
	qty: string;
	side: string;
	market_value: string;
	cost_basis: string;
	unrealized_pl: string;
	unrealized_plpc: string;
	unrealized_intraday_pl: string;
	unrealized_intraday_plpc: string;
	current_price: string;
	lastday_price: string;
	change_today: string;
}

function parseAccount(raw: RawAccount): Account {
	return {
		...raw,
		cash: Number.parseFloat(raw.cash),
		buying_power: Number.parseFloat(raw.buying_power),
		equity: Number.parseFloat(raw.equity),
		last_equity: Number.parseFloat(raw.last_equity),
		long_market_value: Number.parseFloat(raw.long_market_value),
		short_market_value: Number.parseFloat(raw.short_market_value),
		portfolio_value: Number.parseFloat(raw.portfolio_value),
		maintenance_margin: Number.parseFloat(raw.maintenance_margin),
		initial_margin: Number.parseFloat(raw.initial_margin),
		regt_buying_power: Number.parseFloat(raw.regt_buying_power),
		daytrading_buying_power: Number.parseFloat(raw.daytrading_buying_power),
	};
}

function parsePosition(raw: RawPosition): Position {
	return {
		...raw,
		avg_entry_price: Number.parseFloat(raw.avg_entry_price),
		qty: Number.parseFloat(raw.qty),
		market_value: Number.parseFloat(raw.market_value),
		cost_basis: Number.parseFloat(raw.cost_basis),
		unrealized_pl: Number.parseFloat(raw.unrealized_pl),
		unrealized_plpc: Number.parseFloat(raw.unrealized_plpc),
		unrealized_intraday_pl: Number.parseFloat(raw.unrealized_intraday_pl),
		unrealized_intraday_plpc: Number.parseFloat(raw.unrealized_intraday_plpc),
		current_price: Number.parseFloat(raw.current_price),
		lastday_price: Number.parseFloat(raw.lastday_price),
		change_today: Number.parseFloat(raw.change_today),
		side: raw.side as 'long' | 'short',
	};
}

export class AlpacaTradingProvider {
	constructor(private client: AlpacaClient) {}

	async getAccount(): Promise<Account> {
		const raw = await this.client.request<RawAccount>('GET', '/v2/account');
		return parseAccount(raw);
	}

	async getPositions(): Promise<Position[]> {
		const raw = await this.client.request<RawPosition[]>('GET', '/v2/positions');
		return raw.map(parsePosition);
	}

	async listOrders(params?: {
		status?: 'open' | 'closed' | 'all';
		limit?: number;
	}): Promise<Order[]> {
		let path = '/v2/orders';
		const searchParams = new URLSearchParams();

		if (params?.status) searchParams.set('status', params.status);
		if (params?.limit) searchParams.set('limit', String(params.limit));

		const queryString = searchParams.toString();
		if (queryString) path += `?${queryString}`;

		return this.client.request<Order[]>('GET', path);
	}

	async getClock(): Promise<MarketClock> {
		return this.client.request<MarketClock>('GET', '/v2/clock');
	}

	async getPortfolioHistory(params?: {
		period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all';
		timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D';
	}): Promise<PortfolioHistory> {
		let path = '/v2/account/portfolio/history';
		const searchParams = new URLSearchParams();

		if (params?.period) searchParams.set('period', params.period);
		if (params?.timeframe) searchParams.set('timeframe', params.timeframe);

		const queryString = searchParams.toString();
		if (queryString) path += `?${queryString}`;

		return this.client.request<PortfolioHistory>('GET', path);
	}
}

export function createAlpacaTradingProvider(client: AlpacaClient): AlpacaTradingProvider {
	return new AlpacaTradingProvider(client);
}
