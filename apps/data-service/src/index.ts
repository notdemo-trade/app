import { WorkerEntrypoint } from 'cloudflare:workers';
import { setAuth } from '@repo/data-ops/auth/server';
import { getDb, initDatabase } from '@repo/data-ops/database/setup';
import { routeAgentRequest } from 'agents';
import { App } from '@/hono/app';
import { handleQueue } from './queues';
import { handleScheduled } from './scheduled';

export { AlpacaBrokerAgent } from './agents/alpaca-broker-agent';
export { AlphaVantageDataAgent } from './agents/alpha-vantage-data-agent';
export { DataSchedulerAgent } from './agents/data-scheduler-agent';
export { DebateOrchestratorAgent } from './agents/debate-orchestrator-agent';
export { EarningsAgent } from './agents/earnings-agent';
export { FundamentalsAgent } from './agents/fundamentals-agent';
export { LLMAnalysisAgent } from './agents/llm-analysis-agent';
export { MarketIntelligenceAgent } from './agents/market-intelligence-agent';
export { PipelineOrchestratorAgent } from './agents/pipeline-orchestrator-agent';
export { SessionAgent } from './agents/session-agent';
export { TechnicalAnalysisAgent } from './agents/technical-analysis-agent';

export default class DataService extends WorkerEntrypoint<Env> {
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		console.log(`Data Service Worker starting up on ${env.CLOUDFLARE_ENV} environment`);
		initDatabase({
			host: env.DATABASE_HOST,
			username: env.DATABASE_USERNAME,
			password: env.DATABASE_PASSWORD,
		});
		const baseURLMap: Record<string, string> = {
			dev: 'http://localhost:8788',
			staging: 'https://api-staging.notdemo.trade',
			production: 'https://api.notdemo.trade',
		};
		setAuth({
			secret: env.BETTER_AUTH_SECRET,
			baseURL: baseURLMap[env.CLOUDFLARE_ENV] ?? baseURLMap.dev,
			adapter: { drizzleDb: getDb(), provider: 'pg' },
		});
	}
	async fetch(request: Request) {
		const agentResponse = await routeAgentRequest(request, this.env);
		if (agentResponse) return agentResponse;
		return App.fetch(request, this.env, this.ctx);
	}

	async scheduled(controller: ScheduledController) {
		await handleScheduled(controller, this.env, this.ctx);
	}

	async queue(batch: MessageBatch<ExampleQueueMessage>) {
		await handleQueue(batch, this.env);
	}
}
