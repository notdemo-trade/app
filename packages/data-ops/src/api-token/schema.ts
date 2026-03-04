import { z } from 'zod';

export const TokenTypeSchema = z.enum(['access', 'kill_switch']);
export type TokenType = z.infer<typeof TokenTypeSchema>;

export const CreateTokenRequestSchema = z.object({
	type: TokenTypeSchema,
});

export const RevokeTokenRequestSchema = z.object({
	type: TokenTypeSchema,
});

export const TokenResponseSchema = z.object({
	id: z.string().uuid(),
	type: TokenTypeSchema,
	tokenPrefix: z.string(),
	expiresAt: z.coerce.date(),
	lastUsedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
});

export const CreateTokenResponseSchema = TokenResponseSchema.extend({
	token: z.string(),
});

export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;
export type RevokeTokenRequest = z.infer<typeof RevokeTokenRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type CreateTokenResponse = z.infer<typeof CreateTokenResponseSchema>;
