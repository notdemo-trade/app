import { z } from 'zod';

// --- Enums ---

export const PersonaBiasSchema = z.enum(['bullish', 'bearish', 'neutral']);
export type PersonaBias = z.infer<typeof PersonaBiasSchema>;

// --- Domain Model ---

export const DebatePersonaSchema = z.object({
	id: z.string().uuid(),
	userId: z.string(),
	name: z.string().min(1).max(50),
	displayName: z.string().min(1).max(50),
	systemPrompt: z.string().min(10).max(2000),
	role: z.string().min(1).max(200),
	bias: PersonaBiasSchema,
	isActive: z.boolean(),
	isDefault: z.boolean(),
	sortOrder: z.number().int().min(0),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type DebatePersona = z.infer<typeof DebatePersonaSchema>;

// --- Request Schemas ---

export const CreateDebatePersonaRequestSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(50)
		.regex(
			/^[a-z][a-z0-9_]*$/,
			'Name must be lowercase alphanumeric with underscores, starting with a letter',
		),
	displayName: z.string().min(1).max(50),
	systemPrompt: z.string().min(10).max(2000),
	role: z.string().min(1).max(200),
	bias: PersonaBiasSchema,
});

export type CreateDebatePersonaRequest = z.infer<typeof CreateDebatePersonaRequestSchema>;

export const UpdateDebatePersonaRequestSchema = z.object({
	displayName: z.string().min(1).max(50).optional(),
	systemPrompt: z.string().min(10).max(2000).optional(),
	role: z.string().min(1).max(200).optional(),
	bias: PersonaBiasSchema.optional(),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(0).optional(),
});

export type UpdateDebatePersonaRequest = z.infer<typeof UpdateDebatePersonaRequestSchema>;

// --- Response Schemas ---

export const DebatePersonaListResponseSchema = z.object({
	personas: z.array(DebatePersonaSchema),
	moderatorPrompt: z.string().nullable(),
});

export type DebatePersonaListResponse = z.infer<typeof DebatePersonaListResponseSchema>;

// --- Moderator Prompt ---

export const UpdateModeratorPromptRequestSchema = z.object({
	moderatorPrompt: z.string().min(10).max(2000).nullable(),
});

export type UpdateModeratorPromptRequest = z.infer<typeof UpdateModeratorPromptRequestSchema>;
