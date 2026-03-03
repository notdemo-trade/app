import type { LivenessResponse, ReadinessResponse } from '@repo/data-ops/health';
import { Hono } from 'hono';
import { rateLimiter } from '../middleware/rate-limiter';
import { checkDatabase } from '../services/health-service';
import { resultToResponse } from '../utils/result-to-response';

const health = new Hono<{ Bindings: Env }>();

health.get('/live', (c) => {
	const response: LivenessResponse = {
		status: 'ok',
		time: new Date().toISOString(),
	};
	return c.json(response);
});

health.get('/ready', rateLimiter({ windowMs: 60000, maxRequests: 10 }), async (c) => {
	const result = await checkDatabase();
	if (!result.ok) {
		return resultToResponse(c, result);
	}
	const dbStatus = result.data;
	const response: ReadinessResponse = {
		status: dbStatus === 'connected' ? 'ok' : 'degraded',
		env: c.env.CLOUDFLARE_ENV,
		service: 'notdemo-trade-ds',
		time: new Date().toISOString(),
		database: dbStatus,
	};
	return c.json(response, dbStatus === 'connected' ? 200 : 503);
});

export default health;
