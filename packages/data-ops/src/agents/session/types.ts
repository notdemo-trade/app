import type { LLMProviderName } from '../llm/types';

export interface SessionConfig {
	orchestrationMode: 'debate' | 'pipeline';
	brokerType: string;
	llmProvider: LLMProviderName;
	llmModel: string;
	watchlistSymbols: string[];
	analysisIntervalSec: number;
	minConfidenceThreshold: number;
	positionSizePctOfCash: number;
	activeStrategyId: string;
	debateRounds: number;
	proposalTimeoutSec: number;
}

export interface SessionState {
	enabled: boolean;
	lastCycleAt: number | null;
	cycleCount: number;
	activeThreadId: string | null;
	activeThread: DiscussionThread | null;
	pendingProposalCount: number;
	errorCount: number;
	lastError: string | null;
}

export type PersonaId = 'bull_analyst' | 'bear_analyst' | 'risk_manager' | string;

export type MessageSender =
	| { type: 'system' }
	| { type: 'data_agent'; name: string }
	| { type: 'analysis_agent'; name: string }
	| { type: 'persona'; persona: PersonaId }
	| { type: 'moderator' }
	| { type: 'broker'; name: string }
	| { type: 'user' };

export type DiscussionPhase =
	| 'data_collection'
	| 'analysis'
	| 'debate_round'
	| 'consensus'
	| 'proposal'
	| 'human_decision'
	| 'execution'
	| 'completed';

export interface DiscussionMessage {
	id: string;
	threadId: string;
	timestamp: number;
	sender: MessageSender;
	phase: DiscussionPhase;
	content: string;
	metadata: Record<string, unknown>;
}

export interface DiscussionThread {
	id: string;
	orchestrationMode: 'debate' | 'pipeline';
	symbol: string;
	status: 'in_progress' | 'completed' | 'failed';
	startedAt: number;
	completedAt: number | null;
	messages: DiscussionMessage[];
	proposal: TradeProposal | null;
}

export interface TradeProposal {
	id: string;
	threadId: string;
	symbol: string;
	action: 'buy' | 'sell';
	confidence: number;
	rationale: string;
	entryPrice: number | null;
	targetPrice: number | null;
	stopLoss: number | null;
	qty: number | null;
	notional: number | null;
	positionSizePct: number;
	risks: string[];
	expiresAt: number;
	status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
	createdAt: number;
	decidedAt: number | null;
}
