import { zValidator } from '@hono/zod-validator';
import { CreateTokenRequestSchema } from '@repo/data-ops/api-token';
import { Hono } from 'hono';
import { rateLimiter } from '../middleware/rate-limiter';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import { createToken, listTokens, revokeToken } from '../services/token-service';
import { AppError } from '../types/result';
import { resultToResponse } from '../utils/result-to-response';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tokens = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

tokens.use('*', sessionAuthMiddleware);

tokens.get('/', async (c) => {
	const userId = c.get('userId');
	const result = await listTokens(userId);
	return resultToResponse(c, result);
});

tokens.post(
	'/',
	rateLimiter({
		windowMs: 60_000,
		maxRequests: 5,
		keyGenerator: (c) => c.get('userId') || 'anonymous',
	}),
	zValidator('json', CreateTokenRequestSchema),
	async (c) => {
		const userId = c.get('userId');
		const { type } = c.req.valid('json');
		const result = await createToken(userId, type);
		return resultToResponse(c, result, 201);
	},
);

tokens.delete('/:id', async (c) => {
	const id = c.req.param('id');
	if (!UUID_RE.test(id)) {
		throw new AppError('Invalid token ID', 400, 'INVALID_ID');
	}
	const userId = c.get('userId');
	const result = await revokeToken(id, userId);
	if (result.ok) {
		return c.json({ revoked: true });
	}
	return resultToResponse(c, result);
});

export default tokens;
