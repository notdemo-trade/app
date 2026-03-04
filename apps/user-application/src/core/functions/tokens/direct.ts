import {
	createApiToken,
	listUserTokens,
	revokeApiTokenByType,
	TokenTypeSchema,
} from '@repo/data-ops/api-token';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

export const listTokens = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		return listUserTokens(context.userId);
	});

export const createToken = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ type: TokenTypeSchema }))
	.handler(async ({ data, context }) => {
		return createApiToken(context.userId, data.type);
	});

export const revokeToken = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ type: TokenTypeSchema }))
	.handler(async ({ data, context }) => {
		return revokeApiTokenByType(context.userId, data.type);
	});
