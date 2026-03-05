export type LLMProviderName = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export interface LLMProviderConfig {
	provider: LLMProviderName;
	apiKey: string;
	model: string;
	baseUrl?: string;
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
}
