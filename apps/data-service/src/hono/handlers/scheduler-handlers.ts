import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { AlphaVantageDataAgent } from '../../agents/alpha-vantage-data-agent';
import type { DataSchedulerAgent } from '../../agents/data-scheduler-agent';
import { apiTokenMiddleware } from '../middleware/auth';

const scheduler = new Hono<{ Bindings: Env }>();

scheduler.post('/start', apiTokenMiddleware, async (c) => {
	const agent = await getAgentByName<DataSchedulerAgent>(c.env.DataSchedulerAgent, 'global');
	const result = await agent.startScheduling();
	return c.json(result);
});

scheduler.post('/stop', apiTokenMiddleware, async (c) => {
	const agent = await getAgentByName<DataSchedulerAgent>(c.env.DataSchedulerAgent, 'global');
	const result = await agent.stopScheduling();
	return c.json(result);
});

scheduler.post('/enrich/:symbol', apiTokenMiddleware, async (c) => {
	const symbol = c.req.param('symbol').toUpperCase();
	const agent = await getAgentByName<DataSchedulerAgent>(c.env.DataSchedulerAgent, 'global');
	const result = await agent.fetchEnrichmentNow(symbol);
	return c.json({ symbol, ...result });
});

scheduler.post('/bars/:symbol', apiTokenMiddleware, async (c) => {
	const symbol = c.req.param('symbol').toUpperCase();
	const timeframe = (c.req.query('timeframe') ?? '1Day') as string;
	const agent = await getAgentByName<AlphaVantageDataAgent>(c.env.AlphaVantageDataAgent, 'global');
	const result = await agent.fetchAndStoreBars(symbol, timeframe);
	return c.json(result);
});

export default scheduler;
