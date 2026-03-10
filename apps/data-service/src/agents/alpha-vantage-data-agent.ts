import { initDatabase } from '@repo/data-ops/database/setup';
import { getLatestBarTimestamp, upsertBars } from '@repo/data-ops/market-data-bars';
import {
	AlphaVantageMarketDataProvider,
	AlphaVantageRateLimitError,
	timeframeToAVInterval,
} from '@repo/data-ops/providers/alphavantage';
import { Agent, callable } from 'agents';

interface AlphaVantageDataAgentState {
	totalFetches: number;
	totalBarsStored: number;
	lastFetchAt: number | null;
	errorCount: number;
	lastError: string | null;
}

export class AlphaVantageDataAgent extends Agent<Env, AlphaVantageDataAgentState> {
	initialState: AlphaVantageDataAgentState = {
		totalFetches: 0,
		totalBarsStored: 0,
		lastFetchAt: null,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.sql`CREATE TABLE IF NOT EXISTS fetch_log (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol     TEXT NOT NULL,
			timeframe  TEXT NOT NULL,
			bar_count  INTEGER NOT NULL,
			fetched_at INTEGER NOT NULL,
			source     TEXT NOT NULL DEFAULT 'alpha_vantage'
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_av_fetch_log ON fetch_log(symbol, timeframe, fetched_at DESC)`;
	}

	@callable()
	async fetchAndStoreBars(
		symbol: string,
		timeframe: string,
	): Promise<{ symbol: string; timeframe: string; barsStored: number }> {
		const provider = new AlphaVantageMarketDataProvider({
			apiKey: this.env.ALPHA_VANTAGE_API_KEY,
		});

		try {
			let bars: import('@repo/data-ops/agents/ta/types').Bar[];
			if (timeframe === '1Day') {
				// Check if we need full history or just compact (last 100)
				const latestTs = await getLatestBarTimestamp(symbol, timeframe);
				const outputSize = latestTs ? 'compact' : 'full';
				bars = await provider.getDailyBars(symbol, outputSize);
			} else {
				const interval = timeframeToAVInterval(timeframe);
				if (!interval) {
					throw new Error(`Unsupported timeframe for Alpha Vantage intraday: ${timeframe}`);
				}
				const latestTs = await getLatestBarTimestamp(symbol, timeframe);
				const outputSize = latestTs ? 'compact' : 'full';
				bars = await provider.getIntradayBars(symbol, interval, outputSize);
			}

			if (bars.length === 0) {
				return { symbol, timeframe, barsStored: 0 };
			}

			// Cap to last 2 years to avoid storing decades of unused history
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
			bars = bars.filter((b) => new Date(b.t) >= twoYearsAgo);

			// Convert to upsert format
			const upsertData = bars.map((bar) => ({
				symbol,
				timeframe,
				timestamp: new Date(bar.t),
				open: bar.o,
				high: bar.h,
				low: bar.l,
				close: bar.c,
				volume: bar.v,
				source: 'alpha_vantage',
			}));

			const stored = await upsertBars(upsertData);

			const now = Date.now();
			this.sql`INSERT INTO fetch_log (symbol, timeframe, bar_count, fetched_at)
				VALUES (${symbol}, ${timeframe}, ${stored}, ${now})`;

			this.setState({
				...this.state,
				totalFetches: this.state.totalFetches + 1,
				totalBarsStored: this.state.totalBarsStored + stored,
				lastFetchAt: now,
			});

			return { symbol, timeframe, barsStored: stored };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			if (error instanceof AlphaVantageRateLimitError) {
				console.warn(`[AlphaVantageDataAgent] Rate limited for ${symbol}/${timeframe}`);
			}

			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: errorMessage,
			});

			throw error;
		}
	}
}
