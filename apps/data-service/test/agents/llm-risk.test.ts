import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestLLMAgent } from '../harness/create-test-llm-agent';
import { createMalformedComplete } from '../harness/mock-llm-provider';
import { createLLMProvider } from '@repo/data-ops/providers/llm';

const mockCreateLLMProvider = createLLMProvider as ReturnType<typeof vi.fn>;

const testRecommendation = {
	action: 'buy' as const,
	confidence: 0.8,
	rationale: 'Strong technicals',
	entry_price: 150,
	target_price: 165,
	stop_loss: 142,
	position_size_pct: 5,
	risks: ['market risk'],
};

const testPortfolio = {
	positions: [
		{
			symbol: 'AAPL',
			qty: 10,
			side: 'long',
			marketValue: 1500,
			unrealizedPl: 50,
		},
	],
	account: {
		cash: 10000,
		portfolioValue: 25000,
		buyingPower: 20000,
	},
};

describe('LLMAnalysisAgent — risk validation', () => {
	let agent: Awaited<ReturnType<typeof createTestLLMAgent>>['agent'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestLLMAgent();
		agent = harness.agent;
	});

	// Test 99
	it('validateRisk returns RiskValidation shape', async () => {
		const mockComplete = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				approved: true,
				adjustedPositionSize: 4,
				warnings: ['Concentrated position'],
				rationale: 'Risk within acceptable bounds',
			}),
			usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
		});
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.validateRisk(
			'AAPL',
			testRecommendation,
			testPortfolio,
		);

		expect(result).toMatchObject({
			approved: true,
			adjustedPositionSize: 4,
			warnings: ['Concentrated position'],
			rationale: 'Risk within acceptable bounds',
		});
	});

	// Test 100
	it('validateRisk safe defaults on parse failure', async () => {
		const mockComplete = createMalformedComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.validateRisk(
			'AAPL',
			testRecommendation,
			testPortfolio,
		);

		expect(result.approved).toBe(false);
		expect(result.warnings).toContain('Risk validation parsing error');
	});
});
