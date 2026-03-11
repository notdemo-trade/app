import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestLLMAgent } from '../harness/create-test-llm-agent';
import { createMockComplete } from '../harness/mock-llm-provider';
import { createLLMProvider } from '@repo/data-ops/providers/llm';
import { getCredential } from '@repo/data-ops/credential';
import type { AnalysisRequest } from '@repo/data-ops/agents/llm/types';

const mockCreateLLMProvider = createLLMProvider as ReturnType<typeof vi.fn>;
const mockGetCredential = getCredential as ReturnType<typeof vi.fn>;

function makeRequest(): AnalysisRequest {
	return {
		symbol: 'AAPL',
		signals: [],
		technicals: {},
		strategy: {
			id: 'strat-1',
			name: 'default',
			riskTolerance: 'moderate',
			positionSizeBias: 0.5,
			preferredTimeframe: 'swing',
			analysisFocus: ['technical'],
		},
	};
}

describe('LLMAnalysisAgent — provider config', () => {
	let agent: Awaited<ReturnType<typeof createTestLLMAgent>>['agent'];
	let db: Awaited<ReturnType<typeof createTestLLMAgent>>['db'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestLLMAgent();
		agent = harness.agent;
		db = harness.db;
	});

	// Test 101
	it('setProviderConfig persists to table', async () => {
		await agent.setProviderConfig({ provider: 'openai', model: 'gpt-4o' });

		const rows = db.prepare('SELECT * FROM provider_config').all() as { key: string; data: string }[];
		expect(rows.length).toBe(1);
		expect(rows[0].key).toBe('main');

		const data = JSON.parse(rows[0].data);
		expect(data.provider).toBe('openai');
		expect(data.model).toBe('gpt-4o');
	});

	// Test 102
	it('provider resolution: cached config first', async () => {
		// Insert a cached provider config
		db.prepare(
			"INSERT INTO provider_config (key, data) VALUES ('main', ?)",
		).run(JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' }));

		mockGetCredential.mockResolvedValue({ apiKey: 'test-anthropic-key' });
		const mockComplete = createMockComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyze(makeRequest());

		expect(result.provider).toBe('anthropic');
		expect(result.model).toBe('claude-sonnet-4-20250514');
		expect(mockGetCredential).toHaveBeenCalledWith(
			expect.objectContaining({ provider: 'anthropic' }),
		);
	});

	// Test 103
	it('provider resolution: falls to workers-ai last', async () => {
		// No cached config, all credentials return null
		mockGetCredential.mockResolvedValue(null);
		const mockComplete = createMockComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyze(makeRequest());

		// workers-ai is the last provider in the loop and always succeeds
		expect(result.provider).toBe('workers-ai');
	});

	// Test 104
	it('provider resolution uses workers-ai as ultimate fallback', async () => {
		// No cached config, all credentials null
		mockGetCredential.mockResolvedValue(null);
		const mockComplete = createMockComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyze(makeRequest());

		expect(result.provider).toBe('workers-ai');
		expect(result.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
	});

	// Test 105
	it('cached config with workers-ai provider uses AI binding', async () => {
		// Insert cached workers-ai config
		db.prepare(
			"INSERT INTO provider_config (key, data) VALUES ('main', ?)",
		).run(JSON.stringify({ provider: 'workers-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }));

		const mockComplete = createMockComplete();
		mockCreateLLMProvider.mockReturnValue({ complete: mockComplete });

		const result = await agent.analyze(makeRequest());

		expect(result.provider).toBe('workers-ai');
		// Verify createLLMProvider was called with aiBinding
		expect(mockCreateLLMProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: 'workers-ai',
				aiBinding: expect.anything(),
			}),
		);
	});
});
