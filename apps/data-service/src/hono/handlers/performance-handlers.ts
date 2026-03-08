import type { ScoreWindow } from '@repo/data-ops/agents/memory/types';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { DebateOrchestratorAgent } from '../../agents/debate-orchestrator-agent';
import type { PipelineOrchestratorAgent } from '../../agents/pipeline-orchestrator-agent';
import type { SessionAgent } from '../../agents/session-agent';
import { sessionAuthMiddleware } from '../middleware/session-auth';

const VALID_WINDOWS = new Set([30, 90, 180]);

function parseWindowDays(raw: string | undefined): ScoreWindow {
	const n = Number(raw);
	return VALID_WINDOWS.has(n) ? (n as ScoreWindow) : 30;
}

const performanceRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

performanceRouter.use('*', sessionAuthMiddleware);

performanceRouter.get('/scores', async (c) => {
	const userId = c.get('userId');
	const windowDays = parseWindowDays(c.req.query('window'));

	try {
		const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
			c.env.DebateOrchestratorAgent,
			userId,
		);
		const scores = await debate.getPersonaScores(windowDays);
		return c.json({ data: { mode: 'debate' as const, scores } });
	} catch {
		// No debate agent available, try pipeline
	}

	try {
		const pipeline = await getAgentByName<Env, PipelineOrchestratorAgent>(
			c.env.PipelineOrchestratorAgent,
			userId,
		);
		const scores = await pipeline.getPipelineScores(windowDays);
		return c.json({ data: { mode: 'pipeline' as const, scores } });
	} catch {
		return c.json({ data: { mode: 'none' as const, scores: [] } });
	}
});

performanceRouter.get('/patterns/:personaId', async (c) => {
	const userId = c.get('userId');
	const personaId = c.req.param('personaId');
	const symbol = c.req.query('symbol');

	const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
		c.env.DebateOrchestratorAgent,
		userId,
	);
	const patterns = await debate.getPersonaPatterns(personaId, symbol);
	return c.json({ data: patterns });
});

performanceRouter.get('/outcomes', async (c) => {
	const userId = c.get('userId');
	const status = c.req.query('status');

	const session = await getAgentByName<Env, SessionAgent>(c.env.SessionAgent, userId);
	const outcomes = await session.getOutcomes(status);
	return c.json({ data: outcomes });
});

performanceRouter.get('/snapshots/:outcomeId', async (c) => {
	const userId = c.get('userId');
	const outcomeId = c.req.param('outcomeId');

	const session = await getAgentByName<Env, SessionAgent>(c.env.SessionAgent, userId);
	const snapshots = await session.getOutcomeSnapshots(outcomeId);
	return c.json({ data: snapshots });
});

export { performanceRouter };
