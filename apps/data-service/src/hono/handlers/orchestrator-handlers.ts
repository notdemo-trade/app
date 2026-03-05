import { zValidator } from '@hono/zod-validator';
import {
	EntitlementUpdateSchema,
	OrchestratorConfigSchema,
} from '@repo/data-ops/agents/orchestrator/schema';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { OrchestratorAgent } from '../../agents/orchestrator-agent';
import { sessionAuthMiddleware } from '../middleware/session-auth';

const orchestratorRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

function getAgent(env: Env, userId: string) {
	return getAgentByName<Env, OrchestratorAgent>(env.OrchestratorAgent, userId);
}

orchestratorRouter.post('/enable', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(await agent.enable());
});

orchestratorRouter.post('/disable', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(await agent.disable());
});

orchestratorRouter.get('/status', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(await agent.getStatus());
});

orchestratorRouter.get('/config', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(agent.getOrchestratorConfig());
});

orchestratorRouter.post(
	'/config',
	sessionAuthMiddleware,
	zValidator('json', OrchestratorConfigSchema),
	async (c) => {
		const agent = await getAgent(c.env, c.get('userId'));
		return c.json(await agent.updateConfig(c.req.valid('json')));
	},
);

orchestratorRouter.post(
	'/entitlements',
	sessionAuthMiddleware,
	zValidator('json', EntitlementUpdateSchema),
	async (c) => {
		const { agentType, enabled } = c.req.valid('json');
		const agent = await getAgent(c.env, c.get('userId'));
		return c.json(await agent.updateEntitlement(agentType, enabled));
	},
);

orchestratorRouter.post('/trigger', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(await agent.trigger());
});

orchestratorRouter.get('/activity', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	return c.json(await agent.getActivity());
});

orchestratorRouter.get('/recommendations', sessionAuthMiddleware, async (c) => {
	const agent = await getAgent(c.env, c.get('userId'));
	const limit = Number(c.req.query('limit') ?? 20);
	return c.json(agent.getRecommendations(limit));
});

export { orchestratorRouter };
