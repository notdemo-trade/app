import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import type {
	PipelineContext,
	PipelineOrchestratorState,
	PipelineSession,
	PipelineStep,
	PipelineStepName,
} from '@repo/data-ops/agents/pipeline/types';
import type {
	DiscussionMessage,
	DiscussionPhase,
	MessageSender,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';
import type { TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { Agent, getAgentByName } from 'agents';
import type { AlpacaBrokerAgent } from './alpaca-broker-agent';
import type { AlpacaMarketDataAgent } from './alpaca-market-data-agent';
import type { LLMAnalysisAgent } from './llm-analysis-agent';
import type { TechnicalAnalysisAgent } from './technical-analysis-agent';

export interface RunPipelineParams {
	symbol: string;
	strategyId: string;
	strategy: StrategyTemplate;
	onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
}

export interface RunPipelineResult {
	session: PipelineSession;
	proposal: TradeProposal | null;
}

const PIPELINE_STEPS: PipelineStepName[] = [
	'fetch_market_data',
	'technical_analysis',
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

	private async executeStep(
		name: PipelineStepName,
		ctx: PipelineContext,
		params: RunPipelineParams,
	): Promise<void> {
		const userId = this.getUserId();

		switch (name) {
			case 'fetch_market_data': {
				const marketData = await getAgentByName<AlpacaMarketDataAgent>(
					this.env.AlpacaMarketDataAgent,
					`${userId}:${params.symbol}`,
				);
				const result = await marketData.fetchBars({
					symbol: params.symbol,
					timeframe: '1Day',
					limit: 200,
				});
				ctx.bars = result.bars;

				this.emitMessage(
					params,
					{ type: 'data_agent', name: 'AlpacaMarketDataAgent' },
					'data_collection',
					`Fetched ${result.bars.length} bars for ${params.symbol}`,
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

			case 'llm_analysis': {
				if (!ctx.signals || !ctx.indicators) {
					throw new Error('No signals/indicators available for LLM analysis');
				}

				const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
				const result = await llm.analyze({
					symbol: params.symbol,
					signals: ctx.signals.map((s: TechnicalSignal) => ({
						type: s.type,
						direction: s.direction,
						strength: s.strength,
						source: 'technical',
					})),
					technicals: ctx.indicators as unknown as Record<string, unknown>,
					strategy: params.strategy,
				});
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

				ctx.riskValidation = await llm.validateRisk(ctx.recommendation, {
					positions,
					account,
				});

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

	private buildProposal(ctx: PipelineContext, params: RunPipelineParams): TradeProposal {
		const rec = ctx.recommendation;
		if (!rec) throw new Error('No recommendation available for proposal');
		const positionSizePct = ctx.riskValidation?.adjustedPositionSize ?? rec.position_size_pct ?? 5;

		return {
			id: crypto.randomUUID(),
			threadId: '',
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
			expiresAt: Date.now() + 900_000,
			status: 'pending',
			createdAt: Date.now(),
			decidedAt: null,
		};
	}

	private stepToPhase(step: PipelineStepName): DiscussionPhase {
		switch (step) {
			case 'fetch_market_data':
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
		return this.name;
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
