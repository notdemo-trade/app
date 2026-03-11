import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestLLMAgent } from '../harness/create-test-llm-agent';
import { createMockComplete, createMalformedComplete } from '../harness/mock-llm-provider';
import { createLLMProvider } from '@repo/data-ops/providers/llm';
import type { PersonaConfig } from '@repo/data-ops/agents/debate/types';
import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';

const mockCreateLLMProvider = createLLMProvider as ReturnType<typeof vi.fn>;

const testStrategy: StrategyTemplate = {
	id: 'strat-1',
	name: 'default',
	riskTolerance: 'moderate',
	positionSizeBias: 0.5,
	preferredTimeframe: 'swing',
	analysisFocus: ['technical'],
};

function makePersona(id: string): PersonaConfig {
	return {
		id,
		name: `Persona ${id}`,
		role: 'analyst',
		systemPrompt: `You are persona ${id}`,
		bias: 'neutral',
	};
}

describe('LLMAnalysisAgent — persona analysis', () => {
	let agent: Awaited<ReturnType<typeof createTestLLMAgent>>['agent'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestLLMAgent();
		agent = harness.agent;
	});

	// Test 93
	it('analyzeAsPersona safe defaults on parse failure', async () => {
		const mockComplete = createMalformedComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyzeAsPersona(
			makePersona('p1'),
			{ symbol: 'AAPL', signals: [], indicators: {} },
			testStrategy,
		);

		expect(result.action).toBe('hold');
		expect(result.confidence).toBe(0.1);
		expect(result.rationale).toContain('Failed');
	});

	// Test 94
	it('analyzeAsPersona validates action to buy/sell/hold', async () => {
		const mockComplete = createMockComplete({ action: 'yolo' });
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyzeAsPersona(
			makePersona('p1'),
			{ symbol: 'AAPL', signals: [], indicators: {} },
			testStrategy,
		);

		expect(result.action).toBe('hold');
	});

	// Test 95
	it('runDebateRound calls LLM for each persona', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				revisedAction: 'buy',
				revisedConfidence: 0.7,
				content: 'I agree with the analysis',
			}),
			usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const personas = [makePersona('p1'), makePersona('p2'), makePersona('p3')];
		const analyses = personas.map((p) => ({
			personaId: p.id,
			action: 'buy' as const,
			confidence: 0.7,
			rationale: 'test',
			keyPoints: ['point 1'],
		}));

		await agent.runDebateRound(
			{ analyses, previousRounds: [] },
			1,
			personas,
		);

		expect(mockComplete).toHaveBeenCalledTimes(3);
	});

	// Test 96
	it('runDebateRound returns DebateRound shape', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				revisedAction: 'buy',
				revisedConfidence: 0.75,
				content: 'Revised analysis',
			}),
			usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const personas = [makePersona('p1'), makePersona('p2')];
		const analyses = personas.map((p) => ({
			personaId: p.id,
			action: 'hold' as const,
			confidence: 0.6,
			rationale: 'initial',
			keyPoints: [],
		}));

		const round = await agent.runDebateRound(
			{ analyses, previousRounds: [] },
			2,
			personas,
		);

		expect(round.roundNumber).toBe(2);
		expect(round.responses).toHaveLength(2);
		expect(round.responses[0]).toMatchObject({
			personaId: 'p1',
			respondingTo: expect.any(Array),
			content: expect.any(String),
			revisedConfidence: expect.any(Number),
			revisedAction: expect.any(String),
		});
	});

	// Test 97
	it('synthesizeConsensus normalizes positionSizePct', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				action: 'buy',
				confidence: 0.8,
				rationale: 'consensus reached',
				positionSizePct: 0.05,
				entryPrice: 150,
				targetPrice: 165,
				stopLoss: 142,
				risks: ['market risk'],
			}),
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.synthesizeConsensus(
			[{ personaId: 'p1', action: 'buy', confidence: 0.8, rationale: 'bullish', keyPoints: [] }],
			[],
			'Moderate moderator prompt',
		);

		// 0.05 is < 1, so normalizePositionSizePct multiplies by 100 → 5
		expect(result.positionSizePct).toBe(5);
	});

	// Test 98
	it('synthesizeConsensus safe defaults on parse failure', async () => {
		const mockComplete = createMalformedComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.synthesizeConsensus(
			[{ personaId: 'p1', action: 'buy', confidence: 0.8, rationale: 'test', keyPoints: [] }],
			[],
			'Moderate prompt',
		);

		expect(result.action).toBe('hold');
		expect(result.confidence).toBe(0.1);
	});
});
