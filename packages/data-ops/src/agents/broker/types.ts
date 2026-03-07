export interface BrokerAccount {
	id: string;
	currency: string;
	cash: number;
	portfolioValue: number;
	buyingPower: number;
	daytradeCount: number;
	status: string;
}

export interface BrokerPosition {
	symbol: string;
	qty: number;
	side: 'long' | 'short';
	avgEntryPrice: number;
	currentPrice: number;
	marketValue: number;
	unrealizedPl: number;
	unrealizedPlPct: number;
}

export interface OrderRequest {
	symbol: string;
	side: 'buy' | 'sell';
	type: 'market' | 'limit' | 'stop' | 'stop_limit';
	qty?: number;
	notional?: number;
	limitPrice?: number;
	stopPrice?: number;
	timeInForce: 'day' | 'gtc' | 'ioc' | 'foc';
}

export interface OrderResult {
	id: string;
	clientOrderId: string;
	status: string;
	symbol: string;
	side: string;
	qty: number;
	filledQty: number;
	filledAvgPrice: number | null;
	createdAt: number;
}

export interface MarketClock {
	isOpen: boolean;
	nextOpenAt: number;
	nextCloseAt: number;
}

export interface PortfolioHistory {
	timestamps: number[];
	equity: number[];
	profitLoss: number[];
	profitLossPct: number[];
}

export interface AlpacaBrokerAgentState {
	lastSyncAt: number | null;
	positionCount: number;
	portfolioValue: number | null;
	errorCount: number;
	lastError: string | null;
}
