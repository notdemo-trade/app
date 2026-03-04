import type { TokenType } from '@repo/data-ops/api-token';
import { validateApiToken } from '@repo/data-ops/api-token';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../types/result';

interface AuthVariables {
	userId: string;
	tokenType: TokenType;
}

export const apiTokenMiddleware = createMiddleware<{
	Bindings: Env;
	Variables: AuthVariables;
}>(async (c, next) => {
	const authHeader = c.req.header('Authorization');

	if (!authHeader?.startsWith('Bearer ')) {
		throw new AppError('Authorization header required', 401);
	}

	const token = authHeader.slice(7);
	const result = await validateApiToken(token);

	if (!result) {
		throw new AppError('Invalid, expired, or revoked token', 401);
	}

	c.set('userId', result.userId);
	c.set('tokenType', result.type);
	await next();
});

export const killSwitchTokenMiddleware = createMiddleware<{
	Bindings: Env;
	Variables: AuthVariables;
}>(async (c, next) => {
	const authHeader = c.req.header('Authorization');

	if (!authHeader?.startsWith('Bearer ')) {
		throw new AppError('Authorization required', 401);
	}

	const token = authHeader.slice(7);
	const result = await validateApiToken(token);

	if (!result || result.type !== 'kill_switch') {
		throw new AppError('Kill switch token required', 403);
	}

	c.set('userId', result.userId);
	c.set('tokenType', result.type);
	await next();
});
