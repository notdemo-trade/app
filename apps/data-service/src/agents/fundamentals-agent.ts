import { initDatabase } from '@repo/data-ops/database/setup';
import { upsertFinancialStatement } from '@repo/data-ops/financial-statements';
import { FundamentalsProvider } from '@repo/data-ops/providers/financialdatasets';
import { Agent, callable } from 'agents';

interface FundamentalsAgentState {
	totalFetches: number;
	lastFetchAt: number | null;
	errorCount: number;
	lastError: string | null;
}

export class FundamentalsAgent extends Agent<Env, FundamentalsAgentState> {
	initialState: FundamentalsAgentState = {
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

		this.sql`CREATE TABLE IF NOT EXISTS fundamentals_fetch_log (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol     TEXT NOT NULL,
			type       TEXT NOT NULL,
			count      INTEGER NOT NULL,
			fetched_at INTEGER NOT NULL
		)`;
	}

	@callable()
	async fetchStatements(
		symbol: string,
	): Promise<{ income: number; balanceSheet: number; cashFlow: number }> {
		const provider = new FundamentalsProvider({
			apiKey: this.env.FINANCIAL_DATASETS_API_KEY,
		});

		try {
			const [incomeStatements, balanceSheets, cashFlows] = await Promise.all([
				provider.fetchIncomeStatements(symbol, 'quarterly', 4),
				provider.fetchBalanceSheets(symbol, 'quarterly', 4),
				provider.fetchCashFlows(symbol, 'quarterly', 4),
			]);

			// Store income statements
			for (const stmt of incomeStatements) {
				await upsertFinancialStatement({
					symbol,
					statementType: 'income',
					period: stmt.report_period ?? stmt.calendar_date,
					filingDate: stmt.calendar_date ? new Date(stmt.calendar_date) : undefined,
					data: stmt as unknown as Record<string, unknown>,
				});
			}

			// Store balance sheets
			for (const stmt of balanceSheets) {
				await upsertFinancialStatement({
					symbol,
					statementType: 'balance_sheet',
					period: stmt.report_period ?? stmt.calendar_date,
					filingDate: stmt.calendar_date ? new Date(stmt.calendar_date) : undefined,
					data: stmt as unknown as Record<string, unknown>,
				});
			}

			// Store cash flows
			for (const stmt of cashFlows) {
				await upsertFinancialStatement({
					symbol,
					statementType: 'cash_flow',
					period: stmt.report_period ?? stmt.calendar_date,
					filingDate: stmt.calendar_date ? new Date(stmt.calendar_date) : undefined,
					data: stmt as unknown as Record<string, unknown>,
				});
			}

			const now = Date.now();
			this.sql`INSERT INTO fundamentals_fetch_log (symbol, type, count, fetched_at)
				VALUES (${symbol}, 'all', ${incomeStatements.length + balanceSheets.length + cashFlows.length}, ${now})`;

			this.setState({
				...this.state,
				totalFetches: this.state.totalFetches + 1,
				lastFetchAt: now,
			});

			return {
				income: incomeStatements.length,
				balanceSheet: balanceSheets.length,
				cashFlow: cashFlows.length,
			};
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
