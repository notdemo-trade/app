import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestLLMAgent } from '../harness/create-test-llm-agent';
import { createMockComplete, createMalformedComplete } from '../harness/mock-llm-provider';
import { createLLMProvider } from '@repo/data-ops/providers/llm';
import { insertAnalysis } from '@repo/data-ops/llm-analysis';
import type { AnalysisRequest } from '@repo/data-ops/agents/llm/types';

const mockCreateLLMProvider = createLLMProvider as ReturnType<typeof vi.fn>;
const mockInsertAnalysis = insertAnalysis as ReturnType<typeof vi.fn>;

function makeRequest(overrides?: Partial<AnalysisRequest>): AnalysisRequest {
	return {
		symbol: 'AAPL',
		signals: [{ type: 'rsi_oversold', direction: 'bullish', strength: 0.7, source: 'ta' }],
		technicals: { rsi: 28, macd: { macd: 1, signal: 0.8, histogram: 0.2 } },
		strategy: {
			id: 'strat-1',
			name: 'default',
			riskTolerance: 'moderate',
			positionSizeBias: 0.5,
			preferredTimeframe: 'swing',
			analysisFocus: ['technical'],
		},
		...overrides,
	};
}

describe('LLMAnalysisAgent — core analysis', () => {
	let agent: Awaited<ReturnType<typeof createTestLLMAgent>>['agent'];
	let db: Awaited<ReturnType<typeof createTestLLMAgent>>['db'];
	let stateHistory: unknown[];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestLLMAgent();
		agent = harness.agent;
		db = harness.db;
		stateHistory = harness.stateHistory;
	});

	// Test 80
	it('onStart creates usage_log and provider_config tables', () => {
		const usageInfo = db.prepare("PRAGMA table_info('usage_log')").all();
		const providerInfo = db.prepare("PRAGMA table_info('provider_config')").all();

		expect(usageInfo.length).toBeGreaterThan(0);
		expect(providerInfo.length).toBeGreaterThan(0);

		const usageCols = (usageInfo as { name: string }[]).map((c) => c.name);
		expect(usageCols).toContain('id');
		expect(usageCols).toContain('symbol');
		expect(usageCols).toContain('model');
		expect(usageCols).toContain('total_tokens');
		expect(usageCols).toContain('estimated_cost_usd');

		const providerCols = (providerInfo as { name: string }[]).map((c) => c.name);
		expect(providerCols).toContain('key');
		expect(providerCols).toContain('data');
	});

	// Test 81
	it('analyze returns recommendation with all fields', async () => {
		const result = await agent.analyze(makeRequest());

		expect(result).toMatchObject({
			id: expect.any(String),
			userId: 'test-user-123',
			symbol: 'AAPL',
			timestamp: expect.any(String),
			model: expect.any(String),
			provider: expect.any(String),
		});
		expect(result.recommendation).toMatchObject({
			action: 'buy',
			confidence: 0.8,
			rationale: 'test',
		});
		expect(result.usage).toMatchObject({
			prompt_tokens: expect.any(Number),
			completion_tokens: expect.any(Number),
			total_tokens: expect.any(Number),
			estimated_cost_usd: expect.any(Number),
		});
	});

	// Test 82
	it('analyze with includeResearch makes two LLM calls', async () => {
		const mockComplete = createMockComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		await agent.analyze(makeRequest({ includeResearch: true }));

		expect(mockComplete).toHaveBeenCalledTimes(2);
	});

	// Test 83
	it('analyze logs usage to usage_log', async () => {
		await agent.analyze(makeRequest());

		const rows = db.prepare('SELECT * FROM usage_log').all() as {
			symbol: string;
			total_tokens: number;
			estimated_cost_usd: number;
		}[];
		expect(rows.length).toBe(1);
		expect(rows[0].symbol).toBe('AAPL');
		expect(rows[0].total_tokens).toBeGreaterThan(0);
		expect(rows[0].estimated_cost_usd).toBeGreaterThanOrEqual(0);
	});

	// Test 84
	it('analyze writes to PG via insertAnalysis', async () => {
		await agent.analyze(makeRequest());

		expect(mockInsertAnalysis).toHaveBeenCalledTimes(1);
		expect(mockInsertAnalysis).toHaveBeenCalledWith(
			expect.objectContaining({
				symbol: 'AAPL',
				userId: 'test-user-123',
			}),
		);
	});

	// Test 85
	it('analyze updates state (totalAnalyses, totalTokens)', async () => {
		await agent.analyze(makeRequest());

		expect(agent.state.totalAnalyses).toBe(1);
		expect(agent.state.totalTokens).toBeGreaterThan(0);
		expect(agent.state.lastAnalysisAt).not.toBeNull();
	});

	// Test 86
	it('analyze safe defaults on JSON parse failure', async () => {
		const mockComplete = createMalformedComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyze(makeRequest());

		expect(result.recommendation.action).toBe('hold');
		expect(result.recommendation.confidence).toBe(0.1);
	});

	// Test 87
	it('analyze clamps positionSizePct to [1,10]', async () => {
		// Test high value clamped to 10
		const highComplete = createMockComplete({ position_size_pct: 50 });
		mockCreateLLMProvider.mockReturnValue({ complete: highComplete });

		const highResult = await agent.analyze(makeRequest());
		expect(highResult.recommendation.position_size_pct).toBe(10);

		// Test low value: 0 is falsy so `Number(0) || 2` → 2, then Math.max(1, 2) → 2
		const lowComplete = createMockComplete({ position_size_pct: 0 });
		mockCreateLLMProvider.mockReturnValue({ complete: lowComplete });

		const lowResult = await agent.analyze(makeRequest());
		expect(lowResult.recommendation.position_size_pct).toBe(2);

		// Test explicit low value clamped to 1
		const veryLowComplete = createMockComplete({ position_size_pct: 0.5 });
		mockCreateLLMProvider.mockReturnValue({ complete: veryLowComplete });

		const veryLowResult = await agent.analyze(makeRequest());
		expect(veryLowResult.recommendation.position_size_pct).toBe(1);
	});

	// Test 88
	it('classifyEvent returns typed result', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				event_type: 'earnings',
				symbols: ['AAPL'],
				summary: 'Apple beats estimates',
				confidence: 0.9,
			}),
			usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.classifyEvent('Apple beats earnings estimates');

		expect(result).toMatchObject({
			event_type: 'earnings',
			symbols: ['AAPL'],
			summary: 'Apple beats estimates',
			confidence: 0.9,
		});
	});

	// Test 89
	it('classifyEvent clamps confidence to [0,1]', async () => {
		// High confidence clamped to 1
		const highComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({ event_type: 'earnings', symbols: [], summary: 'test', confidence: 5.0 }),
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: highComplete });

		const highResult = await agent.classifyEvent('test');
		expect(highResult.confidence).toBe(1);

		// Negative confidence clamped to 0
		const lowComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({ event_type: 'rumor', symbols: [], summary: 'test', confidence: -1 }),
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: lowComplete });

		const lowResult = await agent.classifyEvent('test');
		expect(lowResult.confidence).toBe(0);
	});

	// Test 90
	it('generateReport returns report string', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: 'This is a detailed research report on AAPL.',
			usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.generateReport('AAPL', { price: 150 });

		expect(result).toHaveProperty('report');
		expect(typeof result.report).toBe('string');
		expect(result.report).toBe('This is a detailed research report on AAPL.');
	});

	// Test 91
	it('getUsage aggregates within date range', async () => {
		const now = new Date().toISOString();
		db.prepare(
			'INSERT INTO usage_log (id, symbol, model, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		).run('u1', 'AAPL', 'gpt-4o', 'openai', 100, 50, 150, 0.005, now);
		db.prepare(
			'INSERT INTO usage_log (id, symbol, model, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		).run('u2', 'TSLA', 'gpt-4o', 'openai', 200, 100, 300, 0.010, now);

		const usage = await agent.getUsage(30);

		expect(usage.totalTokens).toBe(450);
		expect(usage.totalCostUsd).toBeCloseTo(0.015, 5);
	});

	// Test 92
	it('getUsage returns zeros when empty', async () => {
		const usage = await agent.getUsage(30);

		expect(usage.totalTokens).toBe(0);
		expect(usage.totalCostUsd).toBe(0);
	});
});
