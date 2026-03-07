export type LLMProviderName = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek' | 'workers-ai';

export interface LLMProviderConfig {
	provider: LLMProviderName;
	apiKey?: string;
	model: string;
	baseUrl?: string;
	aiBinding?: unknown;
}

export interface CompletionMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface CompletionParams {
	messages: CompletionMessage[];
	temperature?: number;
	max_tokens?: number;
	response_format?: { type: 'json_object' } | { type: 'text' };
}

export interface CompletionResult {
	content: string;
	usage: TokenUsage;
}

export interface TokenUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface LLMClient {
	complete(params: CompletionParams): Promise<CompletionResult>;
}

export interface StrategyTemplate {
	id: string;
	name: string;
	riskTolerance: 'conservative' | 'moderate' | 'aggressive';
	positionSizeBias: number;
	preferredTimeframe: 'intraday' | 'swing' | 'position';
	analysisFocus: string[];
	customPromptSuffix?: string;
}

export interface AnalysisSignal {
	type: string;
	direction: string;
	strength: number;
	source: string;
}

export interface AnalysisRequest {
	symbol: string;
	signals: AnalysisSignal[];
	technicals?: Record<string, unknown>;
	strategy: StrategyTemplate;
	includeResearch?: boolean;
}

export interface TradeRecommendation {
	action: 'buy' | 'sell' | 'hold';
	confidence: number;
	rationale: string;
	entry_price?: number;
	target_price?: number;
	stop_loss?: number;
	position_size_pct?: number;
	timeframe?: string;
	risks: string[];
}

export interface LLMAnalysisResult {
	id: string;
	userId: string;
	symbol: string;
	timestamp: string;
	recommendation: TradeRecommendation;
	research?: string;
	strategyId: string;
	usage: TokenUsage & { estimated_cost_usd: number };
	model: string;
	provider: LLMProviderName;
}

export interface LLMAgentState {
	totalAnalyses: number;
	totalTokens: number;
	totalCostUsd: number;
	lastAnalysisAt: string | null;
	errorCount: number;
	lastError: string | null;
}

export interface ClassifyEventResult {
	event_type: string;
	symbols: string[];
	summary: string;
	confidence: number;
}

export interface GenerateReportResult {
	report: string;
}

export interface UsageSummaryResult {
	totalTokens: number;
	totalCostUsd: number;
}

export interface LLMAgentRPC {
	analyze(request: AnalysisRequest): Promise<LLMAnalysisResult>;
	classifyEvent(rawContent: string): Promise<ClassifyEventResult>;
	generateReport(symbol: string, context: Record<string, unknown>): Promise<GenerateReportResult>;
	getUsage(days?: number): Promise<UsageSummaryResult>;
	analyzeAsPersona(
		persona: { id: string; name: string; role: string; systemPrompt: string; bias: string },
		data: { symbol: string; signals: AnalysisSignal[]; indicators: Record<string, unknown> },
		strategy: StrategyTemplate,
	): Promise<{
		personaId: string;
		action: 'buy' | 'sell' | 'hold';
		confidence: number;
		rationale: string;
		keyPoints: string[];
	}>;
	runDebateRound(
		session: {
			analyses: {
				personaId: string;
				action: 'buy' | 'sell' | 'hold';
				confidence: number;
				rationale: string;
				keyPoints: string[];
			}[];
			previousRounds: { roundNumber: number; responses: unknown[] }[];
		},
		roundNumber: number,
		personas: { id: string; name: string; role: string; systemPrompt: string; bias: string }[],
	): Promise<{ roundNumber: number; responses: unknown[] }>;
	synthesizeConsensus(
		analyses: {
			personaId: string;
			action: 'buy' | 'sell' | 'hold';
			confidence: number;
			rationale: string;
			keyPoints: string[];
		}[],
		debateRounds: { roundNumber: number; responses: unknown[] }[],
		moderatorPrompt: string,
	): Promise<{
		action: 'buy' | 'sell' | 'hold';
		confidence: number;
		rationale: string;
		dissent: string | null;
		entryPrice: number | null;
		targetPrice: number | null;
		stopLoss: number | null;
		positionSizePct: number | null;
		risks: string[];
	}>;
	validateRisk(
		recommendation: TradeRecommendation,
		portfolio: {
			positions: { symbol: string; qty: number; side: string; marketValue: number }[];
			account: { cash: number; portfolioValue: number; buyingPower: number };
		},
	): Promise<{
		approved: boolean;
		adjustedPositionSize: number | null;
		warnings: string[];
		rationale: string;
	}>;
}
