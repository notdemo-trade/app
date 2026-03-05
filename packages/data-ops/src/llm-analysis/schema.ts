import { z } from 'zod';

export const LLMProviderNameSchema = z.enum(['openai', 'anthropic', 'google', 'xai', 'deepseek']);

export const StrategyTemplateSchema = z.object({
	id: z.string(),
	name: z.string(),
	riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']),
	positionSizeBias: z.number().min(0.01).max(0.25),
	preferredTimeframe: z.enum(['intraday', 'swing', 'position']),
	analysisFocus: z.array(z.string()),
	customPromptSuffix: z.string().optional(),
});

export const AnalysisSignalSchema = z.object({
	type: z.string(),
	direction: z.string(),
	strength: z.number(),
	source: z.string(),
});

export const AnalyzeRequestSchema = z.object({
	symbol: z.string().min(1).max(10),
	signals: z.array(AnalysisSignalSchema),
	technicals: z.record(z.string(), z.unknown()).optional(),
	strategy: StrategyTemplateSchema,
	includeResearch: z.boolean().optional().default(false),
});

export const TradeRecommendationSchema = z.object({
	action: z.enum(['buy', 'sell', 'hold']),
	confidence: z.number().min(0).max(1),
	rationale: z.string(),
	entry_price: z.number().positive().optional(),
	target_price: z.number().positive().optional(),
	stop_loss: z.number().positive().optional(),
	position_size_pct: z.number().min(1).max(10).optional(),
	timeframe: z.enum(['intraday', 'swing', 'position']).optional(),
	risks: z.array(z.string()),
});

export const AnalysisResultSchema = z.object({
	id: z.string().uuid(),
	userId: z.string(),
	symbol: z.string(),
	timestamp: z.string(),
	recommendation: TradeRecommendationSchema,
	research: z.string().optional(),
	strategyId: z.string(),
	usage: z.object({
		prompt_tokens: z.number(),
		completion_tokens: z.number(),
		total_tokens: z.number(),
		estimated_cost_usd: z.number(),
	}),
	model: z.string(),
	provider: LLMProviderNameSchema,
});

export const GetAnalysesRequestSchema = z.object({
	symbol: z.string().optional(),
	limit: z.coerce.number().min(1).max(100).optional().default(20),
});

export const UsageSummarySchema = z.object({
	totalTokens: z.number(),
	totalCostUsd: z.number(),
	byProvider: z.record(z.string(), z.object({ tokens: z.number(), cost: z.number() })),
	byDay: z.array(z.object({ date: z.string(), tokens: z.number(), cost: z.number() })),
});

export const ClassifyRequestSchema = z.object({
	content: z.string().min(1).max(4000),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type TradeRecommendation = z.infer<typeof TradeRecommendationSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type StrategyTemplate = z.infer<typeof StrategyTemplateSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type GetAnalysesRequest = z.infer<typeof GetAnalysesRequestSchema>;
