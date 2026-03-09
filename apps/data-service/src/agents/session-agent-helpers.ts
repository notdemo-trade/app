import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import type {
	ExitReason,
	OutcomeSnapshot,
	ProposalOutcome,
} from '@repo/data-ops/agents/memory/types';
import type {
	DiscussionMessage,
	DiscussionPhase,
	DiscussionThread,
	MessageSender,
	SessionConfig,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';

// --- SQL row interfaces ---

export interface SessionConfigRow {
	orchestration_mode: string;
	broker_type: string;
	llm_provider: string;
	llm_model: string;
	watchlist_symbols: string;
	analysis_interval_sec: number;
	min_confidence_threshold: number;
	position_size_pct: number;
	active_strategy_id: string;
	debate_rounds: number;
	proposal_timeout_sec: number;
}

export interface StrategyTemplateRow {
	id: string;
	name: string;
	data: string;
	is_default: number;
}

export interface ThreadRow {
	id: string;
	orchestration_mode: string;
	symbol: string;
	status: string;
	started_at: number;
	completed_at: number | null;
	proposal_id: string | null;
}

export interface MessageRow {
	id: string;
	thread_id: string;
	timestamp: number;
	sender: string;
	phase: string;
	content: string;
	metadata: string;
}

export interface ProposalRow {
	id: string;
	thread_id: string;
	symbol: string;
	action: string;
	confidence: number;
	rationale: string;
	entry_price: number | null;
	target_price: number | null;
	stop_loss: number | null;
	qty: number | null;
	notional: number | null;
	position_size_pct: number;
	risks: string;
	warnings: string;
	expires_at: number;
	status: string;
	created_at: number;
	decided_at: number | null;
	order_id: string | null;
	filled_qty: number | null;
	filled_avg_price: number | null;
	outcome_status: string;
	orchestrator_session_id: string | null;
}

export interface ProposalOutcomeRow {
	id: string;
	proposal_id: string;
	thread_id: string;
	orchestration_mode: string;
	orchestrator_session_id: string;
	symbol: string;
	action: string;
	entry_price: number;
	entry_qty: number;
	status: string;
	exit_price: number | null;
	exit_reason: string | null;
	realized_pnl: number | null;
	realized_pnl_pct: number | null;
	holding_duration_ms: number | null;
	resolved_at: number | null;
	created_at: number;
}

export interface OutcomeSnapshotRow {
	id: string;
	outcome_id: string;
	unrealized_pnl: number;
	unrealized_pnl_pct: number;
	current_price: number;
	snapshot_at: number;
}

export interface CountRow {
	cnt: number;
}

// --- Row → domain mappers ---

export function rowToConfig(row: SessionConfigRow): SessionConfig {
	return {
		orchestrationMode: row.orchestration_mode as SessionConfig['orchestrationMode'],
		brokerType: row.broker_type,
		llmProvider: row.llm_provider as SessionConfig['llmProvider'],
		llmModel: row.llm_model,
		watchlistSymbols: JSON.parse(row.watchlist_symbols) as string[],
		analysisIntervalSec: row.analysis_interval_sec,
		minConfidenceThreshold: row.min_confidence_threshold,
		positionSizePctOfCash: row.position_size_pct,
		activeStrategyId: row.active_strategy_id,
		debateRounds: row.debate_rounds,
		proposalTimeoutSec: row.proposal_timeout_sec,
	};
}

export function rowToThread(
	row: ThreadRow,
	messages: DiscussionMessage[],
	proposal: TradeProposal | null,
): DiscussionThread {
	return {
		id: row.id,
		orchestrationMode: row.orchestration_mode as DiscussionThread['orchestrationMode'],
		symbol: row.symbol,
		status: row.status as DiscussionThread['status'],
		startedAt: row.started_at,
		completedAt: row.completed_at,
		messages,
		proposal,
	};
}

export function rowToMessage(row: MessageRow): DiscussionMessage {
	return {
		id: row.id,
		threadId: row.thread_id,
		timestamp: row.timestamp,
		sender: JSON.parse(row.sender) as MessageSender,
		phase: row.phase as DiscussionPhase,
		content: row.content,
		metadata: JSON.parse(row.metadata) as Record<string, unknown>,
	};
}

export function rowToProposal(row: ProposalRow): TradeProposal {
	return {
		id: row.id,
		threadId: row.thread_id,
		symbol: row.symbol,
		action: row.action as TradeProposal['action'],
		confidence: row.confidence,
		rationale: row.rationale,
		entryPrice: row.entry_price,
		targetPrice: row.target_price,
		stopLoss: row.stop_loss,
		qty: row.qty,
		notional: row.notional,
		positionSizePct: row.position_size_pct,
		risks: JSON.parse(row.risks) as string[],
		warnings: JSON.parse(row.warnings || '[]') as string[],
		expiresAt: row.expires_at,
		status: row.status as TradeProposal['status'],
		createdAt: row.created_at,
		decidedAt: row.decided_at,
		orderId: row.order_id ?? null,
		filledQty: row.filled_qty ?? null,
		filledAvgPrice: row.filled_avg_price ?? null,
		outcomeStatus: (row.outcome_status ?? 'none') as TradeProposal['outcomeStatus'],
		orchestratorSessionId: row.orchestrator_session_id ?? null,
	};
}

export function rowToOutcome(row: ProposalOutcomeRow): ProposalOutcome {
	return {
		id: row.id,
		proposalId: row.proposal_id,
		threadId: row.thread_id,
		orchestrationMode: row.orchestration_mode as ProposalOutcome['orchestrationMode'],
		orchestratorSessionId: row.orchestrator_session_id,
		symbol: row.symbol,
		action: row.action as ProposalOutcome['action'],
		entryPrice: row.entry_price,
		entryQty: row.entry_qty,
		status: row.status as ProposalOutcome['status'],
		exitPrice: row.exit_price,
		exitReason: row.exit_reason as ExitReason | null,
		realizedPnl: row.realized_pnl,
		realizedPnlPct: row.realized_pnl_pct,
		holdingDurationMs: row.holding_duration_ms,
		resolvedAt: row.resolved_at,
		createdAt: row.created_at,
	};
}

export function rowToSnapshot(row: OutcomeSnapshotRow): OutcomeSnapshot {
	return {
		id: row.id,
		outcomeId: row.outcome_id,
		unrealizedPnl: row.unrealized_pnl,
		unrealizedPnlPct: row.unrealized_pnl_pct,
		currentPrice: row.current_price,
		snapshotAt: row.snapshot_at,
	};
}

// --- Default strategies ---

export const DEFAULT_STRATEGIES: StrategyTemplate[] = [
	{
		id: 'conservative',
		name: 'Conservative',
		riskTolerance: 'conservative',
		positionSizeBias: 0.03,
		preferredTimeframe: 'position',
		analysisFocus: ['risk_management', 'fundamentals', 'support_levels'],
	},
	{
		id: 'moderate',
		name: 'Moderate',
		riskTolerance: 'moderate',
		positionSizeBias: 0.05,
		preferredTimeframe: 'swing',
		analysisFocus: ['technicals', 'momentum', 'risk_reward'],
	},
	{
		id: 'aggressive',
		name: 'Aggressive',
		riskTolerance: 'aggressive',
		positionSizeBias: 0.1,
		preferredTimeframe: 'intraday',
		analysisFocus: ['momentum', 'breakouts', 'volume'],
	},
];

export const SYSTEM_PROMPT = `You are a trading session assistant that helps users analyze markets and manage trades.
You have access to tools for analyzing symbols and executing trades.
When the user asks about a symbol, use the analyzeSymbol tool to start a full analysis cycle.
When the user approves a trade proposal, use the executeTrade tool to submit the order.
Always explain your reasoning and present analysis results clearly.`;
