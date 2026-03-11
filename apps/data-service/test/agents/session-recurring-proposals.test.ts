import { getTradingConfig } from '@repo/data-ops/trading-config';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { permissiveTradingConfig } from '../harness/fixtures';
import { clearMockRegistry, registerMockAgent } from '../setup';

/**
 * Bug: recurring scheduled cycles only produce a proposal on the first cycle.
 * Root cause: runScheduledCycle calls triggerAnalysis() THEN expireProposals(),
 * so expired proposals still have status='pending' when the dedup guard checks.
 */
describe('SessionAgent recurring proposals', () => {
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
		registerMockAgent(agent.env.TechnicalAnalysisAgent, {
			analyze: vi.fn().mockResolvedValue({ signals: [], indicators: {} }),
		});

		vi.mocked(getTradingConfig).mockResolvedValue(
			permissiveTradingConfig as ReturnType<typeof getTradingConfig> extends Promise<infer T>
				? T
				: never,
		);
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
	});

	test('debate: expired proposal should not block next scheduled cycle', async () => {
		await agent.updateConfig({
			orchestrationMode: 'debate',
			watchlistSymbols: ['AAPL'],
			proposalTimeoutSec: 60,
		});
		await agent.start();

		// Cycle 1 — produces proposal
		await agent.runScheduledCycle();
		const pending = agent.getProposals('pending');
		expect(pending).toHaveLength(1);
		expect(mocks.debate.runDebate).toHaveBeenCalledTimes(1);

		// Simulate time passing: proposal is now past its expiry
		agent.sql`UPDATE trade_proposals SET expires_at = ${Date.now() - 1000} WHERE id = ${pending[0].id}`;

		// Cycle 2 — should expire old proposal AND produce a new one
		// BUG: expireProposals() runs AFTER triggerAnalysis(), so dedup guard
		// sees the still-pending proposal and skips analysis
		await agent.runScheduledCycle();

		expect(agent.getProposals('expired')).toHaveLength(1);
		const newPending = agent.getProposals('pending');
		expect(newPending).toHaveLength(1);
		expect(newPending[0].id).not.toBe(pending[0].id);
		expect(mocks.debate.runDebate).toHaveBeenCalledTimes(2);
	});

	test('pipeline: expired proposal should not block next scheduled cycle', async () => {
		// Pipeline mode — debate orchestrator won't be called
		await agent.updateConfig({
			orchestrationMode: 'pipeline',
			watchlistSymbols: ['AAPL'],
			proposalTimeoutSec: 60,
		});
		await agent.start();

		// Manually insert a pending proposal (pipeline mock returns proposal:null by default)
		const proposalId = crypto.randomUUID();
		const threadId = crypto.randomUUID();
		const now = Date.now();
		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${threadId}, 'pipeline', 'AAPL', 'completed', ${now})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
			 outcome_status, orchestrator_session_id)
			VALUES (${proposalId}, ${threadId}, 'AAPL', 'buy', 0.85, 'test', 150, 165, 142,
			 ${null}, 5000, 5, '[]', '[]', ${now - 1000}, 'pending', ${now - 60000}, 'none', 'orch-001')`;
		agent.sql`UPDATE discussion_threads SET proposal_id = ${proposalId} WHERE id = ${threadId}`;

		// Verify proposal exists and is expired-eligible
		expect(agent.getProposals('pending')).toHaveLength(1);

		// Cycle — should expire the old proposal and allow pipeline to run
		await agent.runScheduledCycle();

		// Old proposal should be expired
		expect(agent.getProposals('expired')).toHaveLength(1);

		// Pipeline orchestrator should have been called (not blocked by dedup)
		expect(mocks.pipeline.runPipeline).toHaveBeenCalledTimes(1);
	});

	// --- Dedup guard should ignore expired proposals even without expireProposals() ---

	test('debate: triggerAnalysis ignores past-expiry proposals in dedup guard', async () => {
		await agent.updateConfig({
			orchestrationMode: 'debate',
			watchlistSymbols: ['AAPL'],
			proposalTimeoutSec: 60,
		});

		// Cycle 1 — produces proposal via triggerAnalysis (no expireProposals call)
		const cycle1 = await agent.triggerAnalysis();
		expect(cycle1.threadIds).toHaveLength(1);
		const pending = agent.getProposals('pending');
		expect(pending).toHaveLength(1);

		// Proposal is past its expiry but status is still 'pending'
		agent.sql`UPDATE trade_proposals SET expires_at = ${Date.now() - 1000} WHERE id = ${pending[0].id}`;

		// Cycle 2 via triggerAnalysis directly — dedup guard should not block
		// because proposal is past expires_at even though status='pending'
		const cycle2 = await agent.triggerAnalysis();
		expect(cycle2.threadIds).toHaveLength(1);
		expect(mocks.debate.runDebate).toHaveBeenCalledTimes(2);
	});

	test('pipeline: triggerAnalysis ignores past-expiry proposals in dedup guard', async () => {
		await agent.updateConfig({
			orchestrationMode: 'pipeline',
			watchlistSymbols: ['AAPL'],
		});

		// Insert an already-expired pending proposal
		const proposalId = crypto.randomUUID();
		const threadId = crypto.randomUUID();
		const now = Date.now();
		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${threadId}, 'pipeline', 'AAPL', 'completed', ${now})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
			 outcome_status, orchestrator_session_id)
			VALUES (${proposalId}, ${threadId}, 'AAPL', 'buy', 0.85, 'test', 150, 165, 142,
			 ${null}, 5000, 5, '[]', '[]', ${now - 1000}, 'pending', ${now - 60000}, 'none', 'orch-001')`;

		// triggerAnalysis directly — dedup guard should not block expired proposal
		const result = await agent.triggerAnalysis();
		expect(result.threadIds).toHaveLength(1);
		expect(mocks.pipeline.runPipeline).toHaveBeenCalledTimes(1);
	});
});
