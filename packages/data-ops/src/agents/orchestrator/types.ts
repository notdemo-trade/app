import type { TechnicalSignal } from '../ta/types';

export interface OrchestratorConfig {
	dataPollIntervalSec: number;
	analystIntervalSec: number;
	minSentimentScore: number;
	minAnalystConfidence: number;
	positionSizePctOfCash: number;
	maxPositionValue: number;
	maxPositions: number;
	takeProfitPct: number;
	stopLossPct: number;
	autoApproveEnabled: boolean;
	autoApproveMaxNotional: number;
	watchlistSymbols: string[];
	tickerBlacklist: string[];
	activeStrategyId: string;
}

export interface OrchestratorState {
	enabled: boolean;
	lastDataGatherAt: string | null;
	lastAnalysisAt: string | null;
	lastTradeAt: string | null;
	currentCycleStartedAt: string | null;
	cycleCount: number;
	errorCount: number;
	lastError: string | null;
}

export interface AgentEntitlement {
	agentType: string;
	enabled: boolean;
}

export interface AggregatedSignals {
	technicals: Record<string, TechnicalSignal[]>;
}

export type AgentAction =
	| 'started'
	| 'stopped'
	| 'signals_aggregated'
	| 'analysis_started'
	| 'analysis_completed'
	| 'recommendation_logged'
	| 'error';

export interface AgentActivity {
	id: string;
	timestamp: string;
	action: AgentAction;
	symbol?: string;
	details: string;
}

export interface OrchestratorStatus {
	enabled: boolean;
	state: OrchestratorState;
	config: OrchestratorConfig;
	entitlements: AgentEntitlement[];
	recentActivity: AgentActivity[];
	stats: {
		signalsToday: number;
		recommendationsToday: number;
	};
}

export interface Recommendation {
	id: string;
	symbol: string;
	action: string;
	confidence: number;
	rationale: string;
	strategyId: string;
	signalsSummary: string | null;
	createdAt: string;
}
