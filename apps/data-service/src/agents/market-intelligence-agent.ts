import { initDatabase } from '@repo/data-ops/database/setup';
import {
	upsertInsiderTrades,
	upsertInstitutionalHoldings,
	upsertPriceTargets,
} from '@repo/data-ops/market-intelligence';
import { MarketIntelProvider } from '@repo/data-ops/providers/financialdatasets';
import { Agent, callable } from 'agents';

interface MarketIntelligenceAgentState {
	totalFetches: number;
	lastFetchAt: number | null;
	errorCount: number;
	lastError: string | null;
}

export class MarketIntelligenceAgent extends Agent<Env, MarketIntelligenceAgentState> {
	initialState: MarketIntelligenceAgentState = {
		totalFetches: 0,
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

		this.sql`CREATE TABLE IF NOT EXISTS market_intel_fetch_log (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol     TEXT NOT NULL,
			type       TEXT NOT NULL,
			count      INTEGER NOT NULL,
			fetched_at INTEGER NOT NULL
		)`;
	}

	@callable()
	async fetchInsiderTrades(symbol: string): Promise<{ count: number }> {
		const provider = new MarketIntelProvider({
			apiKey: this.env.FINANCIAL_DATASETS_API_KEY,
		});

		try {
			const trades = await provider.fetchInsiderTrades(symbol, 20);

			await upsertInsiderTrades(
				symbol,
				trades.map((t) => ({
					tradeDate: new Date(t.trade_date),
					data: t as unknown as Record<string, unknown>,
				})),
			);

			const now = Date.now();
			this.sql`INSERT INTO market_intel_fetch_log (symbol, type, count, fetched_at)
				VALUES (${symbol}, 'insider_trades', ${trades.length}, ${now})`;

			this.setState({ ...this.state, totalFetches: this.state.totalFetches + 1, lastFetchAt: now });
			return { count: trades.length };
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	@callable()
	async fetchInstitutionalHoldings(symbol: string): Promise<{ count: number }> {
		const provider = new MarketIntelProvider({
			apiKey: this.env.FINANCIAL_DATASETS_API_KEY,
		});

		try {
			const holdings = await provider.fetchInstitutionalHoldings(symbol, 20);

			await upsertInstitutionalHoldings(
				symbol,
				holdings.map((h) => ({
					reportDate: new Date(h.filing_date),
					data: h as unknown as Record<string, unknown>,
				})),
			);

			const now = Date.now();
			this.sql`INSERT INTO market_intel_fetch_log (symbol, type, count, fetched_at)
				VALUES (${symbol}, 'institutional_holdings', ${holdings.length}, ${now})`;

			this.setState({ ...this.state, totalFetches: this.state.totalFetches + 1, lastFetchAt: now });
			return { count: holdings.length };
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	@callable()
	async fetchPriceTargets(symbol: string): Promise<{ count: number }> {
		const provider = new MarketIntelProvider({
			apiKey: this.env.FINANCIAL_DATASETS_API_KEY,
		});

		try {
			const targets = await provider.fetchPriceTargets(symbol, 20);

			await upsertPriceTargets(
				symbol,
				targets.map((t) => ({
					publishedDate: new Date(t.published_date),
					data: t as unknown as Record<string, unknown>,
				})),
			);

			const now = Date.now();
			this.sql`INSERT INTO market_intel_fetch_log (symbol, type, count, fetched_at)
				VALUES (${symbol}, 'price_targets', ${targets.length}, ${now})`;

			this.setState({ ...this.state, totalFetches: this.state.totalFetches + 1, lastFetchAt: now });
			return { count: targets.length };
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	private handleError(error: unknown): void {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		this.setState({
			...this.state,
			errorCount: this.state.errorCount + 1,
			lastError: errorMessage,
		});
	}
}
