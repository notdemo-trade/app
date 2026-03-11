import { beforeEach, describe, expect, test } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { insertExecutedProposalWithOutcome } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent outcome tracking', () => {
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

		// Must be enabled for tracking cycle to run
		await agent.start();
	});

	test('tracking cycle records snapshots for open positions', async () => {
		const { outcomeId } = insertExecutedProposalWithOutcome(agent);

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPositions.mockResolvedValue([
			{
				symbol: 'AAPL',
				qty: 10,
				currentPrice: 155,
				marketValue: 1550,
				side: 'long',
				unrealizedPl: 50,
				unrealizedPlPct: 3.33,
			},
		]);

		await agent.runOutcomeTrackingCycle();

		const snapshots = agent.getOutcomeSnapshots(outcomeId);
		expect(snapshots.length).toBeGreaterThanOrEqual(1);
		expect(snapshots[0].currentPrice).toBe(155);
		expect(snapshots[0].unrealizedPnl).toBe(50);
	});

	test('tracking cycle resolves when position no longer held', async () => {
		insertExecutedProposalWithOutcome(agent, {
			symbol: 'AAPL',
			entryPrice: 150,
		});

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		// No positions — position was closed externally
		mocks.broker.getPositions.mockResolvedValue([]);
		mocks.broker.getOrderHistory.mockResolvedValue([]);

		await agent.runOutcomeTrackingCycle();

		const tracking = agent.getOutcomes('tracking');
		expect(tracking).toHaveLength(0);

		const resolved = agent.getOutcomes('resolved');
		expect(resolved).toHaveLength(1);
		expect(resolved[0].status).toBe('resolved');
		expect(resolved[0].resolvedAt).toBeTypeOf('number');
	});

	test('stop-loss detected on long position creates exit proposal', async () => {
		insertExecutedProposalWithOutcome(agent, {
			symbol: 'AAPL',
			entryPrice: 150,
			stopLoss: 142,
			targetPrice: 165,
		});

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPositions.mockResolvedValue([
			{
				symbol: 'AAPL',
				qty: 10,
				currentPrice: 140, // below stop-loss of 142
				marketValue: 1400,
				side: 'long',
				unrealizedPl: -100,
				unrealizedPlPct: -6.67,
			},
		]);

		await agent.runOutcomeTrackingCycle();

		// Should create an exit proposal (sell) for the stop-loss
		const pending = agent.getProposals('pending');
		const exitProposal = pending.find((p) => p.symbol === 'AAPL' && p.action === 'sell');
		expect(exitProposal).toBeDefined();
		expect(exitProposal?.rationale).toContain('Stop-loss triggered');
	});

	test('target-hit detected on long position creates exit proposal', async () => {
		insertExecutedProposalWithOutcome(agent, {
			symbol: 'AAPL',
			entryPrice: 150,
			stopLoss: 142,
			targetPrice: 165,
		});

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPositions.mockResolvedValue([
			{
				symbol: 'AAPL',
				qty: 10,
				currentPrice: 170, // above target of 165
				marketValue: 1700,
				side: 'long',
				unrealizedPl: 200,
				unrealizedPlPct: 13.33,
			},
		]);

		await agent.runOutcomeTrackingCycle();

		const pending = agent.getProposals('pending');
		const exitProposal = pending.find((p) => p.symbol === 'AAPL' && p.action === 'sell');
		expect(exitProposal).toBeDefined();
		expect(exitProposal?.rationale).toContain('Target hit');
	});
});
