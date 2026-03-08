export type OutcomeStatus = 'none' | 'tracking' | 'resolved';
export type ExitReason = 'stop_loss' | 'target_hit' | 'manual_close' | 'time_exit';
export type PatternType = 'indicator_outcome' | 'market_regime' | 'sector' | 'symbol';
export type CalibrationRating = 'good' | 'fair' | 'poor';
export type ScoreWindow = 30 | 90 | 180;

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
