import { z } from 'zod';

export const OrchestratorConfigSchema = z.object({
	dataPollIntervalSec: z.number().min(10).max(300).optional(),
	analystIntervalSec: z.number().min(30).max(600).optional(),
	minSentimentScore: z.number().min(0).max(1).optional(),
	minAnalystConfidence: z.number().min(0).max(1).optional(),
	positionSizePctOfCash: z.number().min(0.01).max(0.25).optional(),
	maxPositionValue: z.number().min(100).max(100000).optional(),
	maxPositions: z.number().min(1).max(20).optional(),
	takeProfitPct: z.number().min(0.01).max(1).optional(),
	stopLossPct: z.number().min(0.01).max(0.5).optional(),
	autoApproveEnabled: z.boolean().optional(),
	autoApproveMaxNotional: z.number().min(0).max(10000).optional(),
	watchlistSymbols: z.array(z.string()).optional(),
	tickerBlacklist: z.array(z.string()).optional(),
	activeStrategyId: z.string().optional(),
});

export const EntitlementUpdateSchema = z.object({
	agentType: z.string(),
	enabled: z.boolean(),
});

export const OrchestratorStatusSchema = z.object({
	enabled: z.boolean(),
	state: z.object({
		enabled: z.boolean(),
		lastDataGatherAt: z.string().nullable(),
		lastAnalysisAt: z.string().nullable(),
		lastTradeAt: z.string().nullable(),
		currentCycleStartedAt: z.string().nullable(),
		cycleCount: z.number(),
		errorCount: z.number(),
		lastError: z.string().nullable(),
	}),
	config: OrchestratorConfigSchema,
	entitlements: z.array(
		z.object({
			agentType: z.string(),
			enabled: z.boolean(),
		}),
	),
	recentActivity: z.array(
		z.object({
			id: z.string(),
			timestamp: z.string(),
			action: z.string(),
			symbol: z.string().optional(),
			details: z.string(),
		}),
	),
	stats: z.object({
		signalsToday: z.number(),
		recommendationsToday: z.number(),
		proposalsToday: z.number(),
		tradesExecutedToday: z.number(),
	}),
});

export type OrchestratorConfigInput = z.infer<typeof OrchestratorConfigSchema>;
