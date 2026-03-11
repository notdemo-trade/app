import { getTradingConfig } from '@repo/data-ops/trading-config';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { permissiveTradingConfig } from '../harness/fixtures';
import { insertPendingProposal } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent proposals', () => {
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

		// Use permissive config so guards don't interfere with proposal tests
		vi.mocked(getTradingConfig).mockResolvedValue(
			permissiveTradingConfig as ReturnType<typeof getTradingConfig> extends Promise<infer T>
				? T
				: never,
		);
	});

	test('getProposals returns proposals ordered by creation', () => {
		// Insert with explicit different created_at to ensure ordering
		const now = Date.now();
		const t1 = crypto.randomUUID();
		const t2 = crypto.randomUUID();
		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${t1}, 'debate', 'AAPL', 'completed', ${now})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, outcome_status)
			VALUES ('p1', ${t1}, 'AAPL', 'buy', 0.85, 'test', 150, 165, 142,
			 ${null}, 5000, 5, '[]', '[]', ${now + 900_000}, 'pending', ${now - 1000}, 'none')`;

		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${t2}, 'debate', 'TSLA', 'completed', ${now})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, outcome_status)
			VALUES ('p2', ${t2}, 'TSLA', 'buy', 0.85, 'test', 150, 165, 142,
			 ${null}, 5000, 5, '[]', '[]', ${now + 900_000}, 'pending', ${now}, 'none')`;

		const proposals = agent.getProposals();
		expect(proposals.length).toBe(2);
		// Newest first (DESC order)
		expect(proposals[0].id).toBe('p2');
		expect(proposals[1].id).toBe('p1');
	});

	test('getProposals filters by status', () => {
		insertPendingProposal(agent, { id: 'p1' });
		// Manually set one to rejected
		agent.sql`UPDATE trade_proposals SET status = 'rejected' WHERE id = 'p1'`;
		insertPendingProposal(agent, { id: 'p2' });

		const pending = agent.getProposals('pending');
		expect(pending).toHaveLength(1);
		expect(pending[0].id).toBe('p2');

		const rejected = agent.getProposals('rejected');
		expect(rejected).toHaveLength(1);
		expect(rejected[0].id).toBe('p1');
	});

	test('approveProposal transitions pending to executed', async () => {
		const proposalId = insertPendingProposal(agent, { notional: 1000 });

		const result = await agent.approveProposal(proposalId);
		expect(result.status).toBe('executed');

		expect(mocks.broker.placeOrder).toHaveBeenCalledWith(
			expect.objectContaining({ symbol: 'AAPL', side: 'buy' }),
		);

		const proposals = agent.getProposals('executed');
		expect(proposals).toHaveLength(1);
		expect(proposals[0].orderId).toBe('order-001');
	});

	test('rejectProposal transitions pending to rejected', async () => {
		const proposalId = insertPendingProposal(agent);

		const result = await agent.rejectProposal(proposalId);
		expect(result.status).toBe('rejected');

		const proposals = agent.getProposals('rejected');
		expect(proposals).toHaveLength(1);
		expect(proposals[0].decidedAt).toBeTypeOf('number');
	});

	test('approveProposal errors for non-pending proposal', async () => {
		const proposalId = insertPendingProposal(agent);
		// First reject it
		await agent.rejectProposal(proposalId);

		// Now try to approve it
		const result = await agent.approveProposal(proposalId);
		expect(result.status).toBe('error');
		expect(result.message).toContain('already rejected');
	});

	test('approveProposal auto-expires past deadline', async () => {
		const proposalId = insertPendingProposal(agent, {
			expiresAt: Date.now() - 1000, // already expired
		});

		const result = await agent.approveProposal(proposalId);
		expect(result.status).toBe('expired');
		expect(result.message).toContain('expired');
		expect(mocks.broker.placeOrder).not.toHaveBeenCalled();
	});

	test('retryProposal re-executes failed proposal', async () => {
		const proposalId = insertPendingProposal(agent, { notional: 1000 });
		// Fail it first
		mocks.broker.placeOrder.mockRejectedValueOnce(new Error('Temporary failure'));
		await agent.approveProposal(proposalId);

		// Verify it's failed
		const failed = agent.getProposals('failed');
		expect(failed).toHaveLength(1);

		// Reset mock to succeed
		mocks.broker.placeOrder.mockResolvedValue({
			id: 'order-002',
			filledQty: 10,
			filledAvgPrice: 150.0,
		});

		const result = await agent.retryProposal(proposalId);
		expect(result.status).toBe('executed');
	});

	test('expired proposals batch-expire during scheduled cycle', async () => {
		// Insert proposals that are already expired
		insertPendingProposal(agent, {
			id: 'p-expired-1',
			expiresAt: Date.now() - 10_000,
		});
		insertPendingProposal(agent, {
			id: 'p-expired-2',
			expiresAt: Date.now() - 5_000,
		});
		// One still valid
		insertPendingProposal(agent, {
			id: 'p-valid',
			expiresAt: Date.now() + 900_000,
		});

		// Enable session and trigger scheduled cycle
		await agent.start();
		await agent.runScheduledCycle();

		const expired = agent.getProposals('expired');
		expect(expired.length).toBeGreaterThanOrEqual(2);

		const pending = agent.getProposals('pending');
		expect(pending.some((p) => p.id === 'p-valid')).toBe(true);
	});
});
