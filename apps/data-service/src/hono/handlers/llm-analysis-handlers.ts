import { zValidator } from '@hono/zod-validator';
import {
	AnalyzeRequestSchema,
	ClassifyRequestSchema,
	GetAnalysesRequestSchema,
	getAnalyses,
	getAnalysisById,
	getUsageSummary,
} from '@repo/data-ops/llm-analysis';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { LLMAnalysisAgent } from '../../agents/llm-analysis-agent';
import { rateLimiter } from '../middleware/rate-limiter';
import { sessionAuthMiddleware } from '../middleware/session-auth';

const llmRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

llmRouter.use('*', sessionAuthMiddleware);

const llmAnalysisLimit = rateLimiter({
	windowMs: 60_000,
	maxRequests: 10,
	keyGenerator: (c) => `llm:${c.get('userId')}`,
});

llmRouter.post(
	'/analyze',
	llmAnalysisLimit,
	zValidator('json', AnalyzeRequestSchema),
	async (c) => {
		const userId = c.get('userId');
		const request = c.req.valid('json');
		const agent = await getAgentByName<Env, LLMAnalysisAgent>(c.env.LLMAnalysisAgent, userId);
		const result = await agent.analyze(request);
		return c.json({ data: result });
	},
);

llmRouter.get('/analyses', zValidator('query', GetAnalysesRequestSchema), async (c) => {
	const userId = c.get('userId');
	const params = c.req.valid('query');
	const analyses = await getAnalyses(userId, params);
	return c.json({ data: analyses });
});

llmRouter.get('/analyses/:id', async (c) => {
	const userId = c.get('userId');
	const id = c.req.param('id');
	const analysis = await getAnalysisById(userId, id);
	if (!analysis) return c.json({ error: 'Not found' }, 404);
	return c.json({ data: analysis });
});

llmRouter.get('/usage', async (c) => {
	const days = Number(c.req.query('days') ?? 30);
	const userId = c.get('userId');
	const summary = await getUsageSummary(userId, days);
	return c.json({ data: summary });
});

llmRouter.post(
	'/classify',
	llmAnalysisLimit,
	zValidator('json', ClassifyRequestSchema),
	async (c) => {
		const userId = c.get('userId');
		const { content } = c.req.valid('json');
		const agent = await getAgentByName<Env, LLMAnalysisAgent>(c.env.LLMAnalysisAgent, userId);
		const result = await agent.classifyEvent(content);
		return c.json({ data: result });
	},
);

export { llmRouter };
