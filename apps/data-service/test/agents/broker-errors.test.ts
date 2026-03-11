import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestBrokerAgent } from '../harness/create-test-broker-agent';
import { getCredential } from '@repo/data-ops/credential';
import { _mockRequest } from '@repo/data-ops/providers/alpaca';

describe('AlpacaBrokerAgent errors', () => {
	let agent: Awaited<ReturnType<typeof createTestBrokerAgent>>['agent'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestBrokerAgent();
		agent = harness.agent;
	});

	// Test 62
	it('getAccount throws when credentials missing', async () => {
		vi.mocked(getCredential).mockResolvedValueOnce(null);

		await expect(agent.getAccount()).rejects.toThrow('Alpaca credentials not configured');
	});

	// Test 63
	it('placeOrder propagates API error', async () => {
		vi.mocked(_mockRequest).mockRejectedValue(new Error('insufficient buying power'));

		await expect(
			agent.placeOrder({
				symbol: 'AAPL',
				side: 'buy',
				type: 'market',
				qty: 999999,
				timeInForce: 'day',
			})
		).rejects.toThrow('insufficient buying power');
	});
});
