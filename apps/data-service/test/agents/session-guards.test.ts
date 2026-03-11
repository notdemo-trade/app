import { getTradingConfig } from '@repo/data-ops/trading-config';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { permissiveTradingConfig } from '../harness/fixtures';
import { insertPendingProposal } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent execution guards', () => {
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
	});

	// --- E1: Max notional per trade ---

	test('E1: rejects when notional > maxNotionalPerTrade', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			maxNotionalPerTrade: 5_000,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);

		const proposalId = insertPendingProposal(agent, { notional: 10_000 });
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('error');
		expect(result.message).toContain('notional');
		expect(mocks.broker.placeOrder).not.toHaveBeenCalled();
	});

	// --- E2: Max position value ---

	test('E2: rejects when notional > maxPositionValue', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			maxNotionalPerTrade: 1_000_000,
			maxPositionValue: 5_000,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);

		const proposalId = insertPendingProposal(agent, { notional: 10_000 });
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('error');
		expect(result.message).toContain('Position value');
		expect(mocks.broker.placeOrder).not.toHaveBeenCalled();
	});

	// --- E3: Max positions (buy only) ---

	test('E3: rejects buy when max positions reached', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			maxPositions: 2,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);

		// Mock broker returning 2 existing positions (at limit)
		mocks.broker.getPositions.mockResolvedValue([
			{
				symbol: 'TSLA',
				qty: 5,
				currentPrice: 200,
				marketValue: 1000,
				side: 'long',
				unrealizedPl: 0,
				unrealizedPlPct: 0,
			},
			{
				symbol: 'MSFT',
				qty: 10,
				currentPrice: 300,
				marketValue: 3000,
				side: 'long',
				unrealizedPl: 0,
				unrealizedPlPct: 0,
			},
		]);

		const proposalId = insertPendingProposal(agent, { action: 'buy' });
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('error');
		expect(result.message).toContain('positions reached');
		expect(mocks.broker.placeOrder).not.toHaveBeenCalled();
	});

	test('E3: allows sell even at max positions', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			maxPositions: 2,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);

		mocks.broker.getPositions.mockResolvedValue([
			{
				symbol: 'AAPL',
				qty: 10,
				currentPrice: 150,
				marketValue: 1500,
				side: 'long',
				unrealizedPl: 0,
				unrealizedPlPct: 0,
			},
			{
				symbol: 'MSFT',
				qty: 10,
				currentPrice: 300,
				marketValue: 3000,
				side: 'long',
				unrealizedPl: 0,
				unrealizedPlPct: 0,
			},
		]);

		const proposalId = insertPendingProposal(agent, {
			action: 'sell',
			symbol: 'AAPL',
			notional: 1000,
		});
		const result = await agent.approveProposal(proposalId);

		// Sell should proceed (E3 is buy-only guard)
		expect(result.status).toBe('executed');
		expect(mocks.broker.placeOrder).toHaveBeenCalled();
	});

	// --- E4: Short selling block ---

	test('E4: rejects sell without position when short selling disabled', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			allowShortSelling: false,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		mocks.broker.getPositions.mockResolvedValue([]);

		const proposalId = insertPendingProposal(agent, {
			action: 'sell',
			symbol: 'AAPL',
		});
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('error');
		expect(result.message).toContain('Short selling is disabled');
		expect(mocks.broker.placeOrder).not.toHaveBeenCalled();
	});

	test('E4: allows sell without position when short selling enabled', async () => {
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			allowShortSelling: true,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		mocks.broker.getPositions.mockResolvedValue([]);

		const proposalId = insertPendingProposal(agent, {
			action: 'sell',
			symbol: 'AAPL',
			notional: 1000,
		});
		const result = await agent.approveProposal(proposalId);

		expect(result.status).toBe('executed');
		expect(mocks.broker.placeOrder).toHaveBeenCalled();
	});
});
