import { getAuth } from '@repo/data-ops/auth/server';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../types/result';

interface SessionVariables {
	userId: string;
}

export const sessionAuthMiddleware = createMiddleware<{
	Bindings: Env;
	Variables: SessionVariables;
}>(async (c, next) => {
	// Trust X-Internal-User-Id from service bindings (not reachable from internet)
	const internalUserId = c.req.header('X-Internal-User-Id');
	if (internalUserId) {
		c.set('userId', internalUserId);
		return next();
	}

	const auth = getAuth();
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		throw new AppError('Valid session required', 401);
	}

	c.set('userId', session.user.id);
	await next();
});
