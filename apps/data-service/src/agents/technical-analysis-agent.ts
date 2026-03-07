import type {
	AnalysisResult,
	Bar,
	TAAgentState,
	TechnicalIndicators,
	TechnicalSignal,
	Timeframe,
} from '@repo/data-ops/agents/ta/types';
import { initDatabase } from '@repo/data-ops/database/setup';
import { computeTechnicals, detectSignals } from '@repo/data-ops/providers/technicals';
import { insertSignal } from '@repo/data-ops/signal';
import { Agent, callable, getAgentByName } from 'agents';
import type { AlpacaMarketDataAgent } from './alpaca-market-data-agent';

interface ParsedIdentity {
	userId: string;
	symbol: string;
}

export class TechnicalAnalysisAgent extends Agent<Env, TAAgentState> {
	initialState: TAAgentState = {
		lastComputeAt: null,
		symbol: '',
		latestPrice: null,
		signalCount: 0,
		errorCount: 0,
		lastError: null,
	};

	private parsedIdentity: ParsedIdentity | null = null;

	async onStart() {
		const parts = this.name.split(':');
		const userId = parts[0] ?? '';
		const symbol = parts.slice(1).join(':');
		this.parsedIdentity = { userId, symbol };

		this.setState({ ...this.state, symbol });

		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.sql`CREATE TABLE IF NOT EXISTS bars (
			timestamp TEXT PRIMARY KEY, open REAL, high REAL, low REAL, close REAL,
			volume INTEGER, trade_count INTEGER, vwap REAL
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS indicators (
			key TEXT PRIMARY KEY DEFAULT 'latest', data TEXT NOT NULL, computed_at TEXT NOT NULL
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS detected_signals (
			id TEXT PRIMARY KEY, type TEXT, direction TEXT, strength REAL, description TEXT, detected_at TEXT
		)`;

		await this.scheduleEvery(300, 'runScheduledAnalysis');
	}

	@callable()
	async getSignals(since?: string): Promise<TechnicalSignal[]> {
		const rows = since
			? this.sql<{ type: string; direction: string; strength: number; description: string }>`
					SELECT type, direction, strength, description FROM detected_signals
					WHERE detected_at > ${since} ORDER BY detected_at DESC LIMIT 20`
			: this.sql<{ type: string; direction: string; strength: number; description: string }>`
					SELECT type, direction, strength, description FROM detected_signals
					ORDER BY detected_at DESC LIMIT 20`;
		return rows as TechnicalSignal[];
	}

	@callable()
	async getIndicators(): Promise<TechnicalIndicators | null> {
		const rows = this.sql<{ data: string }>`SELECT data FROM indicators WHERE key = 'latest'`;
		const first = rows[0];
		if (!first) return null;
		return JSON.parse(first.data) as TechnicalIndicators;
	}

	@callable()
	async analyze(timeframe: Timeframe = '1Day', bars?: Bar[]): Promise<AnalysisResult> {
		const { userId, symbol } = this.getIdentity();

		if (!bars) {
			const marketData = await getAgentByName<Env, AlpacaMarketDataAgent>(
				this.env.AlpacaMarketDataAgent,
				`${userId}:${symbol}`,
			);
			const result = await marketData.fetchBars({ symbol, timeframe, limit: 250 });
			bars = result.bars;
		}

		if (bars.length < 50) {
			throw new Error(`Insufficient data for ${symbol}: ${bars.length} bars`);
		}

		this.cacheBars(bars);

		const indicators = computeTechnicals(symbol, bars);
		const signals = detectSignals(indicators);

		this.sql`INSERT OR REPLACE INTO indicators (key, data, computed_at)
			VALUES ('latest', ${JSON.stringify(indicators)}, ${new Date().toISOString()})`;

		this.sql`DELETE FROM detected_signals`;
		for (const sig of signals) {
			const id = crypto.randomUUID();
			this
				.sql`INSERT INTO detected_signals (id, type, direction, strength, description, detected_at)
				VALUES (${id}, ${sig.type}, ${sig.direction}, ${sig.strength}, ${sig.description}, ${new Date().toISOString()})`;
		}

		for (const sig of signals) {
			await insertSignal({
				sourceAgent: 'technical_analysis',
				symbol,
				signalType: sig.type,
				direction: sig.direction,
				strength: sig.strength,
				summary: sig.description,
				metadata: { timeframe, symbol },
			});
		}

		this.setState({
			...this.state,
			lastComputeAt: new Date().toISOString(),
			latestPrice: indicators.price,
			signalCount: signals.length,
		});

		return { symbol, timeframe, indicators, signals, bars };
	}

	async runScheduledAnalysis() {
		try {
			await this.analyze('1Day');
		} catch (err) {
			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: String(err),
			});
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

	private cacheBars(bars: Bar[]) {
		for (const bar of bars) {
			this
				.sql`INSERT OR REPLACE INTO bars (timestamp, open, high, low, close, volume, trade_count, vwap)
				VALUES (${bar.t}, ${bar.o}, ${bar.h}, ${bar.l}, ${bar.c}, ${bar.v}, ${bar.n}, ${bar.vw})`;
		}
	}
}
