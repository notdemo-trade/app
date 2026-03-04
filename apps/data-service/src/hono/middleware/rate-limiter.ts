import type { Context, MiddlewareHandler } from 'hono';

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
	keyGenerator?: (c: Context) => string;
}

const requestCounts = new Map<string, { count: number; resetTime: number }>();
let requestCounter = 0;
const CLEANUP_INTERVAL = 100;

function cleanupExpired(now: number) {
	for (const [ip, record] of requestCounts) {
		if (now > record.resetTime) requestCounts.delete(ip);
	}
}

function defaultKeyGenerator(c: Context): string {
	return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
}

export const rateLimiter = (config: RateLimitConfig): MiddlewareHandler => {
	const getKey = config.keyGenerator ?? defaultKeyGenerator;

	return async (c, next) => {
		const key = getKey(c);
		const now = Date.now();

		if (++requestCounter % CLEANUP_INTERVAL === 0) cleanupExpired(now);

		const record = requestCounts.get(key);

		if (!record || now > record.resetTime) {
			requestCounts.set(key, { count: 1, resetTime: now + config.windowMs });
			return next();
		}

		if (record.count >= config.maxRequests) {
			return c.json({ error: 'Too many requests' }, 429);
		}

		record.count++;
		return next();
	};
};
