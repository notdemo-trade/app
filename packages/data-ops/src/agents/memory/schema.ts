import { z } from 'zod';

export const OutcomeStatusSchema = z.enum(['none', 'tracking', 'resolved']);

export const ExitReasonSchema = z.enum(['stop_loss', 'target_hit', 'manual_close', 'time_exit']);

export const ProposalOutcomeSchema = z.object({
	id: z.string(),
	proposalId: z.string(),
	threadId: z.string(),
	orchestrationMode: z.enum(['debate', 'pipeline']),
	orchestratorSessionId: z.string(),
	symbol: z.string(),
	action: z.enum(['buy', 'sell']),
	entryPrice: z.number(),
	entryQty: z.number(),
	status: z.enum(['tracking', 'resolved']),
	exitPrice: z.number().nullable(),
	exitReason: ExitReasonSchema.nullable(),
	realizedPnl: z.number().nullable(),
	realizedPnlPct: z.number().nullable(),
	holdingDurationMs: z.number().nullable(),
	resolvedAt: z.number().nullable(),
	createdAt: z.number(),
});

export const OutcomeSnapshotSchema = z.object({
	id: z.string(),
	outcomeId: z.string(),
	unrealizedPnl: z.number(),
	unrealizedPnlPct: z.number(),
	currentPrice: z.number(),
	snapshotAt: z.number(),
});

export const ScoreWindowSchema = z.union([z.literal(30), z.literal(90), z.literal(180)]);

export const PersonaOutcomeRecordSchema = z.object({
	personaId: z.string(),
	sessionId: z.string(),
	proposalId: z.string(),
	symbol: z.string(),
	personaAction: z.string(),
	personaConfidence: z.number(),
	consensusAction: z.string(),
	realizedPnl: z.number(),
	realizedPnlPct: z.number(),
	wasCorrect: z.boolean(),
	resolvedAt: z.number(),
});

export const PersonaScoreSchema = z.object({
	personaId: z.string(),
	windowDays: ScoreWindowSchema,
	totalProposals: z.number(),
	correctProposals: z.number(),
	winRate: z.number().nullable(),
	avgPnlPct: z.number().nullable(),
	sharpeRatio: z.number().nullable(),
	confidenceCalibration: z.number().nullable(),
	bestSymbol: z.string().nullable(),
	worstSymbol: z.string().nullable(),
});

export const PersonaPatternSchema = z.object({
	personaId: z.string(),
	patternType: z.enum(['indicator_outcome', 'market_regime', 'sector', 'symbol']),
	patternKey: z.string(),
	description: z.string(),
	sampleSize: z.number(),
	successRate: z.number(),
	avgPnlPct: z.number(),
});

export const PerformanceContextSchema = z.object({
	personaId: z.string(),
	windowDays: ScoreWindowSchema,
	score: PersonaScoreSchema.nullable(),
	symbolRecord: z
		.object({
			totalCalls: z.number(),
			correctCalls: z.number(),
			avgPnlPct: z.number(),
		})
		.nullable(),
	patterns: z.array(PersonaPatternSchema),
});
