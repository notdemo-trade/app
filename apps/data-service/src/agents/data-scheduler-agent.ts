import { getActiveSymbols } from '@repo/data-ops/active-symbol';
import { initDatabase } from '@repo/data-ops/database/setup';
import { Agent, callable, getAgentByName } from 'agents';
import type { AlphaVantageDataAgent } from './alpha-vantage-data-agent';
import type { EarningsAgent } from './earnings-agent';
import type { FundamentalsAgent } from './fundamentals-agent';
import type { MarketIntelligenceAgent } from './market-intelligence-agent';

interface DataSchedulerState {
	isRunning: boolean;
	lastScheduleAt: number | null;
	totalCyclesRun: number;
	errorCount: number;
	lastError: string | null;
}

interface FetchTask {
	symbol: string;
	timeframe: string;
	priority: number;
}

// US market hours in ET: 9:30 AM - 4:00 PM
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;

export class DataSchedulerAgent extends Agent<Env, DataSchedulerState> {
	initialState: DataSchedulerState = {
		isRunning: false,
		lastScheduleAt: null,
		totalCyclesRun: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.sql`CREATE TABLE IF NOT EXISTS fetch_schedule (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol         TEXT NOT NULL,
			timeframe      TEXT NOT NULL,
			last_fetched_at INTEGER,
			next_fetch_at  INTEGER,
			status         TEXT NOT NULL DEFAULT 'pending',
			error_count    INTEGER NOT NULL DEFAULT 0
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS rate_limiter (
			key            TEXT PRIMARY KEY DEFAULT 'tokens',
			tokens         REAL NOT NULL DEFAULT 75,
			last_refill_at INTEGER NOT NULL
		)`;

		// Initialize rate limiter if not present
		const existing = this.sql<{ key: string }[]>`SELECT key FROM rate_limiter WHERE key = 'tokens'`;
		if (existing.length === 0) {
			this.sql`INSERT INTO rate_limiter (key, tokens, last_refill_at)
				VALUES ('tokens', 75, ${Date.now()})`;
		}

		this.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fetch_schedule_sym_tf
			ON fetch_schedule(symbol, timeframe)`;
	}

	@callable()
	async startScheduling(): Promise<{ status: string }> {
		if (this.state.isRunning) {
			return { status: 'already_running' };
		}

		this.setState({ ...this.state, isRunning: true });

		// Schedule first alarm in 60 seconds
		await this.schedule(new Date(Date.now() + 60_000), 'runSchedulerCycle');

		return { status: 'started' };
	}

	@callable()
	async stopScheduling(): Promise<{ status: string }> {
		this.setState({ ...this.state, isRunning: false });

		// Cancel all pending schedules
		const schedules = this.getSchedules();
		for (const s of schedules) {
			await this.cancelSchedule(s.id);
		}

		return { status: 'stopped' };
	}

	@callable()
	async fetchEnrichmentNow(symbol: string): Promise<{
		fundamentals: { ok: boolean; error?: string };
		insiderTrades: { ok: boolean; error?: string };
		institutionalHoldings: { ok: boolean; error?: string };
		earnings: { ok: boolean; error?: string };
	}> {
		const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

		const fundamentals = await (async () => {
			try {
				const agent = await getAgentByName<FundamentalsAgent>(this.env.FundamentalsAgent, 'global');
				await agent.fetchStatements(symbol);
				return { ok: true };
			} catch (e) {
				return { ok: false, error: errMsg(e) };
			}
		})();

		const miAgent = await getAgentByName<MarketIntelligenceAgent>(
			this.env.MarketIntelligenceAgent,
			'global',
		);

		const insiderTrades = await (async () => {
			try {
				await miAgent.fetchInsiderTrades(symbol);
				return { ok: true };
			} catch (e) {
				return { ok: false, error: errMsg(e) };
			}
		})();

		const institutionalHoldings = await (async () => {
			try {
				await miAgent.fetchInstitutionalHoldings(symbol);
				return { ok: true };
			} catch (e) {
				return { ok: false, error: errMsg(e) };
			}
		})();

		const earnings = await (async () => {
			try {
				const agent = await getAgentByName<EarningsAgent>(this.env.EarningsAgent, 'global');
				await agent.fetchEarnings(symbol);
				return { ok: true };
			} catch (e) {
				return { ok: false, error: errMsg(e) };
			}
		})();

		return { fundamentals, insiderTrades, institutionalHoldings, earnings };
	}

	async runSchedulerCycle(): Promise<void> {
		if (!this.state.isRunning) return;

		try {
			const symbols = await getActiveSymbols();
			if (symbols.length === 0) {
				this.reschedule();
				return;
			}

			const tasks = this.buildFetchTasks(symbols.map((s) => s.symbol));
			const availableTokens = this.getAvailableTokens();

			// Execute tasks up to available rate limit budget
			let tokensUsed = 0;
			for (const task of tasks) {
				if (tokensUsed >= availableTokens) break;

				const shouldFetch = this.shouldFetchNow(task);
				if (!shouldFetch) continue;

				try {
					const avAgent = await getAgentByName<AlphaVantageDataAgent>(
						this.env.AlphaVantageDataAgent,
						'global',
					);
					await avAgent.fetchAndStoreBars(task.symbol, task.timeframe);

					this.updateFetchSchedule(task.symbol, task.timeframe, Date.now());
					tokensUsed++;
				} catch (error) {
					const msg = error instanceof Error ? error.message : 'Unknown';
					console.error(`[DataScheduler] Failed to fetch ${task.symbol}/${task.timeframe}: ${msg}`);
					this.incrementErrorCount(task.symbol, task.timeframe);
				}
			}

			this.consumeTokens(tokensUsed);

			this.setState({
				...this.state,
				lastScheduleAt: Date.now(),
				totalCyclesRun: this.state.totalCyclesRun + 1,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown scheduler error';
			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: errorMessage,
			});
		}

		this.reschedule();
	}

	async runEnrichmentCycle(): Promise<void> {
		if (!this.state.isRunning) return;

		try {
			const symbols = await getActiveSymbols();
			if (symbols.length === 0) return;

			const symbolList = symbols.map((s) => s.symbol);
			const now = new Date();
			const etHour = this.getETHour(now);
			const isMarketHours = etHour >= MARKET_OPEN_HOUR && etHour < MARKET_CLOSE_HOUR;

			// Only run enrichment during off-hours to avoid competing with bar fetches
			if (isMarketHours) return;

			for (const symbol of symbolList) {
				try {
					// Fundamentals: weekly check
					if (this.shouldFetchEnrichment(symbol, 'fundamentals', 7 * 24 * 60 * 60 * 1000)) {
						const agent = await getAgentByName<FundamentalsAgent>(
							this.env.FundamentalsAgent,
							'global',
						);
						await agent.fetchStatements(symbol);
						this.updateEnrichmentSchedule(symbol, 'fundamentals');
					}

					// Market intelligence: daily
					if (this.shouldFetchEnrichment(symbol, 'market_intel', 24 * 60 * 60 * 1000)) {
						const agent = await getAgentByName<MarketIntelligenceAgent>(
							this.env.MarketIntelligenceAgent,
							'global',
						);
						await agent.fetchInsiderTrades(symbol);
						await agent.fetchInstitutionalHoldings(symbol);
						this.updateEnrichmentSchedule(symbol, 'market_intel');
					}

					// Earnings: daily
					if (this.shouldFetchEnrichment(symbol, 'earnings', 24 * 60 * 60 * 1000)) {
						const earningsAgent = await getAgentByName<EarningsAgent>(
							this.env.EarningsAgent,
							'global',
						);
						await earningsAgent.fetchEarnings(symbol);
						this.updateEnrichmentSchedule(symbol, 'earnings');
					}
				} catch (error) {
					const msg = error instanceof Error ? error.message : 'Unknown';
					console.error(`[DataScheduler] Enrichment fetch failed for ${symbol}: ${msg}`);
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown enrichment error';
			console.error(`[DataScheduler] Enrichment cycle failed: ${errorMessage}`);
		}
	}

	private shouldFetchEnrichment(symbol: string, type: string, intervalMs: number): boolean {
		const rows = this.sql<{ last_fetched_at: number | null }[]>`
			SELECT last_fetched_at FROM fetch_schedule
			WHERE symbol = ${symbol} AND timeframe = ${type}`;
		const row = rows[0];
		if (!row?.last_fetched_at) return true;
		return Date.now() - row.last_fetched_at > intervalMs;
	}

	private updateEnrichmentSchedule(symbol: string, type: string): void {
		this.sql`INSERT INTO fetch_schedule (symbol, timeframe, last_fetched_at, status, error_count)
			VALUES (${symbol}, ${type}, ${Date.now()}, 'completed', 0)
			ON CONFLICT(symbol, timeframe) DO UPDATE SET
				last_fetched_at = ${Date.now()}, status = 'completed'`;
	}

	private reschedule(): void {
		if (!this.state.isRunning) return;
		// Re-schedule next cycle in 60 seconds
		this.schedule(new Date(Date.now() + 60_000), 'runSchedulerCycle');

		// Schedule enrichment cycle every 30 minutes
		const enrichmentRows = this.sql<{ last_fetched_at: number | null }[]>`
			SELECT last_fetched_at FROM fetch_schedule WHERE symbol = '__enrichment_cycle__' AND timeframe = 'meta'`;
		const lastEnrichment = enrichmentRows[0]?.last_fetched_at ?? 0;
		if (Date.now() - lastEnrichment > 30 * 60 * 1000) {
			this.schedule(new Date(Date.now() + 5_000), 'runEnrichmentCycle');
			this.sql`INSERT INTO fetch_schedule (symbol, timeframe, last_fetched_at, status, error_count)
				VALUES ('__enrichment_cycle__', 'meta', ${Date.now()}, 'completed', 0)
				ON CONFLICT(symbol, timeframe) DO UPDATE SET last_fetched_at = ${Date.now()}`;
		}
	}

	private buildFetchTasks(symbols: string[]): FetchTask[] {
		const now = new Date();
		const etHour = this.getETHour(now);
		const isMarketHours =
			etHour >= MARKET_OPEN_HOUR + (MARKET_OPEN_MINUTE > 0 ? 0.5 : 0) && etHour < MARKET_CLOSE_HOUR;

		const tasks: FetchTask[] = [];

		for (const symbol of symbols) {
			// Daily bars: always fetch (highest priority)
			tasks.push({ symbol, timeframe: '1Day', priority: 1 });

			if (isMarketHours) {
				// 1Hour bars: during market hours
				tasks.push({ symbol, timeframe: '1Hour', priority: 2 });
				// 15Min bars: during market hours (lowest priority)
				tasks.push({ symbol, timeframe: '15Min', priority: 3 });
			}
		}

		// Sort by priority (lowest number = highest priority)
		return tasks.sort((a, b) => a.priority - b.priority);
	}

	private shouldFetchNow(task: FetchTask): boolean {
		const rows = this.sql<{ last_fetched_at: number | null; error_count: number }[]>`
			SELECT last_fetched_at, error_count FROM fetch_schedule
			WHERE symbol = ${task.symbol} AND timeframe = ${task.timeframe}`;

		const row = rows[0];
		if (!row) {
			// Never fetched, should fetch
			this.sql`INSERT OR IGNORE INTO fetch_schedule (symbol, timeframe, status)
				VALUES (${task.symbol}, ${task.timeframe}, 'pending')`;
			return true;
		}

		// Back off on repeated errors
		if (row.error_count >= 5) return false;

		if (!row.last_fetched_at) return true;

		const elapsed = Date.now() - row.last_fetched_at;

		// Interval based on timeframe
		switch (task.timeframe) {
			case '1Day':
				return elapsed > 60 * 60 * 1000; // 1 hour between daily fetches
			case '1Hour':
				return elapsed > 60 * 60 * 1000; // 1 hour
			case '15Min':
				return elapsed > 15 * 60 * 1000; // 15 minutes
			default:
				return elapsed > 60 * 60 * 1000;
		}
	}

	private updateFetchSchedule(symbol: string, timeframe: string, fetchedAt: number): void {
		this.sql`INSERT INTO fetch_schedule (symbol, timeframe, last_fetched_at, status, error_count)
			VALUES (${symbol}, ${timeframe}, ${fetchedAt}, 'completed', 0)
			ON CONFLICT(symbol, timeframe) DO UPDATE SET
				last_fetched_at = ${fetchedAt}, status = 'completed', error_count = 0`;
	}

	private incrementErrorCount(symbol: string, timeframe: string): void {
		this.sql`INSERT INTO fetch_schedule (symbol, timeframe, status, error_count)
			VALUES (${symbol}, ${timeframe}, 'error', 1)
			ON CONFLICT(symbol, timeframe) DO UPDATE SET
				status = 'error', error_count = error_count + 1`;
	}

	private getAvailableTokens(): number {
		const rows = this.sql<{ tokens: number; last_refill_at: number }[]>`
			SELECT tokens, last_refill_at FROM rate_limiter WHERE key = 'tokens'`;
		const row = rows[0];
		if (!row) return 75;

		// Refill: 75 tokens per minute
		const elapsedMs = Date.now() - row.last_refill_at;
		const refill = (elapsedMs / 60_000) * 75;
		const newTokens = Math.min(75, row.tokens + refill);

		if (refill > 0) {
			this.sql`UPDATE rate_limiter SET tokens = ${newTokens}, last_refill_at = ${Date.now()}
				WHERE key = 'tokens'`;
		}

		return Math.floor(newTokens);
	}

	private consumeTokens(count: number): void {
		if (count === 0) return;
		this.sql`UPDATE rate_limiter SET tokens = MAX(0, tokens - ${count})
			WHERE key = 'tokens'`;
	}

	private getETHour(date: Date): number {
		// Approximate ET offset (doesn't handle DST perfectly)
		const utcHour = date.getUTCHours();
		const etOffset = -5; // EST; EDT would be -4
		return (utcHour + etOffset + 24) % 24;
	}
}
