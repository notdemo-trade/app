import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestTaAgent } from '../harness/create-test-ta-agent';
import { sampleBars, sampleIndicators, sampleSignals } from '../harness/fixtures';
import { getBarsForSymbol } from '@repo/data-ops/market-data-bars';
import { computeTechnicals, detectSignals } from '@repo/data-ops/providers/technicals';
import { insertSignal } from '@repo/data-ops/signal';
import { getTaConfig } from '@repo/data-ops/ta-config';

describe('TechnicalAnalysisAgent — analysis', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(computeTechnicals).mockReturnValue(sampleIndicators);
		vi.mocked(detectSignals).mockReturnValue(sampleSignals);
		vi.mocked(getBarsForSymbol).mockResolvedValue(sampleBars);
	});

	// Test 64
	it('onStart parses userId:symbol from name, creates tables', async () => {
		const { agent, db } = await createTestTaAgent();

		expect(agent.state.symbol).toBe('AAPL');

		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all() as { name: string }[];
		const tableNames = tables.map((t) => t.name);

		expect(tableNames).toContain('bars');
		expect(tableNames).toContain('indicators');
		expect(tableNames).toContain('detected_signals');
	});

	// Test 65
	it('onStart schedules analysis every 300s', async () => {
		const { schedules } = await createTestTaAgent();

		const recurring = schedules.find(
			(s) => s.type === 'every' && s.callback === 'runScheduledAnalysis',
		);
		expect(recurring).toBeDefined();
		expect(recurring!.when).toBe(300);
	});

	// Test 66
	it('analyze computes and stores indicators', async () => {
		const { agent, db } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		const rows = db.prepare('SELECT * FROM indicators').all() as { key: string; data: string }[];
		expect(rows).toHaveLength(1);
		expect(rows[0]!.key).toBe('latest');

		const parsed = JSON.parse(rows[0]!.data);
		expect(parsed.price).toBe(150.0);
		expect(parsed.rsi).toBe(55);
	});

	// Test 67
	it('analyze stores signals in detected_signals', async () => {
		const { agent, db } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		const rows = db.prepare('SELECT * FROM detected_signals').all() as {
			type: string;
			direction: string;
		}[];
		expect(rows).toHaveLength(sampleSignals.length);
		expect(rows.map((r) => r.type)).toContain('rsi_oversold');
		expect(rows.map((r) => r.type)).toContain('macd_crossover');
	});

	// Test 68
	it('analyze caches bars in bars table', async () => {
		const { agent, db } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		const rows = db.prepare('SELECT COUNT(*) as cnt FROM bars').all() as { cnt: number }[];
		expect(rows[0]!.cnt).toBe(sampleBars.length);
	});

	// Test 69
	it('analyze writes signals to PostgreSQL via insertSignal', async () => {
		const { agent } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		expect(insertSignal).toHaveBeenCalledTimes(sampleSignals.length);
		expect(insertSignal).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceAgent: 'technical_analysis',
				symbol: 'AAPL',
				signalType: 'rsi_oversold',
				direction: 'bullish',
				strength: 0.7,
				summary: 'RSI below 30',
			}),
		);
	});

	// Test 70
	it('analyze updates state (lastComputeAt, signalCount)', async () => {
		const { agent } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		expect(typeof agent.state.lastComputeAt).toBe('string');
		expect(agent.state.signalCount).toBe(sampleSignals.length);
		expect(agent.state.latestPrice).toBe(150.0);
	});

	// Test 71
	it('analyze returns AnalysisResult with all fields', async () => {
		const { agent } = await createTestTaAgent();

		const result = await agent.analyze('1Day', sampleBars);

		expect(result.symbol).toBe('AAPL');
		expect(result.timeframe).toBe('1Day');
		expect(result.indicators).toEqual(sampleIndicators);
		expect(result.signals).toEqual(sampleSignals);
		expect(result.bars).toEqual(sampleBars);
	});

	// Test 72
	it('analyze with configOverride skips getTaConfig', async () => {
		const { agent } = await createTestTaAgent();

		const customConfig = {
			profileName: 'custom',
			smaPeriods: [20, 50, 200],
			emaPeriods: [12, 26],
			rsiPeriod: 14,
			bollingerPeriod: 20,
			bollingerStdDev: 2,
			atrPeriod: 14,
			volumeSmaPeriod: 20,
			macdSignalPeriod: 9,
			rsiOversold: 30,
			rsiOverbought: 70,
			volumeSpikeMultiplier: 2.0,
			minBarsRequired: 50,
			defaultBarsToFetch: 250,
			cacheFreshnessSec: 60,
		};

		await agent.analyze('1Day', sampleBars, customConfig);

		expect(getTaConfig).not.toHaveBeenCalled();
	});

	// Test 73
	it('analyze with pre-supplied bars skips fetch', async () => {
		const { agent } = await createTestTaAgent();

		await agent.analyze('1Day', sampleBars);

		expect(getBarsForSymbol).not.toHaveBeenCalled();
	});
});
