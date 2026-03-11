import { getTradingConfig } from '@repo/data-ops/trading-config';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { permissiveTradingConfig } from '../harness/fixtures';
import { insertPendingProposal } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent trade execution', () => {
	let agent: SessionAgent;
	let mocks: Awaited<ReturnType<typeof createTestAgent>>['mocks'];

	beforeEach(async () => {
		clearMockRegistry();
		const result = await createTestAgent();
		agent = result.agent;
		mocks = result.mocks;
		registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker);
		registerMockAgent(agent.env.DebateOrchestratorAgent, mocks.debate);
		registerMockAgent(agent.env.PipelineOrchestratorAgent, mocks.pipeline);

		vi.mocked(getTradingConfig).mockResolvedValue(
			permissiveTradingConfig as ReturnType<typeof getTradingConfig> extends Promise<infer T>
				? T
				: never,
		);
	});

	test('execution stores order details on proposal', async () => {
		const proposalId = insertPendingProposal(agent, { notional: 1000 });

		await agent.approveProposal(proposalId);

		const proposals = agent.getProposals('executed');
		expect(proposals).toHaveLength(1);
		expect(proposals[0].orderId).toBe('order-001');
		expect(proposals[0].filledQty).toBe(10);
		expect(proposals[0].filledAvgPrice).toBe(150);
	});

	test('execution creates outcome tracking record', async () => {
		const proposalId = insertPendingProposal(agent, { notional: 1000 });

		await agent.approveProposal(proposalId);

		const outcomes = agent.getOutcomes('tracking');
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].symbol).toBe('AAPL');
		expect(outcomes[0].action).toBe('buy');
		expect(outcomes[0].entryPrice).toBe(150); // filledAvgPrice from mock
		expect(outcomes[0].entryQty).toBe(10);
		expect(outcomes[0].status).toBe('tracking');
	});

	test('failed execution sets proposal status to failed', async () => {
		mocks.broker.placeOrder.mockRejectedValue(new Error('Insufficient funds'));

		const proposalId = insertPendingProposal(agent);
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('failed');
		expect(result.message).toContain('Insufficient funds');

		const proposals = agent.getProposals('failed');
		expect(proposals).toHaveLength(1);
	});

	test('notional computed from positionSizePct when no qty or notional', async () => {
		// Insert a proposal with no qty and no notional, only positionSizePct
		const proposalId = insertPendingProposal(agent, {
			qty: null,
			notional: null,
			positionSizePct: 10, // 10% of cash
		});

		// Mock account with $100,000 cash
		mocks.broker.getAccount.mockResolvedValue({
			cash: 100_000,
			portfolioValue: 100_000,
			buyingPower: 200_000,
		});

		await agent.approveProposal(proposalId);

		// placeOrder should be called with notional = 100000 * 10/100 = 10000
		expect(mocks.broker.placeOrder).toHaveBeenCalledWith(
			expect.objectContaining({
				notional: 10_000,
			}),
		);
	});
});
