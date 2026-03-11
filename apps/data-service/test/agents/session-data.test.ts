import { beforeEach, describe, expect, test } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { insertExecutedProposalWithOutcome } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent data retrieval', () => {
	let agent: SessionAgent;

	beforeEach(async () => {
		clearMockRegistry();
		const result = await createTestAgent();
		agent = result.agent;
		registerMockAgent(agent.env.AlpacaBrokerAgent, result.mocks.broker);
	});

	test('getThreads returns hydrated threads with messages', () => {
		const now = Date.now();
		const threadId = crypto.randomUUID();

		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${threadId}, 'debate', 'AAPL', 'completed', ${now})`;

		agent.sql`INSERT INTO discussion_messages (id, thread_id, timestamp, sender, phase, content, metadata)
			VALUES (${crypto.randomUUID()}, ${threadId}, ${now + 1}, '{"type":"system"}', 'data_collection', 'Starting analysis', '{}')`;
		agent.sql`INSERT INTO discussion_messages (id, thread_id, timestamp, sender, phase, content, metadata)
			VALUES (${crypto.randomUUID()}, ${threadId}, ${now + 2}, '{"type":"persona","persona":"bull"}', 'debate_round', 'Bullish signals', '{"round":1}')`;

		const threads = agent.getThreads();
		expect(threads).toHaveLength(1);
		expect(threads[0].id).toBe(threadId);
		expect(threads[0].messages).toHaveLength(2);
		// Messages ordered by timestamp ASC
		expect(threads[0].messages[0].phase).toBe('data_collection');
		expect(threads[0].messages[1].phase).toBe('debate_round');
	});

	test('getThread returns null for nonexistent', () => {
		const result = agent.getThread('nonexistent-id');
		expect(result).toBeNull();
	});

	test('getOutcomes filters by status', () => {
		// Insert two outcomes with different statuses
		insertExecutedProposalWithOutcome(agent, { symbol: 'AAPL' });

		const now = Date.now();
		const resolvedThreadId = crypto.randomUUID();
		const resolvedProposalId = crypto.randomUUID();
		const resolvedOutcomeId = crypto.randomUUID();

		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${resolvedThreadId}, 'debate', 'TSLA', 'completed', ${now})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
			 outcome_status, order_id, filled_qty, filled_avg_price, orchestrator_session_id)
			VALUES (${resolvedProposalId}, ${resolvedThreadId}, 'TSLA', 'buy',
			 0.85, 'test', 200, 220, 190, 5, 1000, 5, '[]', '[]', ${now + 900_000},
			 'executed', ${now}, 'resolved', 'order-002', 5, 200, 'orch-002')`;
		agent.sql`INSERT INTO proposal_outcomes
			(id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
			 symbol, action, entry_price, entry_qty, status, exit_price, realized_pnl, resolved_at, created_at)
			VALUES (${resolvedOutcomeId}, ${resolvedProposalId}, ${resolvedThreadId}, 'debate', 'orch-002',
			 'TSLA', 'buy', 200, 5, 'resolved', 220, 100, ${now}, ${now - 1000})`;

		const tracking = agent.getOutcomes('tracking');
		expect(tracking).toHaveLength(1);
		expect(tracking[0].symbol).toBe('AAPL');

		const resolved = agent.getOutcomes('resolved');
		expect(resolved).toHaveLength(1);
		expect(resolved[0].symbol).toBe('TSLA');
	});

	test('getOutcomeSnapshots returns ordered snapshots', () => {
		// Create FK parent chain: thread → proposal → outcome → snapshots
		const { outcomeId } = insertExecutedProposalWithOutcome(agent);
		const now = Date.now();

		// Insert snapshots in non-chronological order
		agent.sql`INSERT INTO outcome_snapshots (id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
			VALUES (${crypto.randomUUID()}, ${outcomeId}, 10, 0.5, 151, ${now - 300_000})`;
		agent.sql`INSERT INTO outcome_snapshots (id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
			VALUES (${crypto.randomUUID()}, ${outcomeId}, 20, 1.0, 152, ${now})`;
		agent.sql`INSERT INTO outcome_snapshots (id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
			VALUES (${crypto.randomUUID()}, ${outcomeId}, 15, 0.75, 151.5, ${now - 150_000})`;

		const snapshots = agent.getOutcomeSnapshots(outcomeId);
		expect(snapshots).toHaveLength(3);
		// Ordered by snapshot_at DESC (newest first)
		expect(snapshots[0].currentPrice).toBe(152);
		expect(snapshots[2].currentPrice).toBe(151);
	});
});
