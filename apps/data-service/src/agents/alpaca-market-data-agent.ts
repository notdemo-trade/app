import type {
	AlpacaMarketDataAgentState,
	MarketDataFetchParams,
	MarketDataResult,
} from '@repo/data-ops/agents/market-data/types';
import type { Bar } from '@repo/data-ops/agents/ta/types';
import {
	AlpacaMarketDataProvider,
	getAlpacaMarketDataConfig,
} from '@repo/data-ops/providers/alpaca';
import { Agent } from 'agents';

interface ParsedIdentity {
	userId: string;
	symbol: string;
}

const DEFAULT_CACHE_FRESHNESS_MS = 60_000;

export class AlpacaMarketDataAgent extends Agent<Env, AlpacaMarketDataAgentState> {
	initialState: AlpacaMarketDataAgentState = {
		lastFetchAt: null,
		barCount: 0,
		errorCount: 0,
		lastError: null,
	};

	private parsedIdentity: ParsedIdentity | null = null;

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

	async fetchBars(
		params: MarketDataFetchParams & { cacheFreshnessSec?: number },
	): Promise<MarketDataResult> {
		const { symbol, timeframe, limit = 250 } = params;

		const cacheFreshnessMs = (params.cacheFreshnessSec ?? 60) * 1000;
		const cached = this.getCachedIfFresh(symbol, timeframe, cacheFreshnessMs);
		if (cached) return cached;

		const { userId } = this.getIdentity();
		const provider = await this.createProvider(userId);
		const bars = await provider.getBars(symbol, timeframe, {
			limit,
			adjustment: 'split',
			start: params.start,
			end: params.end,
		});

		const now = Date.now();
		this.cacheBars(symbol, timeframe, bars, now);

		this.sql`INSERT INTO fetch_log (symbol, timeframe, bar_count, fetched_at)
			VALUES (${symbol}, ${timeframe}, ${bars.length}, ${now})`;

		this.setState({
			...this.state,
			lastFetchAt: now,
			barCount: this.state.barCount + bars.length,
		});

		return { symbol, timeframe, bars, fetchedAt: now };
	}

	async getLatestBars(symbol: string, timeframe: string, limit: number): Promise<Bar[]> {
		return this.sql<Bar>`
			SELECT t, o, h, l, c, v, n, vw FROM bars
			WHERE symbol = ${symbol} AND timeframe = ${timeframe}
			ORDER BY t DESC LIMIT ${limit}
		`;
	}

	private getCachedIfFresh(
		symbol: string,
		timeframe: string,
		cacheFreshnessMs: number = DEFAULT_CACHE_FRESHNESS_MS,
	): MarketDataResult | null {
		const rows = this.sql<{ fetched_at: number }>`
			SELECT fetched_at FROM fetch_log
			WHERE symbol = ${symbol} AND timeframe = ${timeframe}
			ORDER BY fetched_at DESC LIMIT 1
		`;
		const latest = rows[0];
		if (!latest || Date.now() - latest.fetched_at > cacheFreshnessMs) return null;

		const bars = this.sql<Bar>`
			SELECT t, o, h, l, c, v, n, vw FROM bars
			WHERE symbol = ${symbol} AND timeframe = ${timeframe}
			ORDER BY t DESC
		`;
		if (bars.length === 0) return null;

		return {
			symbol,
			timeframe: timeframe as MarketDataResult['timeframe'],
			bars,
			fetchedAt: latest.fetched_at,
		};
	}

	private cacheBars(symbol: string, timeframe: string, bars: Bar[], fetchedAt: number) {
		for (const bar of bars) {
			this.sql`INSERT OR REPLACE INTO bars (symbol, timeframe, t, o, h, l, c, v, n, vw, fetched_at)
				VALUES (${symbol}, ${timeframe}, ${bar.t}, ${bar.o}, ${bar.h}, ${bar.l}, ${bar.c}, ${bar.v}, ${bar.n}, ${bar.vw}, ${fetchedAt})`;
		}
	}

	private getIdentity(): ParsedIdentity {
		if (!this.parsedIdentity) {
			const parts = this.name.split(':');
			this.parsedIdentity = {
				userId: parts[0] ?? '',
				symbol: parts.slice(1).join(':'),
			};
		}
		return this.parsedIdentity;
	}

	private async createProvider(userId: string): Promise<AlpacaMarketDataProvider> {
		const config = await getAlpacaMarketDataConfig(userId, this.env.CREDENTIALS_ENCRYPTION_KEY);
		if (!config) throw new Error('Alpaca credentials not configured');
		return new AlpacaMarketDataProvider(config);
	}
}
