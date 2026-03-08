export type OutcomeStatus = 'none' | 'tracking' | 'resolved';
export type ExitReason = 'stop_loss' | 'target_hit' | 'manual_close' | 'time_exit';
export type PatternType = 'indicator_outcome' | 'market_regime' | 'sector' | 'symbol';
export type CalibrationRating = 'good' | 'fair' | 'poor';
export type ScoreWindow = number;

export interface ProposalOutcome {
	id: string;
	proposalId: string;
	threadId: string;
	orchestrationMode: 'debate' | 'pipeline';
	orchestratorSessionId: string;
	symbol: string;
	action: 'buy' | 'sell';
	entryPrice: number;
	entryQty: number;
	status: 'tracking' | 'resolved';
	exitPrice: number | null;
	exitReason: ExitReason | null;
	realizedPnl: number | null;
	realizedPnlPct: number | null;
	holdingDurationMs: number | null;
	resolvedAt: number | null;
	createdAt: number;
}

export interface OutcomeSnapshot {
	id: string;
	outcomeId: string;
	unrealizedPnl: number;
	unrealizedPnlPct: number;
	currentPrice: number;
	snapshotAt: number;
}

export interface PersonaOutcomeRecord {
	id: string;
	personaId: string;
	sessionId: string;
	proposalId: string;
	symbol: string;
	personaAction: string;
	personaConfidence: number;
	consensusAction: string;
	realizedPnl: number;
	realizedPnlPct: number;
	wasCorrect: boolean;
	resolvedAt: number;
	createdAt: number;
}

export interface PersonaScore {
	personaId: string;
	windowDays: ScoreWindow;
	totalProposals: number;
	correctProposals: number;
	winRate: number | null;
	avgPnlPct: number | null;
	stddevPnlPct: number | null;
	sharpeRatio: number | null;
	confidenceCalibration: number | null;
	bestSymbol: string | null;
	bestSymbolPnlPct: number | null;
	worstSymbol: string | null;
	worstSymbolPnlPct: number | null;
	computedAt: number;
}

export interface PersonaPattern {
	id: string;
	personaId: string;
	patternType: PatternType;
	patternKey: string;
	description: string;
	sampleSize: number;
	successRate: number;
	avgPnlPct: number;
	lastUpdatedAt: number;
}

export interface PerformanceContext {
	personaId: string;
	windowDays: ScoreWindow;
	score: PersonaScore | null;
	symbolRecord: { totalCalls: number; correctCalls: number; avgPnlPct: number } | null;
	patterns: PersonaPattern[];
}

export interface PersonaComparisonRow {
	personaId: string;
	name: string;
	winRate: number | null;
	avgReturn: number | null;
	sharpeRatio: number | null;
	calibration: CalibrationRating;
}

export interface PipelineScore {
	strategyId: string;
	windowDays: ScoreWindow;
	totalProposals: number;
	correctProposals: number;
	winRate: number | null;
	avgPnlPct: number | null;
	stddevPnlPct: number | null;
	sharpeRatio: number | null;
	bestSymbol: string | null;
	bestSymbolPnlPct: number | null;
	worstSymbol: string | null;
	worstSymbolPnlPct: number | null;
	computedAt: number;
}
