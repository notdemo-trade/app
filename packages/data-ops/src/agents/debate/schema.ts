import { z } from 'zod';

export const PersonaConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.string(),
	systemPrompt: z.string(),
	bias: z.string(),
});

export const DebateConfigSchema = z.object({
	personas: z.array(PersonaConfigSchema).min(2).max(5),
	rounds: z.number().int().min(1).max(5).default(2),
	moderatorPrompt: z.string(),
});

export const PersonaAnalysisSchema = z.object({
	personaId: z.string(),
	action: z.enum(['buy', 'sell', 'hold']),
	confidence: z.number().min(0).max(1),
	rationale: z.string(),
	keyPoints: z.array(z.string()),
});

export const PersonaResponseSchema = z.object({
	personaId: z.string(),
	respondingTo: z.array(z.string()),
	content: z.string(),
	revisedConfidence: z.number().min(0).max(1),
	revisedAction: z.enum(['buy', 'sell', 'hold']),
});

export const DebateRoundSchema = z.object({
	roundNumber: z.number().int().min(1),
	responses: z.array(PersonaResponseSchema),
});

export const ConsensusResultSchema = z.object({
	action: z.enum(['buy', 'sell', 'hold']),
	confidence: z.number().min(0).max(1),
	rationale: z.string(),
	dissent: z.string().nullable(),
	entryPrice: z.number().nullable(),
	targetPrice: z.number().nullable(),
	stopLoss: z.number().nullable(),
	positionSizePct: z.number().nullable(),
	risks: z.array(z.string()),
});

export const RiskValidationSchema = z.object({
	approved: z.boolean(),
	adjustedPositionSize: z.number().nullable(),
	warnings: z.array(z.string()),
	rationale: z.string(),
});
