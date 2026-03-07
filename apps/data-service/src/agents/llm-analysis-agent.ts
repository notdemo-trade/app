import type {
	AnalysisRequest,
	ClassifyEventResult,
	GenerateReportResult,
	LLMAgentState,
	LLMAnalysisResult,
	LLMProviderConfig,
	LLMProviderName,
	StrategyTemplate,
	TradeRecommendation,
	UsageSummaryResult,
} from '@repo/data-ops/agents/llm/types';
import type { LLMCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import { initDatabase } from '@repo/data-ops/database/setup';
import { insertAnalysis, updateUsage } from '@repo/data-ops/llm-analysis';
import {
	createLLMProvider,
	EVENT_CLASSIFICATION_PROMPT,
	estimateCost,
	RESEARCH_REPORT_PROMPT,
	TRADE_RECOMMENDATION_PROMPT,
} from '@repo/data-ops/providers/llm';
import { Agent, callable } from 'agents';

const LLM_PROVIDERS: LLMProviderName[] = [
	'openai',
	'anthropic',
	'google',
	'xai',
	'deepseek',
	'workers-ai',
];

const DEFAULT_MODELS: Record<LLMProviderName, string> = {
	openai: 'gpt-4o',
	anthropic: 'claude-sonnet-4-20250514',
	google: 'gemini-2.0-flash',
	xai: 'grok-2',
	deepseek: 'deepseek-chat',
	'workers-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

export class LLMAnalysisAgent extends Agent<Env, LLMAgentState> {
	initialState: LLMAgentState = {
		totalAnalyses: 0,
		totalTokens: 0,
		totalCostUsd: 0,
		lastAnalysisAt: null,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.sql`CREATE TABLE IF NOT EXISTS usage_log (
			id TEXT PRIMARY KEY, symbol TEXT NOT NULL, model TEXT NOT NULL, provider TEXT NOT NULL,
			prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL,
			total_tokens INTEGER NOT NULL, estimated_cost_usd REAL NOT NULL,
			strategy_id TEXT, created_at TEXT NOT NULL
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS provider_config (
			key TEXT PRIMARY KEY DEFAULT 'main', data TEXT NOT NULL
		)`;
	}

	@callable()
	async analyze(request: AnalysisRequest): Promise<LLMAnalysisResult> {
		const userId = this.name;
		const config = await this.resolveProviderConfig(userId);
		const llm = createLLMProvider(config);

		const strategyContext = buildStrategyContext(request.strategy);
		const contextStr = JSON.stringify(
			{
				symbol: request.symbol,
				signals: request.signals,
				technicals: request.technicals,
			},
			null,
			2,
		);

		const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

		const recResult = await llm.complete({
			messages: [
				{ role: 'system', content: `You are a trading analyst. ${strategyContext}` },
				{ role: 'user', content: TRADE_RECOMMENDATION_PROMPT + contextStr },
			],
			temperature: 0.3,
			max_tokens: 800,
			response_format: { type: 'json_object' },
		});

		totalUsage.prompt_tokens += recResult.usage.prompt_tokens;
		totalUsage.completion_tokens += recResult.usage.completion_tokens;
		totalUsage.total_tokens += recResult.usage.total_tokens;

		const recommendation = parseRecommendation(recResult.content);

		let research: string | undefined;
		if (request.includeResearch) {
			const resResult = await llm.complete({
				messages: [
					{ role: 'system', content: RESEARCH_REPORT_PROMPT },
					{
						role: 'user',
						content: `Research report for ${request.symbol}.\n\nContext:\n${contextStr}`,
					},
				],
				temperature: 0.5,
				max_tokens: 2000,
			});
			research = resResult.content;
			totalUsage.prompt_tokens += resResult.usage.prompt_tokens;
			totalUsage.completion_tokens += resResult.usage.completion_tokens;
			totalUsage.total_tokens += resResult.usage.total_tokens;
		}

		const cost = estimateCost(config.model, totalUsage.prompt_tokens, totalUsage.completion_tokens);

		const result: LLMAnalysisResult = {
			id: crypto.randomUUID(),
			userId,
			symbol: request.symbol,
			timestamp: new Date().toISOString(),
			recommendation,
			research,
			strategyId: request.strategy.id,
			usage: { ...totalUsage, estimated_cost_usd: cost },
			model: config.model,
			provider: config.provider,
		};

		this
			.sql`INSERT INTO usage_log (id, symbol, model, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, strategy_id, created_at)
			VALUES (${result.id}, ${result.symbol}, ${result.model}, ${result.provider}, ${totalUsage.prompt_tokens}, ${totalUsage.completion_tokens}, ${totalUsage.total_tokens}, ${cost}, ${request.strategy.id}, ${result.timestamp})`;

		await insertAnalysis(result);
		await updateUsage(userId, result.provider, result.model, {
			promptTokens: totalUsage.prompt_tokens,
			completionTokens: totalUsage.completion_tokens,
			totalTokens: totalUsage.total_tokens,
			estimatedCostUsd: cost,
		});

		this.setState({
			...this.state,
			totalAnalyses: this.state.totalAnalyses + 1,
			totalTokens: this.state.totalTokens + totalUsage.total_tokens,
			totalCostUsd: this.state.totalCostUsd + cost,
			lastAnalysisAt: new Date().toISOString(),
		});

		return result;
	}

	@callable()
	async classifyEvent(rawContent: string): Promise<ClassifyEventResult> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const result = await llm.complete({
			messages: [
				{ role: 'system', content: 'You are a precise financial event classifier.' },
				{
					role: 'user',
					content: EVENT_CLASSIFICATION_PROMPT + rawContent.slice(0, 4000),
				},
			],
			temperature: 0.3,
			max_tokens: 500,
			response_format: { type: 'json_object' },
		});

		const parsed = JSON.parse(result.content) as Record<string, unknown>;
		return {
			event_type: String(parsed.event_type || 'rumor'),
			symbols: Array.isArray(parsed.symbols) ? parsed.symbols.map(String) : [],
			summary: String(parsed.summary || rawContent.slice(0, 200)),
			confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
		};
	}

	@callable()
	async generateReport(
		symbol: string,
		context: Record<string, unknown>,
	): Promise<GenerateReportResult> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const result = await llm.complete({
			messages: [
				{ role: 'system', content: RESEARCH_REPORT_PROMPT },
				{
					role: 'user',
					content: `Research report for ${symbol}.\n\n${JSON.stringify(context, null, 2)}`,
				},
			],
			temperature: 0.5,
			max_tokens: 2000,
		});

		return { report: result.content };
	}

	@callable()
	async getUsage(days = 30): Promise<UsageSummaryResult> {
		const since = new Date(Date.now() - days * 86_400_000).toISOString();
		const rows = this.sql<{ total_tokens: number; estimated_cost_usd: number }>`
			SELECT SUM(total_tokens) as total_tokens, SUM(estimated_cost_usd) as estimated_cost_usd
			FROM usage_log WHERE created_at >= ${since}
		`;
		return {
			totalTokens: rows[0]?.total_tokens ?? 0,
			totalCostUsd: rows[0]?.estimated_cost_usd ?? 0,
		};
	}

	private async resolveProviderConfig(userId: string): Promise<LLMProviderConfig> {
		const cached = this.sql<{ data: string }>`SELECT data FROM provider_config WHERE key = 'main'`;
		if (cached[0]) {
			const config = JSON.parse(cached[0].data) as LLMProviderConfig;

			if (config.provider === 'workers-ai') {
				return {
					provider: 'workers-ai',
					model: config.model,
					aiBinding: this.env.AI,
				};
			}

			const cred = await getCredential<LLMCredential>({
				userId,
				provider: config.provider,
				masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY,
			});
			if (cred) {
				return {
					provider: config.provider,
					apiKey: cred.apiKey,
					model: config.model,
					baseUrl: cred.baseUrl,
				};
			}
		}

		for (const provider of LLM_PROVIDERS) {
			if (provider === 'workers-ai') {
				return {
					provider: 'workers-ai',
					model: DEFAULT_MODELS['workers-ai'],
					aiBinding: this.env.AI,
				};
			}
			const cred = await getCredential<LLMCredential>({
				userId,
				provider,
				masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY,
			});
			if (cred) {
				const model = DEFAULT_MODELS[provider];
				this
					.sql`INSERT OR REPLACE INTO provider_config (key, data) VALUES ('main', ${JSON.stringify({ provider, model })})`;
				return {
					provider,
					apiKey: cred.apiKey,
					model,
					baseUrl: cred.baseUrl,
				};
			}
		}

		throw new Error('No LLM provider available');
	}

	async setProviderConfig(config: { provider: LLMProviderName; model: string }): Promise<void> {
		this
			.sql`INSERT OR REPLACE INTO provider_config (key, data) VALUES ('main', ${JSON.stringify(config)})`;
	}
}

function buildStrategyContext(strategy: StrategyTemplate): string {
	return `Risk tolerance: ${strategy.riskTolerance}. Position size bias: ${strategy.positionSizeBias * 100}%. Preferred timeframe: ${strategy.preferredTimeframe}. Focus: ${strategy.analysisFocus.join(', ')}.${strategy.customPromptSuffix ? ` ${strategy.customPromptSuffix}` : ''}`;
}

function parseRecommendation(content: string): TradeRecommendation {
	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		const action = String(parsed.action);
		return {
			action: ['buy', 'sell', 'hold'].includes(action)
				? (action as 'buy' | 'sell' | 'hold')
				: 'hold',
			confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
			rationale: String(parsed.rationale || 'Insufficient data'),
			entry_price: typeof parsed.entry_price === 'number' ? parsed.entry_price : undefined,
			target_price: typeof parsed.target_price === 'number' ? parsed.target_price : undefined,
			stop_loss: typeof parsed.stop_loss === 'number' ? parsed.stop_loss : undefined,
			position_size_pct: Math.max(1, Math.min(10, Number(parsed.position_size_pct) || 2)),
			timeframe: ['intraday', 'swing', 'position'].includes(String(parsed.timeframe))
				? String(parsed.timeframe)
				: 'swing',
			risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
		};
	} catch {
		return {
			action: 'hold',
			confidence: 0.1,
			rationale: 'Failed to parse LLM response',
			risks: ['Analysis error'],
		};
	}
}
