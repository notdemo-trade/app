import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
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
	expires_at: number;
	status: string;
	created_at: number;
	decided_at: number | null;
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
		expiresAt: row.expires_at,
		status: row.status as TradeProposal['status'],
		createdAt: row.created_at,
		decidedAt: row.decided_at,
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
