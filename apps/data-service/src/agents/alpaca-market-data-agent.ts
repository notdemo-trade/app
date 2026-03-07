import type {
	AlpacaMarketDataAgentState,
	MarketDataFetchParams,
	MarketDataResult,
} from '@repo/data-ops/agents/market-data/types';
import type { Bar } from '@repo/data-ops/agents/ta/types';
import { Agent } from 'agents';

export class AlpacaMarketDataAgent extends Agent<Env, AlpacaMarketDataAgentState> {
	initialState: AlpacaMarketDataAgentState = {
		lastFetchAt: null,
		barCount: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		this.sql`CREATE TABLE IF NOT EXISTS bars (
			symbol    TEXT NOT NULL,
			timeframe TEXT NOT NULL,
			t         TEXT NOT NULL,
			o         REAL NOT NULL,
			h         REAL NOT NULL,
			l         REAL NOT NULL,
			c         REAL NOT NULL,
			v         INTEGER NOT NULL,
			n         INTEGER NOT NULL,
			vw        REAL NOT NULL,
			fetched_at INTEGER NOT NULL,
			PRIMARY KEY (symbol, timeframe, t)
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS fetch_log (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol     TEXT NOT NULL,
			timeframe  TEXT NOT NULL,
			bar_count  INTEGER NOT NULL,
			fetched_at INTEGER NOT NULL
		)`;

		this.sql`CREATE INDEX IF NOT EXISTS idx_bars_symbol_tf ON bars(symbol, timeframe, t DESC)`;
	}

	// M3: Will be implemented with actual Alpaca API calls
	async fetchBars(_params: MarketDataFetchParams): Promise<MarketDataResult> {
		throw new Error('AlpacaMarketDataAgent.fetchBars not yet implemented');
	}

	async getLatestBars(symbol: string, timeframe: string, limit: number): Promise<Bar[]> {
		return this.sql<Bar>`
			SELECT t, o, h, l, c, v, n, vw FROM bars
			WHERE symbol = ${symbol} AND timeframe = ${timeframe}
			ORDER BY t DESC LIMIT ${limit}
		`;
	}
}
