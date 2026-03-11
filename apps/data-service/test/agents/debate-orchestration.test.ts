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

describe('DebateOrchestratorAgent — orchestration (tests 106-120)', () => {
	// Test 106
	it('onStart creates debate tables', async () => {
		const { db } = await createTestDebateAgent();
		const tables = [
			'debate_sessions', 'persona_analyses', 'debate_rounds',
			'debate_responses', 'consensus_results', 'persona_outcomes',
			'persona_scores', 'persona_patterns',
		];
		for (const table of tables) {
			const rows = db.prepare(`PRAGMA table_info(${table})`).all();
			expect(rows.length).toBeGreaterThan(0);
		}
	});

	// Test 107
	it('runDebate creates session with status completing through to completed', async () => {
		const { agent, db } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		const result = await agent.runDebate(params);

		const rows = db.prepare('SELECT * FROM debate_sessions WHERE id = ?').all(result.session.id) as { status: string }[];
		expect(rows).toHaveLength(1);
		expect(rows[0]!.status).toBe('completed');
	});

	// Test 108
	it('Phase 1: calls analyzeAsPersona per persona', async () => {
		const { agent, mockLLM } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		await agent.runDebate(params);

		expect(mockLLM.analyzeAsPersona).toHaveBeenCalledTimes(3);
	});

	// Test 109
	it('Phase 1: stores analyses in persona_analyses', async () => {
		const { agent, db } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		const result = await agent.runDebate(params);

		const rows = db.prepare('SELECT * FROM persona_analyses WHERE session_id = ?').all(result.session.id);
		expect(rows).toHaveLength(3);
	});

	// Test 110
	it('Phase 1: emits messages via onMessage', async () => {
		const { agent } = await createTestDebateAgent();
		const onMessage = vi.fn();
		const params = makeRunDebateParams({ onMessage });
		await agent.runDebate(params);

		// At minimum: 1 system "Starting" + 3 persona analyses + debate round messages + consensus
		expect(onMessage).toHaveBeenCalled();
		const personaMessages = onMessage.mock.calls.filter(
			(call: unknown[]) => (call[0] as { sender: { type: string } }).sender.type === 'persona',
		);
		expect(personaMessages.length).toBeGreaterThanOrEqual(3);
	});

	// Test 111
	it('Phase 2: runs N debate rounds', async () => {
		const { agent, mockLLM } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		await agent.runDebate(params);

		expect(mockLLM.runDebateRound).toHaveBeenCalledTimes(2);
	});

	// Test 112
	it('Phase 2: stores rounds + responses', async () => {
		const { agent, db } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		const result = await agent.runDebate(params);

		const rounds = db.prepare('SELECT * FROM debate_rounds WHERE session_id = ?').all(result.session.id);
		expect(rounds).toHaveLength(2);

		const roundIds = (rounds as { id: string }[]).map((r) => r.id);
		let totalResponses = 0;
		for (const roundId of roundIds) {
			const responses = db.prepare('SELECT * FROM debate_responses WHERE round_id = ?').all(roundId);
			totalResponses += responses.length;
		}
		// 2 rounds * 3 personas = 6 responses
		expect(totalResponses).toBe(6);
	});

	// Test 113
	it('Phase 3: calls synthesizeConsensus', async () => {
		const { agent, mockLLM } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		await agent.runDebate(params);

		expect(mockLLM.synthesizeConsensus).toHaveBeenCalledTimes(1);
	});

	// Test 114
	it('Phase 3: stores consensus result', async () => {
		const { agent, db } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		const result = await agent.runDebate(params);

		const rows = db.prepare('SELECT * FROM consensus_results WHERE session_id = ?').all(result.session.id);
		expect(rows).toHaveLength(1);
	});

	// Test 115
	it('runDebate returns completed session + consensus', async () => {
		const { agent } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		const result = await agent.runDebate(params);

		expect(result.session).toBeDefined();
		expect(result.session.id).toBeDefined();
		expect(result.session.status).toBe('completed');
		expect(result.consensus).toBeDefined();
		expect(result.consensus.action).toBe('buy');
		expect(result.consensus.confidence).toBe(0.85);
	});

	// Test 116
	it('runDebate updates state (totalDebates, activeDebateId)', async () => {
		const { agent } = await createTestDebateAgent();
		const params = makeRunDebateParams();

		expect(agent.state.totalDebates).toBe(0);
		await agent.runDebate(params);

		expect(agent.state.totalDebates).toBe(1);
		expect(agent.state.activeDebateId).toBeNull();
	});

	// Test 117
	it('runDebate on error: session failed, errorCount++', async () => {
		const debateError = new Error('LLM analysis failed');
		const { agent, db } = await createTestDebateAgent({
			analyzeAsPersona: vi.fn().mockRejectedValue(debateError),
		});
		const params = makeRunDebateParams();

		await expect(agent.runDebate(params)).rejects.toThrow('LLM analysis failed');
		expect(agent.state.errorCount).toBe(1);

		const sessions = db.prepare("SELECT * FROM debate_sessions WHERE status = 'failed'").all();
		expect(sessions).toHaveLength(1);
	});

	// Test 118
	it('runDebate re-throws original error', async () => {
		const debateError = new Error('specific-error-message');
		const { agent } = await createTestDebateAgent({
			analyzeAsPersona: vi.fn().mockRejectedValue(debateError),
		});
		const params = makeRunDebateParams();

		try {
			await agent.runDebate(params);
			expect.fail('should have thrown');
		} catch (err) {
			expect(err).toBe(debateError);
		}
	});

	// Test 119
	it('runDebate applies confidence dampening', async () => {
		const { agent, db, mockLLM } = await createTestDebateAgent();

		// Pre-insert persona_scores with poor calibration for 'aggressive' persona
		// totalProposals >= 5 triggers dampening
		const now = Date.now();
		db.prepare(`INSERT INTO persona_scores
			(persona_id, window_days, total_proposals, correct_proposals,
			 win_rate, avg_pnl_pct, stddev_pnl_pct, sharpe_ratio,
			 confidence_calibration, best_symbol, best_symbol_pnl_pct,
			 worst_symbol, worst_symbol_pnl_pct, computed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('aggressive', 30, 10, 3, 0.3, 0.01, 0.05, 0.2, 0.1, 'AAPL', 0.05, 'TSLA', -0.03, now);

		const params = makeRunDebateParams();
		await agent.runDebate(params);

		// synthesizeConsensus receives dampened analyses
		const dampenedAnalyses = mockLLM.synthesizeConsensus.mock.calls[0]![0] as { personaId: string; confidence: number }[];
		const aggressiveAnalysis = dampenedAnalyses.find((a) => a.personaId === 'aggressive');
		// calibration 0.1 → poor → 0.5x multiplier → 0.8 * 0.5 = 0.4
		expect(aggressiveAnalysis!.confidence).toBeCloseTo(0.4);
	});

	// Test 120
	it('runDebate builds persona comparison table', async () => {
		const { agent, mockLLM } = await createTestDebateAgent();
		const params = makeRunDebateParams();
		await agent.runDebate(params);

		// synthesizeConsensus 4th arg is comparison array
		const comparison = mockLLM.synthesizeConsensus.mock.calls[0]![3] as {
			personaId: string; name: string; winRate: number | null;
			avgReturn: number | null; sharpeRatio: number | null; calibration: string;
		}[];
		expect(comparison).toHaveLength(3);
		expect(comparison[0]!.personaId).toBe('aggressive');
		expect(comparison[0]!.name).toBe('Aggressive Trader');
		expect(comparison[0]).toHaveProperty('calibration');
	});
});
