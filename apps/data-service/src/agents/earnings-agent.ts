import { initDatabase } from '@repo/data-ops/database/setup';
import { upsertEarnings } from '@repo/data-ops/earnings';
import { EarningsProvider } from '@repo/data-ops/providers/financialdatasets';
import { Agent, callable } from 'agents';

interface EarningsAgentState {
	totalFetches: number;
	lastFetchAt: number | null;
	errorCount: number;
	lastError: string | null;
}

export class EarningsAgent extends Agent<Env, EarningsAgentState> {
	initialState: EarningsAgentState = {
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

		this.sql`CREATE TABLE IF NOT EXISTS earnings_fetch_log (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol     TEXT NOT NULL,
			count      INTEGER NOT NULL,
			fetched_at INTEGER NOT NULL
		)`;
	}

	@callable()
	async fetchEarnings(symbol: string): Promise<{ count: number }> {
		const provider = new EarningsProvider({
			apiKey: this.env.FINANCIAL_DATASETS_API_KEY,
		});

		try {
			const earningsData = await provider.fetchEarnings(symbol, 8);

			for (const e of earningsData) {
				await upsertEarnings({
					symbol,
					reportDate: new Date(e.calendar_date),
					fiscalPeriod: e.report_period ?? e.calendar_date,
					epsEstimate: e.eps_estimate ?? undefined,
					epsActual: e.eps_actual ?? undefined,
					revenueEstimate: e.revenue_estimate ?? undefined,
					revenueActual: e.revenue_actual ?? undefined,
					surprise: e.surprise ?? undefined,
					surprisePct: e.surprise_pct ?? undefined,
					data: e as unknown as Record<string, unknown>,
				});
			}

			const now = Date.now();
			this.sql`INSERT INTO earnings_fetch_log (symbol, count, fetched_at)
				VALUES (${symbol}, ${earningsData.length}, ${now})`;

			this.setState({
				...this.state,
				totalFetches: this.state.totalFetches + 1,
				lastFetchAt: now,
			});

			return { count: earningsData.length };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: errorMessage,
			});
			throw error;
		}
	}
}
