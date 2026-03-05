import { zValidator } from '@hono/zod-validator';
import { UpdateTradingConfigRequestSchema } from '@repo/data-ops/trading-config';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import { getUserTradingConfig, updateUserTradingConfig } from '../services/trading-config-service';
import { resultToResponse } from '../utils/result-to-response';

const tradingConfig = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

tradingConfig.use('*', sessionAuthMiddleware);

tradingConfig.get('/', async (c) => {
	const userId = c.get('userId');
	const result = await getUserTradingConfig(userId);
	return resultToResponse(c, result);
});

tradingConfig.patch('/', zValidator('json', UpdateTradingConfigRequestSchema), async (c) => {
	const userId = c.get('userId');
	const updates = c.req.valid('json');
	const result = await updateUserTradingConfig(userId, updates);
	return resultToResponse(c, result);
});

export default tradingConfig;
