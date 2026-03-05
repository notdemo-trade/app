import { z } from 'zod';

export const CredentialProviderSchema = z.enum([
	'alpaca',
	'openai',
	'anthropic',
	'google',
	'xai',
	'deepseek',
]);
export type CredentialProvider = z.infer<typeof CredentialProviderSchema>;

export const LLMProviderSchema = z.enum(['openai', 'anthropic', 'google', 'xai', 'deepseek']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const AlpacaCredentialSchema = z.object({
	apiKey: z.string().min(1),
	apiSecret: z.string().min(1),
	paper: z.boolean().default(true),
});
export type AlpacaCredential = z.infer<typeof AlpacaCredentialSchema>;

export const LLMCredentialSchema = z.object({
	apiKey: z.string().min(1),
	baseUrl: z.string().url().optional(),
});
export type LLMCredential = z.infer<typeof LLMCredentialSchema>;

export const CredentialDataSchema = z.union([AlpacaCredentialSchema, LLMCredentialSchema]);

export const SaveCredentialRequestSchema = z.object({
	provider: CredentialProviderSchema,
	data: CredentialDataSchema,
	validate: z.boolean().default(true),
});
export type SaveCredentialRequest = z.infer<typeof SaveCredentialRequestSchema>;

export const DeleteCredentialRequestSchema = z.object({
	provider: CredentialProviderSchema,
});
export type DeleteCredentialRequest = z.infer<typeof DeleteCredentialRequestSchema>;

export const CredentialInfoSchema = z.object({
	provider: CredentialProviderSchema,
	paperMode: z.boolean().nullable(),
	lastValidatedAt: z.coerce.date().nullable(),
	validationError: z.string().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type CredentialInfo = z.infer<typeof CredentialInfoSchema>;
