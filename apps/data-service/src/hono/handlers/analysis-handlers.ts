import { zValidator } from '@hono/zod-validator';
import { BatchAnalysisRequestSchema, GetAnalysisRequestSchema } from '@repo/data-ops/analysis';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { TechnicalAnalysisAgent } from '../../agents/technical-analysis-agent';
import { sessionAuthMiddleware } from '../middleware/session-auth';

interface AnalysisErrorResult {
	error: string;
}

interface AnalysisSuccessResult {
	indicators: unknown;
	signals: unknown;
}

type BatchResultEntry = AnalysisSuccessResult | AnalysisErrorResult;

const analysisRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

analysisRouter.use('*', sessionAuthMiddleware);

analysisRouter.get(
	'/:symbol',
	zValidator('query', GetAnalysisRequestSchema.omit({ symbol: true })),
	async (c) => {
		const userId = c.get('userId');
		const symbol = c.req.param('symbol').toUpperCase();
		const { timeframe } = c.req.valid('query');

		const agent = await getAgentByName<Env, TechnicalAnalysisAgent>(
			c.env.TechnicalAnalysisAgent,
			`${userId}:${symbol}`,
		);
		const result = await agent.analyze(timeframe);
		return c.json({ data: result });
	},
);

analysisRouter.post('/batch', zValidator('json', BatchAnalysisRequestSchema), async (c) => {
	const userId = c.get('userId');
	const { symbols, timeframe } = c.req.valid('json');

	const results: Record<string, BatchResultEntry> = {};
	const settled = await Promise.allSettled(
		symbols.map(async (sym) => {
			const agent = await getAgentByName<Env, TechnicalAnalysisAgent>(
				c.env.TechnicalAnalysisAgent,
				`${userId}:${sym}`,
			);
			const result = await agent.analyze(timeframe);
			return { sym, result };
		}),
	);

	for (let i = 0; i < settled.length; i++) {
		const s = settled[i];
		const sym = symbols[i];
		if (!s || !sym) continue;
		if (s.status === 'fulfilled') {
			results[s.value.sym] = {
				indicators: s.value.result.indicators,
				signals: s.value.result.signals,
			};
		} else {
			results[sym] = { error: String(s.reason) };
		}
	}

	return c.json({ data: results });
});

analysisRouter.get('/:symbol/indicators', async (c) => {
	const userId = c.get('userId');
	const symbol = c.req.param('symbol').toUpperCase();
	const agent = await getAgentByName<Env, TechnicalAnalysisAgent>(
		c.env.TechnicalAnalysisAgent,
		`${userId}:${symbol}`,
	);
	const indicators = await agent.getIndicators();
	return c.json({ data: indicators });
});

export { analysisRouter };
