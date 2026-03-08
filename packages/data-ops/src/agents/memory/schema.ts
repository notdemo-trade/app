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
