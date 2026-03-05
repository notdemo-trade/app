import { z } from 'zod';

export const SignalDirectionSchema = z.enum(['bullish', 'bearish', 'neutral']);

export const SignalSchema = z.object({
	id: z.string().uuid(),
	sourceAgent: z.string(),
	symbol: z.string().nullable(),
	seriesId: z.string().nullable(),
	signalType: z.string(),
	direction: SignalDirectionSchema,
	strength: z.coerce.number().min(0).max(1),
	summary: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.date(),
});

export const GetSignalsRequestSchema = z.object({
	symbol: z.string().optional(),
	source: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional().default(50),
	since: z.coerce.date().optional(),
});

export type Signal = z.infer<typeof SignalSchema>;
export type GetSignalsRequest = z.infer<typeof GetSignalsRequestSchema>;
