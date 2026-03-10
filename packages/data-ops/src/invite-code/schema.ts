import { z } from 'zod';

export const INVITE_CODE_REGEX = /^NT-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const InviteCodeSchema = z.object({
	id: z.string().uuid(),
	code: z.string().regex(INVITE_CODE_REGEX),
	used: z.boolean(),
	usedByUserId: z.string().nullable(),
	usedAt: z.date().nullable(),
	createdAt: z.date(),
});

export const ActivateRequestSchema = z.object({
	code: z.string().regex(INVITE_CODE_REGEX, 'Invalid invite code format'),
	userId: z.string().min(1),
});

export const ActivateResponseSchema = z.object({
	activated: z.boolean(),
});

export type InviteCode = z.infer<typeof InviteCodeSchema>;
export type ActivateRequest = z.infer<typeof ActivateRequestSchema>;
export type ActivateResponse = z.infer<typeof ActivateResponseSchema>;
