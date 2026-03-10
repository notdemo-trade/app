import type {
	EarningsContext,
	FundamentalsContext,
	MarketIntelligenceContext,
} from '../enrichment/types';
import type { PersonaId, PortfolioContext } from '../session/types';

export interface PersonaConfig {
	id: PersonaId;
	name: string;
	role: string;
	systemPrompt: string;
	bias: string;
}

export interface DebateConfig {
	personas: PersonaConfig[];
	rounds: number;
	moderatorPrompt: string;
}

export interface PersonaAnalysis {
	personaId: PersonaId;
	action: 'buy' | 'sell' | 'hold';
	confidence: number;
	rationale: string;
	keyPoints: string[];
}

export interface DebateRound {
	roundNumber: number;
	responses: PersonaResponse[];
}

export interface PersonaResponse {
	personaId: PersonaId;
	respondingTo: PersonaId[];
	content: string;
	revisedConfidence: number;
	revisedAction: 'buy' | 'sell' | 'hold';
}

export interface ConsensusResult {
	action: 'buy' | 'sell' | 'hold';
	confidence: number;
	rationale: string;
	dissent: string | null;
	entryPrice: number | null;
	targetPrice: number | null;
	stopLoss: number | null;
	positionSizePct: number | null;
	risks: string[];
}

export interface DebateSession {
	id: string;
	symbol: string;
	status: 'analyzing' | 'debating' | 'synthesizing' | 'completed' | 'failed';
	initialAnalyses: PersonaAnalysis[];
	debateRounds: DebateRound[];
	consensus: ConsensusResult | null;
	startedAt: number;
	completedAt: number | null;
}

export interface DebateOrchestratorState {
	activeDebateId: string | null;
	totalDebates: number;
	errorCount: number;
	lastError: string | null;
}

export interface RiskValidation {
	approved: boolean;
	adjustedPositionSize: number | null;
	warnings: string[];
	rationale: string;
}

export interface AnalyzeAsPersonaData {
	symbol: string;
	signals: { type: string; direction: string; strength: number; source: string }[];
	indicators: Record<string, unknown>;
	portfolioContext?: PortfolioContext;
	fundamentals?: FundamentalsContext;
	marketIntelligence?: MarketIntelligenceContext;
	earningsContext?: EarningsContext;
}
