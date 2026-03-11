import { describe, it, expect, vi } from 'vitest';
import { createTestDebateAgent } from '../harness/create-test-debate-agent';
import { sampleDebateConfig, sampleIndicators, sampleSignals } from '../harness/fixtures';
import type { RunDebateParams } from '@/agents/debate-orchestrator-agent';
import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';

const testStrategy: StrategyTemplate = {
	id: 'test-strategy', name: 'Test Strategy',
	riskTolerance: 'moderate', positionSizeBias: 0.05,
	preferredTimeframe: 'swing', analysisFocus: ['momentum'],
};

function makeRunDebateParams(overrides?: Partial<RunDebateParams>): RunDebateParams {
	return {
		symbol: 'AAPL',
		signals: sampleSignals,
		indicators: sampleIndicators,
		strategy: testStrategy,
		config: sampleDebateConfig,
		onMessage: vi.fn(),
		...overrides,
	};
}

async function runDebateAndRecord(
	agent: ReturnType<typeof createTestDebateAgent> extends Promise<infer T> ? T : never,
	outcome: { symbol?: string; realizedPnl?: number; realizedPnlPct?: number; action?: string },
) {
	const params = makeRunDebateParams();
	const result = await agent.agent.runDebate(params);
	await agent.agent.recordPersonaOutcome('proposal-001', result.session.id, {
		symbol: outcome.symbol ?? 'AAPL',
		realizedPnl: outcome.realizedPnl ?? 100,
		realizedPnlPct: outcome.realizedPnlPct ?? 0.05,
		action: outcome.action ?? 'buy',
	});
	return result;
}

describe('DebateOrchestratorAgent — outcomes (tests 121-127)', () => {
	// Test 121
	it('recordPersonaOutcome inserts for all personas', async () => {
		const ctx = await createTestDebateAgent();
		await runDebateAndRecord(ctx, { realizedPnlPct: 0.05 });

		const rows = ctx.db.prepare('SELECT * FROM persona_outcomes').all();
		// 3 personas → 3 outcome rows
		expect(rows).toHaveLength(3);
	});

	// Test 122
	it('evaluateCorrectness: buy correct when pnl > 0', async () => {
		const ctx = await createTestDebateAgent();
		// Mock returns action: 'buy' by default
		await runDebateAndRecord(ctx, { realizedPnlPct: 0.05 });

		const rows = ctx.db.prepare('SELECT was_correct FROM persona_outcomes').all() as { was_correct: number }[];
		// All personas had action 'buy', pnl > 0 → was_correct = 1
		for (const row of rows) {
			expect(row.was_correct).toBe(1);
		}
	});

	// Test 123
	it('evaluateCorrectness: hold correct when abs(pnl) < threshold', async () => {
		const ctx = await createTestDebateAgent({
			analyzeAsPersona: vi.fn().mockImplementation(async (persona: { id: string; name: string }) => ({
				personaId: persona.id,
				action: 'hold',
				confidence: 0.8,
				rationale: `${persona.name} analysis`,
				keyPoints: ['point 1'],
			})),
		});

		await runDebateAndRecord(ctx, { realizedPnlPct: 0.005 });

		const rows = ctx.db.prepare('SELECT was_correct FROM persona_outcomes').all() as { was_correct: number }[];
		for (const row of rows) {
			expect(row.was_correct).toBe(1);
		}
	});

	// Test 124
	it('recordPersonaOutcome triggers recomputeScores', async () => {
		const ctx = await createTestDebateAgent();
		await runDebateAndRecord(ctx, { realizedPnlPct: 0.05 });

		const scoreRows = ctx.db.prepare('SELECT * FROM persona_scores').all() as { persona_id: string; window_days: number }[];
		// 3 personas × 3 windows (30, 90, 180) = 9 rows
		expect(scoreRows.length).toBeGreaterThanOrEqual(3);

		// Check all three window sizes exist
		const windows = [...new Set(scoreRows.map((r) => r.window_days))];
		expect(windows).toEqual(expect.arrayContaining([30, 90, 180]));
	});

	// Test 125
	it('getPersonaScores returns for windowDays', async () => {
		const ctx = await createTestDebateAgent();
		const now = Date.now();

		// Pre-insert scores
		ctx.db.prepare(`INSERT INTO persona_scores
			(persona_id, window_days, total_proposals, correct_proposals,
			 win_rate, avg_pnl_pct, stddev_pnl_pct, sharpe_ratio,
			 confidence_calibration, best_symbol, best_symbol_pnl_pct,
			 worst_symbol, worst_symbol_pnl_pct, computed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('aggressive', 30, 10, 7, 0.7, 0.03, 0.02, 1.5, 0.6, 'AAPL', 0.05, 'TSLA', -0.01, now);

		const scores = ctx.agent.getPersonaScores(30);
		expect(scores).toHaveLength(1);
		expect(scores[0]!.personaId).toBe('aggressive');
		expect(scores[0]!.winRate).toBe(0.7);
		expect(scores[0]!.windowDays).toBe(30);
	});

	// Test 126
	it('getPersonaPatterns filters by personaId', async () => {
		const ctx = await createTestDebateAgent();
		const now = Date.now();

		ctx.db.prepare(`INSERT INTO persona_patterns
			(id, persona_id, pattern_type, pattern_key, description, sample_size, success_rate, avg_pnl_pct, last_updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('p1', 'aggressive', 'symbol', 'AAPL', 'desc', 10, 0.7, 0.03, now);
		ctx.db.prepare(`INSERT INTO persona_patterns
			(id, persona_id, pattern_type, pattern_key, description, sample_size, success_rate, avg_pnl_pct, last_updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('p2', 'conservative', 'symbol', 'TSLA', 'desc', 8, 0.5, 0.01, now);

		const patterns = ctx.agent.getPersonaPatterns('aggressive');
		expect(patterns).toHaveLength(1);
		expect(patterns[0]!.personaId).toBe('aggressive');
	});

	// Test 127
	it('getPersonaPatterns with symbol filter', async () => {
		const ctx = await createTestDebateAgent();
		const now = Date.now();

		ctx.db.prepare(`INSERT INTO persona_patterns
			(id, persona_id, pattern_type, pattern_key, description, sample_size, success_rate, avg_pnl_pct, last_updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('p1', 'aggressive', 'symbol', 'AAPL', 'desc', 10, 0.7, 0.03, now);
		ctx.db.prepare(`INSERT INTO persona_patterns
			(id, persona_id, pattern_type, pattern_key, description, sample_size, success_rate, avg_pnl_pct, last_updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('p2', 'aggressive', 'symbol', 'TSLA', 'desc', 8, 0.5, 0.01, now);
		ctx.db.prepare(`INSERT INTO persona_patterns
			(id, persona_id, pattern_type, pattern_key, description, sample_size, success_rate, avg_pnl_pct, last_updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('p3', 'aggressive', 'indicator_outcome', 'action:buy', 'desc', 12, 0.6, 0.02, now);

		const patterns = ctx.agent.getPersonaPatterns('aggressive', 'AAPL');
		// Should return: symbol=AAPL (not TSLA) + non-symbol patterns (indicator_outcome)
		expect(patterns).toHaveLength(2);
		const keys = patterns.map((p) => p.patternKey);
		expect(keys).toContain('AAPL');
		expect(keys).not.toContain('TSLA');
		expect(keys).toContain('action:buy');
	});
});
