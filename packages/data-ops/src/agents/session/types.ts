import type { BrokerAccount, BrokerPosition } from '../broker/types';
import type { LLMProviderName } from '../llm/types';

export interface EffectiveConfig {
	// Resolved values (used for execution)
	positionSizePctOfCash: number;
	llmProvider: LLMProviderName;
	llmModel: string;
	maxPositionValue: number;
	maxPositions: number;
	maxNotionalPerTrade: number;
	maxDailyLossPct: number;
	takeProfitPct: number;
	stopLossPct: number;
	cooldownMinutesAfterLoss: number;
	tradingHoursOnly: boolean;
	extendedHoursAllowed: boolean;
	allowShortSelling: boolean;
	tickerBlacklist: string[];
	tickerAllowlist: string[] | null;

	// Phase 23: Extended settings (from trading config)
	proposalTimeoutSec: number;
	llmTemperature: number;
	llmMaxTokens: number;
	scoreWindows: number[];
	confidenceDisplayHigh: number;
	confidenceDisplayMed: number;

	// Session-specific (not in trading config)
	orchestrationMode: 'debate' | 'pipeline';
	brokerType: string;
	watchlistSymbols: string[];
	analysisIntervalSec: number;
	minConfidenceThreshold: number;
	activeStrategyId: string;
	debateRounds: number;

	// Provenance tracking (for debugging)
	_sources: Record<string, 'trading_config' | 'session_config' | 'strategy_profile' | 'default'>;
}

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
	analysisIntervalSec: number;
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

export interface ResetResult {
	status: 'success' | 'error';
	message: string;
	cleared: {
		threads: number;
		messages: number;
		proposals: number;
		outcomes: number;
		snapshots: number;
	};
}

export interface PortfolioContext {
	positions: BrokerPosition[];
	account: BrokerAccount;
	pendingProposals: PendingProposalSummary[];
	trackingOutcomes: TrackingOutcomeSummary[];
}

export interface PendingProposalSummary {
	symbol: string;
	action: 'buy' | 'sell';
	confidence: number;
	positionSizePct: number;
	notional: number | null;
	createdAt: number;
	expiresAt: number;
}

export interface TrackingOutcomeSummary {
	symbol: string;
	action: 'buy' | 'sell';
	entryPrice: number;
	entryQty: number;
	targetPrice: number | null;
	stopLoss: number | null;
	createdAt: number;
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
	warnings: string[];
	expiresAt: number;
	status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
	createdAt: number;
	decidedAt: number | null;
	orderId: string | null;
	filledQty: number | null;
	filledAvgPrice: number | null;
	outcomeStatus: 'none' | 'tracking' | 'resolved';
	orchestratorSessionId: string | null;
}
