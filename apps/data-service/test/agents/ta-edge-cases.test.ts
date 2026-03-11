import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestTaAgent } from '../harness/create-test-ta-agent';
import { sampleBars, sampleIndicators, sampleSignals } from '../harness/fixtures';
import { computeTechnicals, detectSignals } from '@repo/data-ops/providers/technicals';
import { getBarsForSymbol } from '@repo/data-ops/market-data-bars';

describe('TechnicalAnalysisAgent — edge cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(computeTechnicals).mockReturnValue(sampleIndicators);
		vi.mocked(detectSignals).mockReturnValue(sampleSignals);
		vi.mocked(getBarsForSymbol).mockResolvedValue(sampleBars);
	});

	// Test 74
	it('analyze throws when bars < minBarsRequired (50)', async () => {
		const { agent } = await createTestTaAgent();
		const fewBars = sampleBars.slice(0, 10);

		await expect(agent.analyze('1Day', fewBars)).rejects.toThrow(/10 bars/);
	});

	// Test 75
	it('getSignals returns from detected_signals DESC, limit 20', async () => {
		const { agent, db } = await createTestTaAgent();

		// Insert 25 signals manually
		for (let i = 0; i < 25; i++) {
			const ts = new Date(2024, 0, 1, 0, i).toISOString();
			db.prepare(
				'INSERT INTO detected_signals (id, type, direction, strength, description, detected_at) VALUES (?, ?, ?, ?, ?, ?)',
			).run(`sig-${i}`, `signal_${i}`, 'bullish', 0.5, `Signal ${i}`, ts);
		}

		const signals = await agent.getSignals();
		expect(signals).toHaveLength(20);
		// DESC order: latest first
		expect(signals[0]!.type).toBe('signal_24');
	});

	// Test 76
	it('getSignals with since filters by detected_at', async () => {
		const { agent, db } = await createTestTaAgent();

		const old = new Date(2024, 0, 1).toISOString();
		const recent = new Date(2024, 5, 1).toISOString();
		const cutoff = new Date(2024, 3, 1).toISOString();

		db.prepare(
			'INSERT INTO detected_signals (id, type, direction, strength, description, detected_at) VALUES (?, ?, ?, ?, ?, ?)',
		).run('old-1', 'old_signal', 'bearish', 0.3, 'Old one', old);
		db.prepare(
			'INSERT INTO detected_signals (id, type, direction, strength, description, detected_at) VALUES (?, ?, ?, ?, ?, ?)',
		).run('new-1', 'new_signal', 'bullish', 0.8, 'New one', recent);

		const signals = await agent.getSignals(cutoff);
		expect(signals).toHaveLength(1);
		expect(signals[0]!.type).toBe('new_signal');
	});

	// Test 77
	it('getIndicators returns parsed JSON', async () => {
		const { agent, db } = await createTestTaAgent();

		db.prepare('INSERT INTO indicators (key, data, computed_at) VALUES (?, ?, ?)').run(
			'latest',
			JSON.stringify(sampleIndicators),
			new Date().toISOString(),
		);

		const result = await agent.getIndicators();
		expect(result).not.toBeNull();
		expect(result!.price).toBe(150.0);
		expect(result!.rsi).toBe(55);
	});

	// Test 78
	it('getIndicators returns null when empty', async () => {
		const { agent } = await createTestTaAgent();

		const result = await agent.getIndicators();
		expect(result).toBeNull();
	});

	// Test 79
	it('scheduled analysis catches error, increments errorCount', async () => {
		const { agent } = await createTestTaAgent();

		// Make getBarsForSymbol return too few bars so analyze throws
		vi.mocked(getBarsForSymbol).mockResolvedValue(sampleBars.slice(0, 5));

		await agent.runScheduledAnalysis();

		expect(agent.state.errorCount).toBe(1);
		expect(agent.state.lastError).toContain('Insufficient data');
	});
});
