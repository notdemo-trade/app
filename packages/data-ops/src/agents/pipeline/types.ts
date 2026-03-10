import type { RiskValidation } from '../debate/types';
import type { EnrichmentData } from '../enrichment/types';
import type { TradeRecommendation } from '../llm/types';
import type { PortfolioContext, TradeProposal } from '../session/types';
import type { Bar, TechnicalIndicators, TechnicalSignal } from '../ta/types';

export type PipelineStepName =
	| 'fetch_market_data'
	| 'technical_analysis'
	| 'fetch_enrichment_data'
	| 'llm_analysis'
	| 'risk_validation'
	| 'generate_proposal';

export interface PipelineStep {
	name: PipelineStepName;
	status: 'pending' | 'running' | 'completed' | 'failed';
	startedAt: number | null;
	completedAt: number | null;
	output: unknown;
	error: string | null;
}

export interface PipelineContext {
	symbol: string;
	strategyId: string;
	bars: Bar[] | null;
	indicators: TechnicalIndicators | null;
	signals: TechnicalSignal[] | null;
	recommendation: TradeRecommendation | null;
	riskValidation: RiskValidation | null;
	proposal: TradeProposal | null;
	portfolioContext: PortfolioContext | null;
	enrichment: EnrichmentData | null;
}

export interface PipelineSession {
	id: string;
	symbol: string;
	status: 'running' | 'completed' | 'failed';
	steps: PipelineStep[];
	context: PipelineContext;
	startedAt: number;
	completedAt: number | null;
}

export interface PipelineOrchestratorState {
	activePipelineId: string | null;
	totalPipelines: number;
	errorCount: number;
	lastError: string | null;
}
