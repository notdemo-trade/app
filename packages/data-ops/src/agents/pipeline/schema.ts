import { z } from 'zod';

export const PipelineStepNameSchema = z.enum([
	'fetch_market_data',
	'technical_analysis',
	'llm_analysis',
	'risk_validation',
	'generate_proposal',
]);

export const PipelineStepSchema = z.object({
	name: PipelineStepNameSchema,
	status: z.enum(['pending', 'running', 'completed', 'failed']),
	startedAt: z.number().nullable(),
	completedAt: z.number().nullable(),
	output: z.unknown(),
	error: z.string().nullable(),
});
