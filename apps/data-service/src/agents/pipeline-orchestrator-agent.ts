import { getEnrichmentForSymbol } from '@repo/data-ops/agents/enrichment/queries';
import type { EnrichmentData } from '@repo/data-ops/agents/enrichment/types';
import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import type { PipelineScore, ScoreWindow } from '@repo/data-ops/agents/memory/types';
import type {
	PipelineContext,
	PipelineOrchestratorState,
	PipelineSession,
	PipelineStep,
	PipelineStepName,
} from '@repo/data-ops/agents/pipeline/types';
import type {
	DataFeedsConfig,
	DiscussionMessage,
	DiscussionPhase,
	MessageSender,
	PortfolioContext,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';
import type { TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getBarsForSymbol } from '@repo/data-ops/market-data-bars';
import { Agent, callable, getAgentByName } from 'agents';
import type { AlpacaBrokerAgent } from './alpaca-broker-agent';
import type { LLMAnalysisAgent } from './llm-analysis-agent';
import { normalizePositionSizePct, summarizeEnrichment } from './session-agent-helpers';
import type { TechnicalAnalysisAgent } from './technical-analysis-agent';

export interface RunPipelineParams {
	symbol: string;
	strategyId: string;
	strategy: StrategyTemplate;
	onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
	llmPrefs?: { temperature: number; maxTokens: number };
	proposalTimeoutSec?: number;
	scoreWindows?: number[];
	portfolioContext?: PortfolioContext;
	/** User's configured position size as a fraction (0.0-1.0). Converted to whole-number pct internally. */
	positionSizePctOfCash?: number;
	minConfidenceThreshold?: number;
	threadId: string;
	dataFeeds?: DataFeedsConfig;
}

export interface RunPipelineResult {
	session: PipelineSession;
	proposal: TradeProposal | null;
}

const PIPELINE_STEPS: PipelineStepName[] = [
	'fetch_market_data',
	'technical_analysis',
	'fetch_enrichment_data',
	'llm_analysis',
	'risk_validation',
	'generate_proposal',
];

export class PipelineOrchestratorAgent extends Agent<Env, PipelineOrchestratorState> {
	initialState: PipelineOrchestratorState = {
		activePipelineId: null,
		totalPipelines: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.sql`CREATE TABLE IF NOT EXISTS pipeline_sessions (
			id          TEXT PRIMARY KEY,
			symbol      TEXT NOT NULL,
			strategy_id TEXT NOT NULL,
			status      TEXT NOT NULL DEFAULT 'running',
			context     TEXT NOT NULL DEFAULT '{}',
			started_at  INTEGER NOT NULL,
			completed_at INTEGER
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS pipeline_steps (
			id           TEXT PRIMARY KEY,
			session_id   TEXT NOT NULL,
			name         TEXT NOT NULL,
			status       TEXT NOT NULL DEFAULT 'pending',
			output       TEXT,
			error        TEXT,
			started_at   INTEGER,
			completed_at INTEGER,
			step_order   INTEGER NOT NULL
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_pipeline_sessions_symbol ON pipeline_sessions(symbol, started_at DESC)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_pipeline_steps_session ON pipeline_steps(session_id, step_order ASC)`;

		this.sql`CREATE TABLE IF NOT EXISTS pipeline_outcomes (
			id                TEXT PRIMARY KEY,
			session_id        TEXT NOT NULL REFERENCES pipeline_sessions(id),
			proposal_id       TEXT NOT NULL,
			symbol            TEXT NOT NULL,
			action            TEXT NOT NULL,
			confidence        REAL NOT NULL,
			ta_signals_snapshot TEXT NOT NULL DEFAULT '[]',
			realized_pnl      REAL NOT NULL,
			realized_pnl_pct  REAL NOT NULL,
			was_correct       INTEGER NOT NULL,
			resolved_at       INTEGER NOT NULL,
			created_at        INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS pipeline_scores (
			strategy_id           TEXT NOT NULL,
			window_days           INTEGER NOT NULL,
			total_proposals       INTEGER NOT NULL DEFAULT 0,
			correct_proposals     INTEGER NOT NULL DEFAULT 0,
			win_rate              REAL,
			avg_pnl_pct           REAL,
			stddev_pnl_pct        REAL,
			sharpe_ratio          REAL,
			best_symbol           TEXT,
			best_symbol_pnl_pct   REAL,
			worst_symbol          TEXT,
			worst_symbol_pnl_pct  REAL,
			computed_at           INTEGER NOT NULL,
			PRIMARY KEY (strategy_id, window_days)
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_pipeline_outcomes_symbol ON pipeline_outcomes(symbol, created_at DESC)`;
	}

	async runPipeline(params: RunPipelineParams): Promise<RunPipelineResult> {
		const sessionId = crypto.randomUUID();
		const now = Date.now();
		const context: PipelineContext = {
			symbol: params.symbol,
			strategyId: params.strategyId,
			bars: null,
			indicators: null,
			signals: null,
			recommendation: null,
			riskValidation: null,
			proposal: null,
			portfolioContext: params.portfolioContext ?? null,
			enrichment: null,
		};

		this.setState({ ...this.state, activePipelineId: sessionId });

		this.sql`INSERT INTO pipeline_sessions (id, symbol, strategy_id, status, context, started_at)
			VALUES (${sessionId}, ${params.symbol}, ${params.strategyId}, 'running', ${JSON.stringify(context)}, ${now})`;

		// Initialize steps
		const steps: PipelineStep[] = PIPELINE_STEPS.map((name, i) => {
			const step: PipelineStep = {
				name,
				status: 'pending',
				startedAt: null,
				completedAt: null,
				output: null,
				error: null,
			};
			this.sql`INSERT INTO pipeline_steps (id, session_id, name, status, step_order)
				VALUES (${crypto.randomUUID()}, ${sessionId}, ${name}, 'pending', ${i})`;
			return step;
		});

		try {
			for (let i = 0; i < PIPELINE_STEPS.length; i++) {
				const stepName = PIPELINE_STEPS[i] as PipelineStepName;
				const step = steps[i] as PipelineStep;

				this.emitMessage(
					params,
					{ type: 'system' },
					this.stepToPhase(stepName),
					`Running step: ${this.stepDisplayName(stepName)}...`,
				);

				step.status = 'running';
				step.startedAt = Date.now();
				this.updateStepStatus(sessionId, stepName, 'running', step.startedAt);

				await this.executeStep(stepName, context, params);

				step.status = 'completed';
				step.completedAt = Date.now();
				this.updateStepStatus(sessionId, stepName, 'completed', step.completedAt);

				this.emitMessage(
					params,
					{ type: 'system' },
					this.stepToPhase(stepName),
					`Step completed: ${this.stepDisplayName(stepName)}`,
				);
			}

			// Save final context
			this
				.sql`UPDATE pipeline_sessions SET status = 'completed', context = ${JSON.stringify(context)}, completed_at = ${Date.now()} WHERE id = ${sessionId}`;
			this.setState({
				...this.state,
				activePipelineId: null,
				totalPipelines: this.state.totalPipelines + 1,
			});

			const session = this.buildPipelineSession(sessionId, params, steps, context, 'completed');
			return { session, proposal: context.proposal };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline error';

			this.emitMessage(params, { type: 'system' }, 'completed', `Pipeline failed: ${errorMessage}`);

			this
				.sql`UPDATE pipeline_sessions SET status = 'failed', context = ${JSON.stringify(context)}, completed_at = ${Date.now()} WHERE id = ${sessionId}`;
			this.setState({
				...this.state,
				activePipelineId: null,
				errorCount: this.state.errorCount + 1,
				lastError: errorMessage,
			});

			const session = this.buildPipelineSession(sessionId, params, steps, context, 'failed');
			return { session, proposal: null };
		}
	}

	@callable()
	async recordStepOutcome(
		proposalId: string,
		pipelineSessionId: string,
		outcome: {
			symbol: string;
			realizedPnl: number;
			realizedPnlPct: number;
			action: string;
			confidence: number;
		},
	): Promise<void> {
		const sessions = this.sql<{ id: string; strategy_id: string }[]>`
			SELECT id, strategy_id FROM pipeline_sessions WHERE id = ${pipelineSessionId}`;
		const session = sessions[0];
		if (!session) return;

		const taSteps = this.sql<{ output: string | null }[]>`
			SELECT output FROM pipeline_steps
			WHERE session_id = ${pipelineSessionId} AND name = 'technical_analysis'`;
		const taStep = taSteps[0];

		const taSignals = taStep?.output
			? ((JSON.parse(taStep.output) as Record<string, unknown>).signals ?? [])
			: [];
		const wasCorrect =
			outcome.action === 'buy' ? outcome.realizedPnlPct > 0 : outcome.realizedPnlPct < 0;
		const now = Date.now();

		this.sql`INSERT INTO pipeline_outcomes
			(id, session_id, proposal_id, symbol, action, confidence,
			 ta_signals_snapshot, realized_pnl, realized_pnl_pct,
			 was_correct, resolved_at, created_at)
			VALUES (${crypto.randomUUID()}, ${pipelineSessionId}, ${proposalId},
				${outcome.symbol}, ${outcome.action}, ${outcome.confidence},
				${JSON.stringify(taSignals)}, ${outcome.realizedPnl}, ${outcome.realizedPnlPct},
				${wasCorrect ? 1 : 0}, ${now}, ${now})`;

		this.recomputePipelineScores(session.strategy_id);
	}

	@callable()
	getPipelineScores(windowDays: ScoreWindow): PipelineScore[] {
		const rows = this.sql<PipelineScoreRow[]>`
			SELECT * FROM pipeline_scores WHERE window_days = ${windowDays}`;
		return rows.map(rowToPipelineScore);
	}

	private async executeStep(
		name: PipelineStepName,
		ctx: PipelineContext,
		params: RunPipelineParams,
	): Promise<void> {
		const userId = this.getUserId();

		switch (name) {
			case 'fetch_market_data': {
				const bars = await getBarsForSymbol(params.symbol, '1Day', 200);
				ctx.bars = bars;

				this.emitMessage(
					params,
					{ type: 'data_agent', name: 'MarketData' },
					'data_collection',
					`Fetched ${bars.length} bars for ${params.symbol}`,
				);
				break;
			}

			case 'technical_analysis': {
				if (!ctx.bars) throw new Error('No bars available for technical analysis');

				const ta = await getAgentByName<TechnicalAnalysisAgent>(
					this.env.TechnicalAnalysisAgent,
					`${userId}:${params.symbol}`,
				);
				const result = await ta.analyze('1Day', ctx.bars);
				ctx.indicators = result.indicators;
				ctx.signals = result.signals;

				this.emitMessage(
					params,
					{ type: 'analysis_agent', name: 'TechnicalAnalysisAgent' },
					'analysis',
					`Computed ${result.signals.length} signals for ${params.symbol}`,
				);
				break;
			}

			case 'fetch_enrichment_data': {
				if (!params.dataFeeds) {
					this.emitMessage(
						params,
						{ type: 'system' },
						'data_collection',
						'No enrichment data feeds enabled, skipping.',
					);
					break;
				}

				const feeds = params.dataFeeds;
				if (feeds.fundamentals || feeds.marketIntelligence || feeds.earnings) {
					const full = await getEnrichmentForSymbol(params.symbol);
					const enrichment: EnrichmentData = {
						fundamentals: feeds.fundamentals ? full.fundamentals : undefined,
						marketIntelligence: feeds.marketIntelligence ? full.marketIntelligence : undefined,
						earnings: feeds.earnings ? full.earnings : undefined,
					};
					ctx.enrichment = enrichment;

					this.emitMessage(
						params,
						{ type: 'data_agent', name: 'EnrichmentData' },
						'data_collection',
						summarizeEnrichment(params.symbol, enrichment),
					);
				}
				break;
			}

			case 'llm_analysis': {
				if (!ctx.signals || !ctx.indicators) {
					throw new Error('No signals/indicators available for LLM analysis');
				}

				const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
				const result = await llm.analyze(
					{
						symbol: params.symbol,
						signals: ctx.signals.map((s: TechnicalSignal) => ({
							type: s.type,
							direction: s.direction,
							strength: s.strength,
							source: 'technical',
						})),
						technicals: ctx.indicators as unknown as Record<string, unknown>,
						strategy: params.strategy,
						fundamentals: ctx.enrichment?.fundamentals,
						marketIntelligence: ctx.enrichment?.marketIntelligence,
						earningsContext: ctx.enrichment?.earnings,
					},
					params.llmPrefs,
					ctx.portfolioContext ?? undefined,
				);
				ctx.recommendation = result.recommendation;

				this.emitMessage(
					params,
					{ type: 'analysis_agent', name: 'LLMAnalysisAgent' },
					'analysis',
					`LLM recommends: ${result.recommendation.action} (confidence: ${result.recommendation.confidence})`,
				);
				break;
			}

			case 'risk_validation': {
				if (!ctx.recommendation) throw new Error('No recommendation for risk validation');

				const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
				const broker = await getAgentByName<AlpacaBrokerAgent>(this.env.AlpacaBrokerAgent, userId);

				const [positions, account] = await Promise.all([
					broker.getPositions(),
					broker.getAccount(),
				]);

				ctx.riskValidation = await llm.validateRisk(
					ctx.symbol,
					ctx.recommendation,
					{
						positions,
						account,
					},
					params.llmPrefs,
					ctx.portfolioContext ?? undefined,
				);

				const status = ctx.riskValidation.approved ? 'approved' : 'rejected';
				this.emitMessage(
					params,
					{ type: 'analysis_agent', name: 'RiskValidator' },
					'analysis',
					`Risk validation ${status}: ${ctx.riskValidation.rationale}`,
				);

				if (ctx.riskValidation.warnings.length > 0) {
					this.emitMessage(
						params,
						{ type: 'system' },
						'analysis',
						`Risk warnings: ${ctx.riskValidation.warnings.join('; ')}`,
					);
				}
				break;
			}

			case 'generate_proposal': {
				if (!ctx.riskValidation?.approved) {
					this.emitMessage(
						params,
						{ type: 'system' },
						'proposal',
						'Risk validation rejected the trade. No proposal generated.',
					);
					return;
				}

				if (!ctx.recommendation || ctx.recommendation.action === 'hold') {
					this.emitMessage(
						params,
						{ type: 'system' },
						'proposal',
						'Recommendation is hold. No proposal generated.',
					);
					return;
				}

				// Confidence gate: match debate mode behavior
				const threshold = params.minConfidenceThreshold ?? 0.7;
				if (ctx.recommendation.confidence < threshold) {
					this.emitMessage(
						params,
						{ type: 'system' },
						'proposal',
						`Confidence ${ctx.recommendation.confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}. No proposal generated.`,
					);
					return;
				}

				ctx.proposal = this.buildProposal(ctx, params);

				this.emitMessage(
					params,
					{ type: 'system' },
					'proposal',
					`Trade proposal generated: ${ctx.proposal.action} ${ctx.proposal.symbol} (confidence: ${ctx.proposal.confidence})`,
				);
				break;
			}
		}
	}

	private recomputePipelineScores(strategyId: string, scoreWindows?: number[]): void {
		const windows = scoreWindows ?? [30, 90, 180];
		const now = Date.now();

		for (const windowDays of windows) {
			const cutoff = now - windowDays * 24 * 60 * 60 * 1000;

			const outcomes = this.sql<
				{ was_correct: number; realized_pnl_pct: number; symbol: string }[]
			>`
				SELECT was_correct, realized_pnl_pct, symbol FROM pipeline_outcomes
				WHERE session_id IN (SELECT id FROM pipeline_sessions WHERE strategy_id = ${strategyId})
				AND resolved_at >= ${cutoff}`;

			if (outcomes.length === 0) {
				this.sql`DELETE FROM pipeline_scores
					WHERE strategy_id = ${strategyId} AND window_days = ${windowDays}`;
				continue;
			}

			const total = outcomes.length;
			const correct = outcomes.filter((o) => o.was_correct === 1).length;
			const winRate = correct / total;

			const pnls = outcomes.map((o) => o.realized_pnl_pct);
			const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
			const stddev = Math.sqrt(pnls.reduce((sum, p) => sum + (p - avgPnl) ** 2, 0) / pnls.length);
			const sharpe = stddev > 0 ? avgPnl / stddev : null;

			const bySymbol = new Map<string, number[]>();
			for (const o of outcomes) {
				const arr = bySymbol.get(o.symbol) ?? [];
				arr.push(o.realized_pnl_pct);
				bySymbol.set(o.symbol, arr);
			}

			let best: { symbol: string; pnlPct: number } | null = null;
			let worst: { symbol: string; pnlPct: number } | null = null;
			for (const [symbol, symbolPnls] of bySymbol) {
				const avg = symbolPnls.reduce((a, b) => a + b, 0) / symbolPnls.length;
				if (!best || avg > best.pnlPct) best = { symbol, pnlPct: avg };
				if (!worst || avg < worst.pnlPct) worst = { symbol, pnlPct: avg };
			}

			this.sql`INSERT OR REPLACE INTO pipeline_scores
				(strategy_id, window_days, total_proposals, correct_proposals,
				 win_rate, avg_pnl_pct, stddev_pnl_pct, sharpe_ratio,
				 best_symbol, best_symbol_pnl_pct, worst_symbol, worst_symbol_pnl_pct, computed_at)
				VALUES (${strategyId}, ${windowDays}, ${total}, ${correct},
					${winRate}, ${avgPnl}, ${stddev}, ${sharpe},
					${best?.symbol ?? null}, ${best?.pnlPct ?? null},
					${worst?.symbol ?? null}, ${worst?.pnlPct ?? null}, ${now})`;
		}
	}

	private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
		const rec = ctx.recommendation;
		if (!rec) throw new Error('No recommendation available for proposal');
		const rawPct =
			ctx.riskValidation?.adjustedPositionSize ??
			rec.position_size_pct ??
			(params.positionSizePctOfCash !== undefined ? params.positionSizePctOfCash * 100 : 5);
		const positionSizePct = normalizePositionSizePct(rawPct);

		return {
			id: crypto.randomUUID(),
			threadId: params.threadId,
			symbol: params.symbol,
			action: rec.action as 'buy' | 'sell',
			confidence: rec.confidence,
			rationale: rec.rationale,
			entryPrice: rec.entry_price ?? null,
			targetPrice: rec.target_price ?? null,
			stopLoss: rec.stop_loss ?? null,
			qty: null,
			notional: null,
			positionSizePct,
			risks: rec.risks,
			warnings: ctx.riskValidation?.warnings ?? [],
			expiresAt: Date.now() + (params.proposalTimeoutSec ?? 900) * 1000,
			status: 'pending',
			createdAt: Date.now(),
			decidedAt: null,
			orderId: null,
			filledQty: null,
			filledAvgPrice: null,
			outcomeStatus: 'none',
			orchestratorSessionId: null,
		};
	}

	private stepToPhase(step: PipelineStepName): DiscussionPhase {
		switch (step) {
			case 'fetch_market_data':
			case 'fetch_enrichment_data':
				return 'data_collection';
			case 'technical_analysis':
			case 'llm_analysis':
			case 'risk_validation':
				return 'analysis';
			case 'generate_proposal':
				return 'proposal';
		}
	}

	private stepDisplayName(step: PipelineStepName): string {
		switch (step) {
			case 'fetch_market_data':
				return 'Fetch Market Data';
			case 'technical_analysis':
				return 'Technical Analysis';
			case 'fetch_enrichment_data':
				return 'Fetch Enrichment Data';
			case 'llm_analysis':
				return 'LLM Analysis';
			case 'risk_validation':
				return 'Risk Validation';
			case 'generate_proposal':
				return 'Generate Proposal';
		}
	}

	private updateStepStatus(
		sessionId: string,
		stepName: PipelineStepName,
		status: string,
		timestamp: number,
	): void {
		if (status === 'running') {
			this.sql`UPDATE pipeline_steps SET status = ${status}, started_at = ${timestamp}
				WHERE session_id = ${sessionId} AND name = ${stepName}`;
		} else {
			this.sql`UPDATE pipeline_steps SET status = ${status}, completed_at = ${timestamp}
				WHERE session_id = ${sessionId} AND name = ${stepName}`;
		}
	}

	private buildPipelineSession(
		sessionId: string,
		params: RunPipelineParams,
		steps: PipelineStep[],
		context: PipelineContext,
		status: 'running' | 'completed' | 'failed',
	): PipelineSession {
		return {
			id: sessionId,
			symbol: params.symbol,
			status,
			steps,
			context,
			startedAt: Date.now(),
			completedAt: status !== 'running' ? Date.now() : null,
		};
	}

	private getUserId(): string {
		// this.name is `userId:symbol` — extract just the userId
		const colonIndex = this.name.lastIndexOf(':');
		return colonIndex === -1 ? this.name : this.name.substring(0, colonIndex);
	}

	private emitMessage(
		params: RunPipelineParams,
		sender: MessageSender,
		phase: DiscussionPhase,
		content: string,
		metadata: Record<string, unknown> = {},
	): void {
		params.onMessage({ sender, phase, content, metadata });
	}
}

interface PipelineScoreRow {
	strategy_id: string;
	window_days: number;
	total_proposals: number;
	correct_proposals: number;
	win_rate: number | null;
	avg_pnl_pct: number | null;
	stddev_pnl_pct: number | null;
	sharpe_ratio: number | null;
	best_symbol: string | null;
	best_symbol_pnl_pct: number | null;
	worst_symbol: string | null;
	worst_symbol_pnl_pct: number | null;
	computed_at: number;
}

function rowToPipelineScore(row: PipelineScoreRow): PipelineScore {
	return {
		strategyId: row.strategy_id,
		windowDays: row.window_days as ScoreWindow,
		totalProposals: row.total_proposals,
		correctProposals: row.correct_proposals,
		winRate: row.win_rate,
		avgPnlPct: row.avg_pnl_pct,
		stddevPnlPct: row.stddev_pnl_pct,
		sharpeRatio: row.sharpe_ratio,
		bestSymbol: row.best_symbol,
		bestSymbolPnlPct: row.best_symbol_pnl_pct,
		worstSymbol: row.worst_symbol,
		worstSymbolPnlPct: row.worst_symbol_pnl_pct,
		computedAt: row.computed_at,
	};
}
