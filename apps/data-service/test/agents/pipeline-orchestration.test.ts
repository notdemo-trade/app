import { describe, it, expect, vi } from 'vitest';
import { getBarsForSymbol } from '@repo/data-ops/market-data-bars';
import { getEnrichmentForSymbol } from '@repo/data-ops/agents/enrichment/queries';
import { createTestPipelineAgent } from '../harness/create-test-pipeline-agent';
import { sampleBars, sampleStrategy } from '../harness/fixtures';
import type { RunPipelineParams } from '@/agents/pipeline-orchestrator-agent';

const mockedGetBars = vi.mocked(getBarsForSymbol);
const mockedGetEnrichment = vi.mocked(getEnrichmentForSymbol);

function makeRunPipelineParams(overrides?: Partial<RunPipelineParams>): RunPipelineParams {
	return {
		symbol: 'AAPL',
		strategyId: 'moderate',
		strategy: sampleStrategy,
		onMessage: vi.fn(),
		threadId: 'thread-001',
		...overrides,
	};
}

describe('PipelineOrchestratorAgent — orchestration (tests 135-153)', () => {
	beforeEach(() => {
		mockedGetBars.mockResolvedValue(sampleBars);
	});

	// Test 135
	it('onStart creates pipeline tables', async () => {
		const { db } = await createTestPipelineAgent();
		const tables = ['pipeline_sessions', 'pipeline_steps', 'pipeline_outcomes', 'pipeline_scores'];
		for (const table of tables) {
			const rows = db.prepare(`PRAGMA table_info(${table})`).all();
			expect(rows.length).toBeGreaterThan(0);
		}
	});

	// Test 136
	it('runPipeline creates session + 6 steps', async () => {
		const { agent, db } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		const sessions = db.prepare('SELECT * FROM pipeline_sessions').all();
		expect(sessions).toHaveLength(1);

		const steps = db.prepare('SELECT * FROM pipeline_steps').all();
		expect(steps).toHaveLength(6);
	});

	// Test 137
	it('Step 1: fetch_market_data calls getBarsForSymbol', async () => {
		const { agent } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		expect(mockedGetBars).toHaveBeenCalledWith('AAPL', '1Day', 200);
	});

	// Test 138
	it('Step 2: technical_analysis calls TA.analyze', async () => {
		const { agent, mockTA } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		expect(mockTA.analyze).toHaveBeenCalledWith('1Day', sampleBars);
	});

	// Test 139
	it('Step 3: fetch_enrichment skips when no dataFeeds', async () => {
		const { agent } = await createTestPipelineAgent();
		const onMessage = vi.fn();
		const params = makeRunPipelineParams({ onMessage, dataFeeds: undefined });
		await agent.runPipeline(params);

		expect(mockedGetEnrichment).not.toHaveBeenCalled();
		const skipMsg = onMessage.mock.calls.find(
			(call: unknown[]) => {
				const msg = call[0] as { content: string };
				return msg.content.toLowerCase().includes('skipping');
			},
		);
		expect(skipMsg).toBeDefined();
	});

	// Test 140
	it('Step 3: fetch_enrichment fetches when enabled', async () => {
		const { agent } = await createTestPipelineAgent();
		const params = makeRunPipelineParams({ dataFeeds: { fundamentals: true } });
		await agent.runPipeline(params);

		expect(mockedGetEnrichment).toHaveBeenCalledWith('AAPL');
	});

	// Test 141
	it('Step 4: llm_analysis calls LLM.analyze', async () => {
		const { agent, mockLLM } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		expect(mockLLM.analyze).toHaveBeenCalledTimes(1);
		const callArgs = mockLLM.analyze.mock.calls[0]!;
		const request = callArgs[0] as { symbol: string; signals: unknown[]; technicals: unknown };
		expect(request.symbol).toBe('AAPL');
		expect(request.signals).toBeDefined();
		expect(request.technicals).toBeDefined();
	});

	// Test 142
	it('Step 5: risk_validation calls LLM.validateRisk + broker', async () => {
		const { agent, mockLLM, mockBroker } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		expect(mockLLM.validateRisk).toHaveBeenCalledTimes(1);
		expect(mockBroker.getPositions).toHaveBeenCalledTimes(1);
		expect(mockBroker.getAccount).toHaveBeenCalledTimes(1);
	});

	// Test 143
	it('Step 6: generates proposal when risk approved', async () => {
		const { agent } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.proposal).not.toBeNull();
		expect(result.proposal!.symbol).toBe('AAPL');
		expect(result.proposal!.action).toBe('buy');
	});

	// Test 144
	it('Step 6: no proposal when risk rejected', async () => {
		const { agent } = await createTestPipelineAgent({
			llm: {
				validateRisk: vi.fn().mockResolvedValue({
					approved: false, adjustedPositionSize: null,
					warnings: ['too risky'], rationale: 'Rejected',
				}),
			},
		});
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.proposal).toBeNull();
	});

	// Test 145
	it('Step 6: no proposal when action is hold', async () => {
		const { agent } = await createTestPipelineAgent({
			llm: {
				analyze: vi.fn().mockResolvedValue({
					id: 'a-001', userId: 'test-user-123', symbol: 'AAPL',
					timestamp: new Date().toISOString(),
					recommendation: {
						action: 'hold', confidence: 0.85, rationale: 'hold for now',
						entry_price: 150, target_price: 165, stop_loss: 142,
						position_size_pct: 5, timeframe: 'swing', risks: [],
					},
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.005 },
					model: 'gpt-4o', provider: 'openai',
				}),
			},
		});
		const onMessage = vi.fn();
		const params = makeRunPipelineParams({ onMessage });
		const result = await agent.runPipeline(params);

		expect(result.proposal).toBeNull();
		const holdMsg = onMessage.mock.calls.find(
			(call: unknown[]) => {
				const msg = call[0] as { content: string };
				return msg.content.toLowerCase().includes('hold');
			},
		);
		expect(holdMsg).toBeDefined();
	});

	// Test 146
	it('Step 6: no proposal when confidence below threshold', async () => {
		const { agent } = await createTestPipelineAgent({
			llm: {
				analyze: vi.fn().mockResolvedValue({
					id: 'a-001', userId: 'test-user-123', symbol: 'AAPL',
					timestamp: new Date().toISOString(),
					recommendation: {
						action: 'buy', confidence: 0.5, rationale: 'weak signal',
						entry_price: 150, target_price: 165, stop_loss: 142,
						position_size_pct: 5, timeframe: 'swing', risks: [],
					},
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.005 },
					model: 'gpt-4o', provider: 'openai',
				}),
			},
		});
		const params = makeRunPipelineParams({ minConfidenceThreshold: 0.7 });
		const result = await agent.runPipeline(params);

		expect(result.proposal).toBeNull();
	});

	// Test 147
	it('Steps update status pending→running→completed', async () => {
		const { agent, db } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		const steps = db.prepare('SELECT * FROM pipeline_steps ORDER BY step_order').all() as {
			status: string; started_at: number | null; completed_at: number | null;
		}[];
		expect(steps).toHaveLength(6);
		for (const step of steps) {
			expect(step.status).toBe('completed');
			expect(step.started_at).not.toBeNull();
			expect(step.completed_at).not.toBeNull();
		}
	});

	// Test 148
	it('Emits messages per step', async () => {
		const { agent } = await createTestPipelineAgent();
		const onMessage = vi.fn();
		const params = makeRunPipelineParams({ onMessage });
		await agent.runPipeline(params);

		// At least 2 messages per step (starting + completed) → 12+ calls
		expect(onMessage.mock.calls.length).toBeGreaterThanOrEqual(12);
	});

	// Test 149
	it('Completed: session completed, state updated', async () => {
		const { agent, db } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		const sessions = db.prepare('SELECT * FROM pipeline_sessions').all() as { status: string }[];
		expect(sessions[0]!.status).toBe('completed');

		expect(agent.state.totalPipelines).toBe(1);
		expect(agent.state.activePipelineId).toBeNull();
	});

	// Test 150
	it('Failed step: session failed, proposal null', async () => {
		mockedGetBars.mockRejectedValueOnce(new Error('API error'));

		const { agent, db } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.proposal).toBeNull();
		const sessions = db.prepare('SELECT * FROM pipeline_sessions').all() as { status: string }[];
		expect(sessions[0]!.status).toBe('failed');
	});

	// Test 151
	it('Failed step: errorCount incremented', async () => {
		mockedGetBars.mockRejectedValueOnce(new Error('API error'));

		const { agent } = await createTestPipelineAgent();
		const params = makeRunPipelineParams();
		await agent.runPipeline(params);

		expect(agent.state.errorCount).toBe(1);
	});

	// Test 152
	it('Step 2 fails when no bars (empty array is truthy, TA agent throws)', async () => {
		mockedGetBars.mockResolvedValueOnce([]);

		const { agent, mockTA } = await createTestPipelineAgent({
			ta: {
				analyze: vi.fn().mockRejectedValue(new Error('Insufficient bars for analysis')),
			},
		});
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.session.status).toBe('failed');
		expect(result.proposal).toBeNull();
	});

	// Test 153
	it('Step 4 fails when no signals', async () => {
		const { agent } = await createTestPipelineAgent({
			ta: {
				analyze: vi.fn().mockResolvedValue({
					symbol: 'AAPL', timeframe: '1Day',
					indicators: null,
					signals: null,
					bars: sampleBars,
				}),
			},
		});
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.session.status).toBe('failed');
		expect(result.proposal).toBeNull();
	});
});
