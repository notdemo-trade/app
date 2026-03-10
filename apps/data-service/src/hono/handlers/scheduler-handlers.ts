import { getAgentByName } from 'agents';
import { Hono } from 'hono';
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

export default scheduler;
