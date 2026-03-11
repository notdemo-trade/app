import type { SessionAgent } from '@/agents/session-agent';

/**
 * Insert a pending proposal directly into SQLite for testing.
 * Creates the required discussion_thread FK first.
 */
export function insertPendingProposal(
	agent: SessionAgent,
	overrides: {
		id?: string;
		threadId?: string;
		symbol?: string;
		action?: string;
		qty?: number | null;
		notional?: number | null;
		positionSizePct?: number;
		expiresAt?: number;
		entryPrice?: number;
		targetPrice?: number;
		stopLoss?: number;
		confidence?: number;
	} = {},
): string {
	const id = overrides.id ?? crypto.randomUUID();
	const threadId = overrides.threadId ?? crypto.randomUUID();
	const now = Date.now();

	agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
		VALUES (${threadId}, 'debate', ${overrides.symbol ?? 'AAPL'}, 'completed', ${now})`;

	agent.sql`INSERT INTO trade_proposals
		(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
		 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
		 outcome_status, orchestrator_session_id)
		VALUES (${id}, ${threadId}, ${overrides.symbol ?? 'AAPL'}, ${overrides.action ?? 'buy'},
		 ${overrides.confidence ?? 0.85}, 'test rationale', ${overrides.entryPrice ?? 150},
		 ${overrides.targetPrice ?? 165}, ${overrides.stopLoss ?? 142},
		 ${overrides.qty !== undefined ? overrides.qty : null}, ${overrides.notional !== undefined ? overrides.notional : 5000}, ${overrides.positionSizePct ?? 5},
		 '[]', '[]', ${overrides.expiresAt ?? now + 900_000}, 'pending', ${now}, 'none', 'orch-001')`;

	agent.sql`UPDATE discussion_threads SET proposal_id = ${id} WHERE id = ${threadId}`;
	return id;
}

/**
 * Insert an executed proposal with a tracking outcome for outcome-tracking tests.
 */
export function insertExecutedProposalWithOutcome(
	agent: SessionAgent,
	overrides: {
		symbol?: string;
		action?: string;
		entryPrice?: number;
		targetPrice?: number;
		stopLoss?: number;
	} = {},
): { proposalId: string; threadId: string; outcomeId: string } {
	const proposalId = crypto.randomUUID();
	const threadId = crypto.randomUUID();
	const outcomeId = crypto.randomUUID();
	const now = Date.now();
	const symbol = overrides.symbol ?? 'AAPL';

	agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
		VALUES (${threadId}, 'debate', ${symbol}, 'completed', ${now})`;

	agent.sql`INSERT INTO trade_proposals
		(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
		 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at,
		 outcome_status, order_id, filled_qty, filled_avg_price, orchestrator_session_id)
		VALUES (${proposalId}, ${threadId}, ${symbol}, ${overrides.action ?? 'buy'},
		 0.85, 'test', ${overrides.entryPrice ?? 150}, ${overrides.targetPrice ?? 165},
		 ${overrides.stopLoss ?? 142}, 10, 1500, 5, '[]', '[]', ${now + 900_000},
		 'executed', ${now}, 'tracking', 'order-001', 10, ${overrides.entryPrice ?? 150}, 'orch-001')`;

	agent.sql`UPDATE discussion_threads SET proposal_id = ${proposalId} WHERE id = ${threadId}`;

	agent.sql`INSERT INTO proposal_outcomes
		(id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
		 symbol, action, entry_price, entry_qty, status, created_at)
		VALUES (${outcomeId}, ${proposalId}, ${threadId}, 'debate', 'orch-001',
		 ${symbol}, ${overrides.action ?? 'buy'}, ${overrides.entryPrice ?? 150}, 10,
		 'tracking', ${now})`;

	return { proposalId, threadId, outcomeId };
}
