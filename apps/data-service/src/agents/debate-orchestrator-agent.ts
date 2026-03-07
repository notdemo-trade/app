import type {
	ConsensusResult,
	DebateConfig,
	DebateOrchestratorState,
	DebateRound,
	DebateSession,
	PersonaAnalysis,
	PersonaConfig,
} from '@repo/data-ops/agents/debate/types';
import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import type {
	DiscussionMessage,
	DiscussionPhase,
	MessageSender,
} from '@repo/data-ops/agents/session/types';
import type { TechnicalIndicators, TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { Agent, getAgentByName } from 'agents';
import type { LLMAnalysisAgent } from './llm-analysis-agent';

export interface RunDebateParams {
	symbol: string;
	signals: TechnicalSignal[];
	indicators: TechnicalIndicators;
	strategy: StrategyTemplate;
	config: DebateConfig;
	onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
}

export interface RunDebateResult {
	session: DebateSession;
	consensus: ConsensusResult;
}

export class DebateOrchestratorAgent extends Agent<Env, DebateOrchestratorState> {
	initialState: DebateOrchestratorState = {
		activeDebateId: null,
		totalDebates: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		this.sql`CREATE TABLE IF NOT EXISTS debate_sessions (
			id              TEXT PRIMARY KEY,
			symbol          TEXT NOT NULL,
			status          TEXT NOT NULL DEFAULT 'analyzing',
			config          TEXT NOT NULL,
			started_at      INTEGER NOT NULL,
			completed_at    INTEGER
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS persona_analyses (
			id          TEXT PRIMARY KEY,
			session_id  TEXT NOT NULL,
			persona_id  TEXT NOT NULL,
			action      TEXT NOT NULL,
			confidence  REAL NOT NULL,
			rationale   TEXT NOT NULL,
			key_points  TEXT NOT NULL DEFAULT '[]',
			created_at  INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS debate_rounds (
			id           TEXT PRIMARY KEY,
			session_id   TEXT NOT NULL,
			round_number INTEGER NOT NULL,
			created_at   INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS debate_responses (
			id                 TEXT PRIMARY KEY,
			round_id           TEXT NOT NULL,
			persona_id         TEXT NOT NULL,
			responding_to      TEXT NOT NULL DEFAULT '[]',
			content            TEXT NOT NULL,
			revised_confidence REAL NOT NULL,
			revised_action     TEXT NOT NULL,
			created_at         INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS consensus_results (
			id                TEXT PRIMARY KEY,
			session_id        TEXT NOT NULL UNIQUE,
			action            TEXT NOT NULL,
			confidence        REAL NOT NULL,
			rationale         TEXT NOT NULL,
			dissent           TEXT,
			entry_price       REAL,
			target_price      REAL,
			stop_loss         REAL,
			position_size_pct REAL,
			risks             TEXT NOT NULL DEFAULT '[]',
			created_at        INTEGER NOT NULL
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_debate_sessions_symbol ON debate_sessions(symbol, started_at DESC)`;
	}

	async runDebate(params: RunDebateParams): Promise<RunDebateResult> {
		const sessionId = crypto.randomUUID();
		this.setState({ ...this.state, activeDebateId: sessionId });

		this.sql`INSERT INTO debate_sessions (id, symbol, status, config, started_at)
			VALUES (${sessionId}, ${params.symbol}, 'analyzing', ${JSON.stringify(params.config)}, ${Date.now()})`;

		const llm = this.getLLMAgent();
		const data = {
			symbol: params.symbol,
			signals: params.signals.map((s) => ({
				type: s.type,
				direction: s.direction,
				strength: s.strength,
				source: 'technical',
			})),
			indicators: params.indicators as unknown as Record<string, unknown>,
		};

		try {
			// Phase 1: Independent analyses (parallel)
			this.emitMessage(
				params,
				{ type: 'system' },
				'analysis',
				`Starting ${params.config.personas.length}-persona analysis for ${params.symbol}...`,
			);

			const analyses = await this.runIndependentAnalyses(
				sessionId,
				llm,
				params.config.personas,
				data,
				params.strategy,
				params,
			);

			// Phase 2: Debate rounds
			this.sql`UPDATE debate_sessions SET status = 'debating' WHERE id = ${sessionId}`;
			const debateRounds = await this.runDebateRounds(
				sessionId,
				llm,
				analyses,
				params.config,
				params,
			);

			// Phase 3: Consensus synthesis
			this.sql`UPDATE debate_sessions SET status = 'synthesizing' WHERE id = ${sessionId}`;
			this.emitMessage(params, { type: 'system' }, 'consensus', 'Synthesizing consensus...');

			const consensus = await llm.synthesizeConsensus(
				analyses,
				debateRounds,
				params.config.moderatorPrompt,
			);

			this.emitMessage(params, { type: 'moderator' }, 'consensus', consensus.rationale, {
				action: consensus.action,
				confidence: consensus.confidence,
				dissent: consensus.dissent,
			});

			// Store consensus
			this.storeConsensus(sessionId, consensus);

			// Update session status
			const now = Date.now();
			this
				.sql`UPDATE debate_sessions SET status = 'completed', completed_at = ${now} WHERE id = ${sessionId}`;
			this.setState({
				...this.state,
				activeDebateId: null,
				totalDebates: this.state.totalDebates + 1,
			});

			const session = this.getDebateSession(sessionId, analyses, debateRounds, consensus);
			return { session, consensus };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown debate error';
			this
				.sql`UPDATE debate_sessions SET status = 'failed', completed_at = ${Date.now()} WHERE id = ${sessionId}`;
			this.setState({
				...this.state,
				activeDebateId: null,
				errorCount: this.state.errorCount + 1,
				lastError: errorMessage,
			});
			throw error;
		}
	}

	private async runIndependentAnalyses(
		sessionId: string,
		llm: LLMAnalysisAgent,
		personas: PersonaConfig[],
		data: {
			symbol: string;
			signals: { type: string; direction: string; strength: number; source: string }[];
			indicators: Record<string, unknown>;
		},
		strategy: StrategyTemplate,
		params: RunDebateParams,
	): Promise<PersonaAnalysis[]> {
		const analyses = await Promise.all(
			personas.map(async (persona) => {
				const analysis = await llm.analyzeAsPersona(persona, data, strategy);

				this.emitMessage(
					params,
					{ type: 'persona', persona: persona.id },
					'analysis',
					analysis.rationale,
					{
						action: analysis.action,
						confidence: analysis.confidence,
						keyPoints: analysis.keyPoints,
					},
				);

				this
					.sql`INSERT INTO persona_analyses (id, session_id, persona_id, action, confidence, rationale, key_points, created_at)
					VALUES (${crypto.randomUUID()}, ${sessionId}, ${persona.id}, ${analysis.action}, ${analysis.confidence}, ${analysis.rationale}, ${JSON.stringify(analysis.keyPoints)}, ${Date.now()})`;

				return analysis;
			}),
		);
		return analyses;
	}

	private async runDebateRounds(
		sessionId: string,
		llm: LLMAnalysisAgent,
		analyses: PersonaAnalysis[],
		config: DebateConfig,
		params: RunDebateParams,
	): Promise<DebateRound[]> {
		const debateRounds: DebateRound[] = [];

		for (let round = 1; round <= config.rounds; round++) {
			this.emitMessage(
				params,
				{ type: 'system' },
				'debate_round',
				`Debate round ${round} of ${config.rounds}`,
			);

			const debateRound = await llm.runDebateRound(
				{ analyses, previousRounds: debateRounds },
				round,
				config.personas,
			);

			// Store round
			const roundId = crypto.randomUUID();
			const now = Date.now();
			this.sql`INSERT INTO debate_rounds (id, session_id, round_number, created_at)
				VALUES (${roundId}, ${sessionId}, ${round}, ${now})`;

			for (const response of debateRound.responses) {
				this.emitMessage(
					params,
					{ type: 'persona', persona: response.personaId },
					'debate_round',
					response.content,
					{
						round,
						revisedAction: response.revisedAction,
						revisedConfidence: response.revisedConfidence,
					},
				);

				this
					.sql`INSERT INTO debate_responses (id, round_id, persona_id, responding_to, content, revised_confidence, revised_action, created_at)
					VALUES (${crypto.randomUUID()}, ${roundId}, ${response.personaId}, ${JSON.stringify(response.respondingTo)}, ${response.content}, ${response.revisedConfidence}, ${response.revisedAction}, ${now})`;
			}

			debateRounds.push(debateRound);
		}

		return debateRounds;
	}

	private storeConsensus(sessionId: string, consensus: ConsensusResult): void {
		this
			.sql`INSERT INTO consensus_results (id, session_id, action, confidence, rationale, dissent, entry_price, target_price, stop_loss, position_size_pct, risks, created_at)
			VALUES (${crypto.randomUUID()}, ${sessionId}, ${consensus.action}, ${consensus.confidence}, ${consensus.rationale}, ${consensus.dissent}, ${consensus.entryPrice}, ${consensus.targetPrice}, ${consensus.stopLoss}, ${consensus.positionSizePct}, ${JSON.stringify(consensus.risks)}, ${Date.now()})`;
	}

	private getDebateSession(
		sessionId: string,
		analyses: PersonaAnalysis[],
		debateRounds: DebateRound[],
		consensus: ConsensusResult,
	): DebateSession {
		return {
			id: sessionId,
			symbol: '',
			status: 'completed',
			initialAnalyses: analyses,
			debateRounds,
			consensus,
			startedAt: Date.now(),
			completedAt: Date.now(),
		};
	}

	private getLLMAgent(): LLMAnalysisAgent {
		const userId = this.getUserId();
		return getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
	}

	private getUserId(): string {
		return this.name;
	}

	private emitMessage(
		params: RunDebateParams,
		sender: MessageSender,
		phase: DiscussionPhase,
		content: string,
		metadata: Record<string, unknown> = {},
	): void {
		params.onMessage({ sender, phase, content, metadata });
	}
}
