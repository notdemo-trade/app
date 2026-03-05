import { zValidator } from '@hono/zod-validator';
import { ListOrdersRequestSchema, PortfolioHistoryRequestSchema } from '@repo/data-ops/portfolio';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import * as portfolioService from '../services/portfolio-service';
import { resultToResponse } from '../utils/result-to-response';

const portfolio = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

portfolio.use('*', sessionAuthMiddleware);

function getServiceContext(c: { get: (key: 'userId') => string; env: Env }) {
	return {
		userId: c.get('userId'),
		masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
	};
}

portfolio.get('/account', async (c) => {
	const result = await portfolioService.getAccount(getServiceContext(c));
	return resultToResponse(c, result);
});

portfolio.get('/positions', async (c) => {
	const result = await portfolioService.getPositions(getServiceContext(c));
	return resultToResponse(c, result);
});

portfolio.get('/orders', zValidator('query', ListOrdersRequestSchema), async (c) => {
	const params = c.req.valid('query');
	const result = await portfolioService.getOrders(getServiceContext(c), params);
	return resultToResponse(c, result);
});

portfolio.get('/clock', async (c) => {
	const result = await portfolioService.getClock(getServiceContext(c));
	return resultToResponse(c, result);
});

portfolio.get(
	'/portfolio-history',
	zValidator('query', PortfolioHistoryRequestSchema),
	async (c) => {
		const params = c.req.valid('query');
		const result = await portfolioService.getPortfolioHistory(getServiceContext(c), params);
		return resultToResponse(c, result);
	},
);

export default portfolio;
