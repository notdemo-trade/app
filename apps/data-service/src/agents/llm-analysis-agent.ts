import type { BrokerAccount, BrokerPosition } from '@repo/data-ops/agents/broker/types';
import type {
	AnalyzeAsPersonaData,
	ConsensusResult,
	DebateRound,
	PersonaAnalysis,
	PersonaConfig,
	PersonaResponse,
	RiskValidation,
} from '@repo/data-ops/agents/debate/types';
import type {
	AnalysisRequest,
	ClassifyEventResult,
	CompletionMessage,
	GenerateReportResult,
	LLMAgentState,
	LLMAnalysisResult,
	LLMProviderConfig,
	LLMProviderName,
	StrategyTemplate,
	TradeRecommendation,
	UsageSummaryResult,
} from '@repo/data-ops/agents/llm/types';
import type { PerformanceContext, PersonaComparisonRow } from '@repo/data-ops/agents/memory/types';
import type { LLMCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import { initDatabase } from '@repo/data-ops/database/setup';
import { insertAnalysis, updateUsage } from '@repo/data-ops/llm-analysis';
import {
	CONSENSUS_SYNTHESIS_PROMPT,
	createLLMProvider,
	DEBATE_ROUND_PROMPT,
	EVENT_CLASSIFICATION_PROMPT,
	estimateCost,
	PERSONA_ANALYSIS_PROMPT,
	RESEARCH_REPORT_PROMPT,
	RISK_VALIDATION_PROMPT,
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

	@callable()
	async analyzeAsPersona(
		persona: PersonaConfig,
		data: AnalyzeAsPersonaData,
		strategy: StrategyTemplate,
		performanceContext?: PerformanceContext,
	): Promise<PersonaAnalysis> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const strategyContext = buildStrategyContext(strategy);
		const contextStr = JSON.stringify(
			{ symbol: data.symbol, signals: data.signals, indicators: data.indicators },
			null,
			2,
		);

		const perfBlock = performanceContext
			? buildPerformanceContextBlock(performanceContext, data.symbol)
			: '';
		const systemPrompt = perfBlock
			? `${persona.systemPrompt}\n\n${perfBlock}`
			: persona.systemPrompt;

		const messages: CompletionMessage[] = [
			{ role: 'system', content: systemPrompt },
			{
				role: 'user',
				content: `${PERSONA_ANALYSIS_PROMPT}${contextStr}\n\nStrategy: ${strategyContext}`,
			},
		];

		const result = await llm.complete({
			messages,
			temperature: 0.4,
			max_tokens: 800,
			response_format: { type: 'json_object' },
		});

		const parsed = parsePersonaAnalysis(result.content, persona.id);
		this.logUsage('analyzeAsPersona', config.model, result.usage);

		return parsed;
	}

	@callable()
	async runDebateRound(
		session: { analyses: PersonaAnalysis[]; previousRounds: DebateRound[] },
		roundNumber: number,
		personas: PersonaConfig[],
	): Promise<DebateRound> {
		const responses = await Promise.all(
			personas.map((persona) => this.generateDebateResponse(persona, session, roundNumber)),
		);

		return { roundNumber, responses };
	}

	@callable()
	async synthesizeConsensus(
		analyses: PersonaAnalysis[],
		debateRounds: DebateRound[],
		moderatorPrompt: string,
		personaComparison?: PersonaComparisonRow[],
	): Promise<ConsensusResult> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const transcript = buildConsensusTranscript(analyses, debateRounds);

		let enrichedPrompt = moderatorPrompt;
		if (personaComparison && personaComparison.length > 0) {
			enrichedPrompt = `${moderatorPrompt}\n\n${buildComparisonTable(personaComparison)}`;
		}

		const messages: CompletionMessage[] = [
			{ role: 'system', content: enrichedPrompt },
			{ role: 'user', content: `${CONSENSUS_SYNTHESIS_PROMPT}${transcript}` },
		];

		const result = await llm.complete({
			messages,
			temperature: 0.3,
			max_tokens: 1000,
			response_format: { type: 'json_object' },
		});

		this.logUsage('synthesizeConsensus', config.model, result.usage);
		return parseConsensusResult(result.content);
	}

	@callable()
	async validateRisk(
		recommendation: TradeRecommendation,
		portfolio: { positions: BrokerPosition[]; account: BrokerAccount },
	): Promise<RiskValidation> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const contextStr = JSON.stringify(
			{
				recommendation: {
					action: recommendation.action,
					confidence: recommendation.confidence,
					rationale: recommendation.rationale,
					positionSizePct: recommendation.position_size_pct,
					entryPrice: recommendation.entry_price,
					targetPrice: recommendation.target_price,
					stopLoss: recommendation.stop_loss,
					risks: recommendation.risks,
				},
				portfolio: {
					cash: portfolio.account.cash,
					portfolioValue: portfolio.account.portfolioValue,
					buyingPower: portfolio.account.buyingPower,
					positions: portfolio.positions.map((p) => ({
						symbol: p.symbol,
						qty: p.qty,
						side: p.side,
						marketValue: p.marketValue,
						unrealizedPl: p.unrealizedPl,
					})),
				},
			},
			null,
			2,
		);

		const messages: CompletionMessage[] = [
			{ role: 'system', content: RISK_VALIDATION_PROMPT },
			{ role: 'user', content: contextStr },
		];

		const result = await llm.complete({
			messages,
			temperature: 0.2,
			max_tokens: 600,
			response_format: { type: 'json_object' },
		});

		this.logUsage('validateRisk', config.model, result.usage);
		return parseRiskValidation(result.content);
	}

	private async generateDebateResponse(
		persona: PersonaConfig,
		session: { analyses: PersonaAnalysis[]; previousRounds: DebateRound[] },
		roundNumber: number,
	): Promise<PersonaResponse> {
		const config = await this.resolveProviderConfig(this.name);
		const llm = createLLMProvider(config);

		const otherAnalyses = session.analyses.filter((a) => a.personaId !== persona.id);
		const contextStr = JSON.stringify(
			{
				myPreviousAnalysis: session.analyses.find((a) => a.personaId === persona.id),
				otherAnalyses,
				previousRounds: session.previousRounds,
				currentRound: roundNumber,
			},
			null,
			2,
		);

		const messages: CompletionMessage[] = [
			{ role: 'system', content: persona.systemPrompt },
			{ role: 'user', content: `${DEBATE_ROUND_PROMPT}${contextStr}` },
		];

		const result = await llm.complete({
			messages,
			temperature: 0.5,
			max_tokens: 600,
			response_format: { type: 'json_object' },
		});

		this.logUsage('runDebateRound', config.model, result.usage);
		return parseDebateResponse(
			result.content,
			persona.id,
			otherAnalyses.map((a) => a.personaId),
		);
	}

	private logUsage(
		method: string,
		model: string,
		usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
	): void {
		const cost = estimateCost(model, usage.prompt_tokens, usage.completion_tokens);
		this
			.sql`INSERT INTO usage_log (id, symbol, model, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, strategy_id, created_at)
			VALUES (${crypto.randomUUID()}, ${method}, ${model}, ${'persona'}, ${usage.prompt_tokens}, ${usage.completion_tokens}, ${usage.total_tokens}, ${cost}, ${null}, ${new Date().toISOString()})`;

		this.setState({
			...this.state,
			totalTokens: this.state.totalTokens + usage.total_tokens,
			totalCostUsd: this.state.totalCostUsd + cost,
		});
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

	@callable()
	async setProviderConfig(config: { provider: LLMProviderName; model: string }): Promise<void> {
		this
			.sql`INSERT OR REPLACE INTO provider_config (key, data) VALUES ('main', ${JSON.stringify(config)})`;
	}
}

function buildStrategyContext(strategy: StrategyTemplate): string {
	return `Risk tolerance: ${strategy.riskTolerance}. Position size bias: ${strategy.positionSizeBias * 100}%. Preferred timeframe: ${strategy.preferredTimeframe}. Focus: ${strategy.analysisFocus.join(', ')}.${strategy.customPromptSuffix ? ` ${strategy.customPromptSuffix}` : ''}`;
}

/** Strip markdown code fences and whitespace so JSON.parse succeeds. */
function cleanJsonResponse(raw: string): string {
	let s = raw.trim();
	if (s.startsWith('```')) {
		s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
	}
	return s.trim();
}

function parsePersonaAnalysis(content: string, personaId: string): PersonaAnalysis {
	try {
		const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
		const action = String(parsed.action);
		return {
			personaId,
			action: ['buy', 'sell', 'hold'].includes(action)
				? (action as 'buy' | 'sell' | 'hold')
				: 'hold',
			confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
			rationale: String(parsed.rationale || 'No rationale provided'),
			keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
		};
	} catch {
		return {
			personaId,
			action: 'hold',
			confidence: 0.1,
			rationale: 'Failed to parse persona response',
			keyPoints: [],
		};
	}
}

function parseDebateResponse(
	content: string,
	personaId: string,
	respondingTo: string[],
): PersonaResponse {
	try {
		const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
		const action = String(parsed.revisedAction);
		return {
			personaId,
			respondingTo,
			content: String(parsed.content || 'No response'),
			revisedConfidence: Math.max(0, Math.min(1, Number(parsed.revisedConfidence) || 0.5)),
			revisedAction: ['buy', 'sell', 'hold'].includes(action)
				? (action as 'buy' | 'sell' | 'hold')
				: 'hold',
		};
	} catch {
		return {
			personaId,
			respondingTo,
			content: 'Failed to parse debate response',
			revisedConfidence: 0.5,
			revisedAction: 'hold',
		};
	}
}

function parseConsensusResult(content: string): ConsensusResult {
	try {
		const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
		const action = String(parsed.action);
		return {
			action: ['buy', 'sell', 'hold'].includes(action)
				? (action as 'buy' | 'sell' | 'hold')
				: 'hold',
			confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
			rationale: String(parsed.rationale || 'No consensus rationale'),
			dissent: typeof parsed.dissent === 'string' ? parsed.dissent : null,
			entryPrice: typeof parsed.entryPrice === 'number' ? parsed.entryPrice : null,
			targetPrice: typeof parsed.targetPrice === 'number' ? parsed.targetPrice : null,
			stopLoss: typeof parsed.stopLoss === 'number' ? parsed.stopLoss : null,
			positionSizePct: typeof parsed.positionSizePct === 'number' ? parsed.positionSizePct : null,
			risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
		};
	} catch {
		return {
			action: 'hold',
			confidence: 0.1,
			rationale: 'Failed to parse consensus',
			dissent: null,
			entryPrice: null,
			targetPrice: null,
			stopLoss: null,
			positionSizePct: null,
			risks: ['Consensus parsing error'],
		};
	}
}

function parseRiskValidation(content: string): RiskValidation {
	try {
		const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
		return {
			approved: parsed.approved === true,
			adjustedPositionSize:
				typeof parsed.adjustedPositionSize === 'number' ? parsed.adjustedPositionSize : null,
			warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
			rationale: String(parsed.rationale || 'No risk rationale'),
		};
	} catch {
		return {
			approved: false,
			adjustedPositionSize: null,
			warnings: ['Risk validation parsing error'],
			rationale: 'Failed to parse risk validation response',
		};
	}
}

function buildConsensusTranscript(
	analyses: PersonaAnalysis[],
	debateRounds: DebateRound[],
): string {
	const parts: string[] = [];

	parts.push('## Initial Analyses\n');
	for (const analysis of analyses) {
		parts.push(`### ${analysis.personaId}`);
		parts.push(`Action: ${analysis.action} (confidence: ${analysis.confidence})`);
		parts.push(`Rationale: ${analysis.rationale}`);
		parts.push(`Key points: ${analysis.keyPoints.join('; ')}\n`);
	}

	for (const round of debateRounds) {
		parts.push(`## Debate Round ${round.roundNumber}\n`);
		for (const response of round.responses) {
			parts.push(`### ${response.personaId}`);
			parts.push(`Response: ${response.content}`);
			parts.push(
				`Revised: ${response.revisedAction} (confidence: ${response.revisedConfidence})\n`,
			);
		}
	}

	return parts.join('\n');
}

function parseRecommendation(content: string): TradeRecommendation {
	try {
		const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
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

const PERFORMANCE_CONTEXT_MAX_CHARS = 2000;

function getCalibrationRating(calibration: number | null): 'good' | 'fair' | 'poor' {
	if (calibration === null) return 'fair';
	if (calibration >= 0.5) return 'good';
	if (calibration >= 0.2) return 'fair';
	return 'poor';
}

function buildPerformanceContextBlock(context: PerformanceContext, symbol: string): string {
	if (!context.score || context.score.totalProposals < 5) {
		return '';
	}

	const parts: string[] = [];
	const s = context.score;
	const calibrationRating = getCalibrationRating(s.confidenceCalibration);

	parts.push(`## Your Recent Performance (${s.windowDays}-day)`);
	parts.push(
		`- Win rate: ${((s.winRate ?? 0) * 100).toFixed(0)}% (${s.correctProposals}/${s.totalProposals})`,
	);
	parts.push(
		`- Avg return per trade: ${(s.avgPnlPct ?? 0) >= 0 ? '+' : ''}${((s.avgPnlPct ?? 0) * 100).toFixed(1)}%`,
	);
	if (s.sharpeRatio !== null) {
		parts.push(`- Sharpe ratio: ${s.sharpeRatio.toFixed(2)}`);
	}
	if (calibrationRating === 'poor') {
		parts.push('- WARNING: Your confidence scores have been poorly calibrated');
	}

	if (context.symbolRecord && context.symbolRecord.totalCalls >= 3) {
		const sr = context.symbolRecord;
		parts.push('');
		parts.push(`## Your track record on ${symbol}`);
		parts.push(`- ${sr.totalCalls} previous calls, ${sr.correctCalls} correct`);
		parts.push(`- Avg return: ${sr.avgPnlPct >= 0 ? '+' : ''}${(sr.avgPnlPct * 100).toFixed(1)}%`);
	}

	const relevantPatterns = context.patterns
		.filter((p) => p.sampleSize >= 5)
		.sort((a, b) => b.sampleSize - a.sampleSize);

	if (relevantPatterns.length > 0) {
		parts.push('');
		parts.push('## Lessons from past trades');
		for (const pattern of relevantPatterns) {
			const line = `- ${pattern.description} (sample: ${pattern.sampleSize}, success: ${(pattern.successRate * 100).toFixed(0)}%)`;
			const current = parts.join('\n');
			if (current.length + line.length + 1 > PERFORMANCE_CONTEXT_MAX_CHARS) break;
			parts.push(line);
		}
	}

	const result = parts.join('\n');
	return result.slice(0, PERFORMANCE_CONTEXT_MAX_CHARS);
}

function buildComparisonTable(rows: PersonaComparisonRow[]): string {
	const lines = [
		'## Analyst Track Records (30-day)',
		'| Analyst | Win Rate | Avg Return | Sharpe | Calibration |',
		'|---------|----------|------------|--------|-------------|',
	];

	for (const row of rows) {
		const winRate = row.winRate !== null ? `${(row.winRate * 100).toFixed(0)}%` : 'N/A';
		const avgReturn =
			row.avgReturn !== null
				? `${row.avgReturn >= 0 ? '+' : ''}${(row.avgReturn * 100).toFixed(1)}%`
				: 'N/A';
		const sharpe = row.sharpeRatio !== null ? row.sharpeRatio.toFixed(2) : 'N/A';
		const calibration = row.calibration.charAt(0).toUpperCase() + row.calibration.slice(1);
		lines.push(`| ${row.name} | ${winRate} | ${avgReturn} | ${sharpe} | ${calibration} |`);
	}

	lines.push('');
	lines.push('Weight analysts with better track records more heavily.');

	return lines.join('\n');
}
