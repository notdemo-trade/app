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
	CalibrationRating,
	PerformanceContext,
	PersonaComparisonRow,
	PersonaPattern,
	PersonaScore,
	ScoreWindow,
} from '@repo/data-ops/agents/memory/types';
import type {
	DiscussionMessage,
	DiscussionPhase,
	MessageSender,
	PortfolioContext,
} from '@repo/data-ops/agents/session/types';
import type { TechnicalIndicators, TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { Agent, callable, getAgentByName } from 'agents';
import type { LLMAnalysisAgent } from './llm-analysis-agent';

export interface RunDebateParams {
	symbol: string;
	signals: TechnicalSignal[];
	indicators: TechnicalIndicators;
	strategy: StrategyTemplate;
	config: DebateConfig;
	onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void;
	llmPrefs?: { temperature: number; maxTokens: number };
	scoreWindows?: number[];
	portfolioContext?: PortfolioContext;
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

		this.sql`CREATE TABLE IF NOT EXISTS persona_outcomes (
			id              TEXT PRIMARY KEY,
			persona_id      TEXT NOT NULL,
			session_id      TEXT NOT NULL REFERENCES debate_sessions(id),
			proposal_id     TEXT NOT NULL,
			symbol          TEXT NOT NULL,
			persona_action  TEXT NOT NULL,
			persona_confidence REAL NOT NULL,
			consensus_action TEXT NOT NULL,
			realized_pnl    REAL NOT NULL,
			realized_pnl_pct REAL NOT NULL,
			was_correct     INTEGER NOT NULL,
			resolved_at     INTEGER NOT NULL,
			created_at      INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS persona_scores (
			persona_id            TEXT NOT NULL,
			window_days           INTEGER NOT NULL,
			total_proposals       INTEGER NOT NULL DEFAULT 0,
			correct_proposals     INTEGER NOT NULL DEFAULT 0,
			win_rate              REAL,
			avg_pnl_pct           REAL,
			stddev_pnl_pct        REAL,
			sharpe_ratio          REAL,
			confidence_calibration REAL,
			best_symbol           TEXT,
			best_symbol_pnl_pct   REAL,
			worst_symbol          TEXT,
			worst_symbol_pnl_pct  REAL,
			computed_at           INTEGER NOT NULL,
			PRIMARY KEY (persona_id, window_days)
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS persona_patterns (
			id              TEXT PRIMARY KEY,
			persona_id      TEXT NOT NULL,
			pattern_type    TEXT NOT NULL,
			pattern_key     TEXT NOT NULL,
			description     TEXT NOT NULL,
			sample_size     INTEGER NOT NULL,
			success_rate    REAL NOT NULL,
			avg_pnl_pct     REAL NOT NULL,
			last_updated_at INTEGER NOT NULL,
			UNIQUE (persona_id, pattern_type, pattern_key)
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_persona_outcomes_persona ON persona_outcomes(persona_id, resolved_at DESC)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_persona_outcomes_symbol ON persona_outcomes(persona_id, symbol)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_persona_patterns_persona ON persona_patterns(persona_id, pattern_type)`;
	}

	async runDebate(params: RunDebateParams): Promise<RunDebateResult> {
		const sessionId = crypto.randomUUID();
		this.setState({ ...this.state, activeDebateId: sessionId });

		this.sql`INSERT INTO debate_sessions (id, symbol, status, config, started_at)
			VALUES (${sessionId}, ${params.symbol}, 'analyzing', ${JSON.stringify(params.config)}, ${Date.now()})`;

		const llm = await this.getLLMAgent();
		const data = {
			symbol: params.symbol,
			signals: params.signals.map((s) => ({
				type: s.type,
				direction: s.direction,
				strength: s.strength,
				source: 'technical',
			})),
			indicators: params.indicators as unknown as Record<string, unknown>,
			portfolioContext: params.portfolioContext,
		};

		try {
			// Phase 1: Independent analyses (parallel) — with performance context
			this.emitMessage(
				params,
				{ type: 'system' },
				'analysis',
				`Starting ${params.config.personas.length}-persona analysis for ${params.symbol}...`,
			);

			const scores = this.getPersonaScores(30);
			const scoreMap = new Map(scores.map((s) => [s.personaId, s]));

			const analyses = await this.runIndependentAnalyses(
				sessionId,
				llm,
				params.config.personas,
				data,
				params.strategy,
				params,
				scoreMap,
				params.llmPrefs,
			);

			// Phase 2: Debate rounds
			this.sql`UPDATE debate_sessions SET status = 'debating' WHERE id = ${sessionId}`;
			const debateRounds = await this.runDebateRounds(
				sessionId,
				llm,
				analyses,
				params.config,
				params,
				params.llmPrefs,
			);

			// Phase 3: Consensus synthesis — with confidence dampening + persona comparison
			this.sql`UPDATE debate_sessions SET status = 'synthesizing' WHERE id = ${sessionId}`;
			this.emitMessage(params, { type: 'system' }, 'consensus', 'Synthesizing consensus...');

			const dampenedAnalyses = analyses.map((a) => {
				const score = scoreMap.get(a.personaId) ?? null;
				return applyConfidenceDampening(a, score);
			});

			const comparison: PersonaComparisonRow[] = params.config.personas.map((persona) => {
				const score = scoreMap.get(persona.id);
				return {
					personaId: persona.id,
					name: persona.name,
					winRate: score?.winRate ?? null,
					avgReturn: score?.avgPnlPct ?? null,
					sharpeRatio: score?.sharpeRatio ?? null,
					calibration: getCalibrationRating(score?.confidenceCalibration ?? null),
				};
			});

			const consensus = await llm.synthesizeConsensus(
				dampenedAnalyses,
				debateRounds,
				params.config.moderatorPrompt,
				comparison,
				params.llmPrefs,
				params.portfolioContext,
				params.symbol,
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

			const session = this.getDebateSession(
				sessionId,
				analyses,
				debateRounds,
				consensus,
				params.symbol,
			);
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

	@callable()
	async recordPersonaOutcome(
		proposalId: string,
		debateSessionId: string,
		outcome: { symbol: string; realizedPnl: number; realizedPnlPct: number; action: string },
	): Promise<void> {
		const analyses = this.sql<{ persona_id: string; action: string; confidence: number }[]>`
			SELECT persona_id, action, confidence FROM persona_analyses WHERE session_id = ${debateSessionId}`;

		const consensusRows = this.sql<{ action: string }[]>`
			SELECT action FROM consensus_results WHERE session_id = ${debateSessionId}`;
		const consensusAction = consensusRows[0]?.action ?? 'unknown';

		const now = Date.now();

		for (const analysis of analyses) {
			const wasCorrect = this.evaluateCorrectness(analysis.action, outcome.realizedPnlPct);

			this.sql`INSERT INTO persona_outcomes
				(id, persona_id, session_id, proposal_id, symbol,
				 persona_action, persona_confidence, consensus_action,
				 realized_pnl, realized_pnl_pct, was_correct, resolved_at, created_at)
				VALUES (${crypto.randomUUID()}, ${analysis.persona_id}, ${debateSessionId},
					${proposalId}, ${outcome.symbol},
					${analysis.action}, ${analysis.confidence}, ${consensusAction},
					${outcome.realizedPnl}, ${outcome.realizedPnlPct},
					${wasCorrect ? 1 : 0}, ${now}, ${now})`;
		}

		const personaIds = [...new Set(analyses.map((a) => a.persona_id))];
		for (const personaId of personaIds) {
			this.recomputeScores(personaId);
			this.updatePatterns(personaId);
		}
	}

	@callable()
	getPersonaScores(windowDays: ScoreWindow): PersonaScore[] {
		const rows = this.sql<PersonaScoreRow[]>`
			SELECT * FROM persona_scores WHERE window_days = ${windowDays}`;
		return rows.map(rowToPersonaScore);
	}

	@callable()
	getPersonaPatterns(personaId: string, symbol?: string): PersonaPattern[] {
		if (symbol) {
			return this.sql<PersonaPatternRow[]>`
				SELECT * FROM persona_patterns
				WHERE persona_id = ${personaId}
					AND (pattern_type != 'symbol' OR pattern_key = ${symbol})
				ORDER BY sample_size DESC`.map(rowToPersonaPattern);
		}
		return this.sql<PersonaPatternRow[]>`
			SELECT * FROM persona_patterns
			WHERE persona_id = ${personaId}
			ORDER BY sample_size DESC`.map(rowToPersonaPattern);
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
		scoreMap?: Map<string, PersonaScore>,
		llmPrefs?: { temperature: number; maxTokens: number },
	): Promise<PersonaAnalysis[]> {
		const analyses = await Promise.all(
			personas.map(async (persona) => {
				let perfContext: PerformanceContext | undefined;
				if (scoreMap) {
					const score = scoreMap.get(persona.id) ?? null;
					const patterns = this.getPersonaPatterns(persona.id, data.symbol);
					const symbolRecord = this.getSymbolRecord(persona.id, data.symbol);
					perfContext = { personaId: persona.id, windowDays: 30, score, symbolRecord, patterns };
				}

				const analysis = await llm.analyzeAsPersona(persona, data, strategy, perfContext, llmPrefs);

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
		llmPrefs?: { temperature: number; maxTokens: number },
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
				llmPrefs,
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
		symbol: string,
	): DebateSession {
		return {
			id: sessionId,
			symbol,
			status: 'completed',
			initialAnalyses: analyses,
			debateRounds,
			consensus,
			startedAt: Date.now(),
			completedAt: Date.now(),
		};
	}

	private evaluateCorrectness(personaAction: string, realizedPnlPct: number): boolean {
		switch (personaAction) {
			case 'buy':
				return realizedPnlPct > 0;
			case 'sell':
				return realizedPnlPct < 0;
			case 'hold':
				return Math.abs(realizedPnlPct) < 0.01;
			default:
				return false;
		}
	}

	private recomputeScores(personaId: string, scoreWindows?: number[]): void {
		const windows = scoreWindows ?? [30, 90, 180];
		const now = Date.now();

		for (const windowDays of windows) {
			const cutoff = now - windowDays * 24 * 60 * 60 * 1000;

			const outcomes = this.sql<PersonaOutcomeRow[]>`
				SELECT persona_confidence, was_correct, realized_pnl_pct, symbol, persona_id
				FROM persona_outcomes
				WHERE persona_id = ${personaId} AND resolved_at >= ${cutoff}`;

			if (outcomes.length === 0) {
				this.sql`DELETE FROM persona_scores
					WHERE persona_id = ${personaId} AND window_days = ${windowDays}`;
				continue;
			}

			const total = outcomes.length;
			const correct = outcomes.filter((o) => o.was_correct === 1).length;
			const winRate = correct / total;

			const pnls = outcomes.map((o) => o.realized_pnl_pct);
			const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
			const stddev = Math.sqrt(pnls.reduce((sum, p) => sum + (p - avgPnl) ** 2, 0) / pnls.length);
			const sharpe = stddev > 0 ? avgPnl / stddev : null;

			const calibration = this.computeCalibration(outcomes);
			const { best, worst } = this.computeSymbolExtremes(outcomes);

			this.sql`INSERT OR REPLACE INTO persona_scores
				(persona_id, window_days, total_proposals, correct_proposals,
				 win_rate, avg_pnl_pct, stddev_pnl_pct, sharpe_ratio,
				 confidence_calibration, best_symbol, best_symbol_pnl_pct,
				 worst_symbol, worst_symbol_pnl_pct, computed_at)
				VALUES (${personaId}, ${windowDays}, ${total}, ${correct},
					${winRate}, ${avgPnl}, ${stddev}, ${sharpe},
					${calibration}, ${best?.symbol ?? null}, ${best?.pnlPct ?? null},
					${worst?.symbol ?? null}, ${worst?.pnlPct ?? null}, ${now})`;
		}
	}

	private computeCalibration(outcomes: PersonaOutcomeRow[]): number | null {
		if (outcomes.length < 5) return null;

		const n = outcomes.length;
		const confidences = outcomes.map((o) => o.persona_confidence);
		const corrects = outcomes.map((o) => (o.was_correct ? 1 : 0));

		const meanC = confidences.reduce((a, b) => a + b, 0) / n;
		const meanW = corrects.reduce((a, b) => a + b, 0) / n;

		let num = 0;
		let denC = 0;
		let denW = 0;
		for (let i = 0; i < n; i++) {
			const dc = (confidences[i] as number) - meanC;
			const dw = (corrects[i] as number) - meanW;
			num += dc * dw;
			denC += dc * dc;
			denW += dw * dw;
		}

		const den = Math.sqrt(denC * denW);
		return den > 0 ? num / den : null;
	}

	private computeSymbolExtremes(outcomes: PersonaOutcomeRow[]): {
		best: { symbol: string; pnlPct: number } | null;
		worst: { symbol: string; pnlPct: number } | null;
	} {
		const bySymbol = new Map<string, number[]>();
		for (const o of outcomes) {
			const arr = bySymbol.get(o.symbol) ?? [];
			arr.push(o.realized_pnl_pct);
			bySymbol.set(o.symbol, arr);
		}

		let best: { symbol: string; pnlPct: number } | null = null;
		let worst: { symbol: string; pnlPct: number } | null = null;

		for (const [symbol, pnls] of bySymbol) {
			const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
			if (!best || avg > best.pnlPct) best = { symbol, pnlPct: avg };
			if (!worst || avg < worst.pnlPct) worst = { symbol, pnlPct: avg };
		}

		return { best, worst };
	}

	private updatePatterns(personaId: string): void {
		const now = Date.now();
		const cutoff = now - 180 * 24 * 60 * 60 * 1000;

		const symbolPatterns = this.sql<
			{ symbol: string; cnt: number; wins: number; avg_pnl: number }[]
		>`
			SELECT symbol, COUNT(*) as cnt, SUM(was_correct) as wins,
				AVG(realized_pnl_pct) as avg_pnl
			FROM persona_outcomes
			WHERE persona_id = ${personaId} AND resolved_at >= ${cutoff}
			GROUP BY symbol
			HAVING cnt >= 5`;

		for (const sp of symbolPatterns) {
			const successRate = sp.wins / sp.cnt;
			const description = `${sp.symbol}: ${sp.wins}/${sp.cnt} correct, avg ${(sp.avg_pnl * 100).toFixed(1)}%`;

			this.sql`INSERT OR REPLACE INTO persona_patterns
				(id, persona_id, pattern_type, pattern_key, description,
				 sample_size, success_rate, avg_pnl_pct, last_updated_at)
				VALUES (${`${personaId}:symbol:${sp.symbol}`}, ${personaId}, 'symbol', ${sp.symbol},
					${description}, ${sp.cnt}, ${successRate}, ${sp.avg_pnl}, ${now})`;
		}

		const actionPatterns = this.sql<
			{ action: string; cnt: number; wins: number; avg_pnl: number }[]
		>`
			SELECT persona_action as action, COUNT(*) as cnt, SUM(was_correct) as wins,
				AVG(realized_pnl_pct) as avg_pnl
			FROM persona_outcomes
			WHERE persona_id = ${personaId} AND resolved_at >= ${cutoff}
			GROUP BY persona_action
			HAVING cnt >= 5`;

		for (const ap of actionPatterns) {
			const successRate = ap.wins / ap.cnt;
			const description = `${ap.action.toUpperCase()} calls: ${ap.wins}/${ap.cnt} correct, avg ${(ap.avg_pnl * 100).toFixed(1)}%`;

			this.sql`INSERT OR REPLACE INTO persona_patterns
				(id, persona_id, pattern_type, pattern_key, description,
				 sample_size, success_rate, avg_pnl_pct, last_updated_at)
				VALUES (${`${personaId}:action:${ap.action}`}, ${personaId}, 'indicator_outcome', ${`action:${ap.action}`},
					${description}, ${ap.cnt}, ${successRate}, ${ap.avg_pnl}, ${now})`;
		}

		this.sql`DELETE FROM persona_patterns
			WHERE persona_id = ${personaId} AND sample_size < 5`;
	}

	private getSymbolRecord(
		personaId: string,
		symbol: string,
	): { totalCalls: number; correctCalls: number; avgPnlPct: number } | null {
		const rows = this.sql<{ cnt: number; wins: number; avg_pnl: number }[]>`
			SELECT COUNT(*) as cnt, SUM(was_correct) as wins, AVG(realized_pnl_pct) as avg_pnl
			FROM persona_outcomes
			WHERE persona_id = ${personaId} AND symbol = ${symbol}`;
		const row = rows[0];
		if (!row || row.cnt === 0) return null;
		return { totalCalls: row.cnt, correctCalls: row.wins, avgPnlPct: row.avg_pnl };
	}

	private async getLLMAgent(): Promise<LLMAnalysisAgent> {
		const userId = this.getUserId();
		return getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
	}

	private getUserId(): string {
		// this.name is `userId:symbol` — extract just the userId
		const colonIndex = this.name.lastIndexOf(':');
		return colonIndex === -1 ? this.name : this.name.substring(0, colonIndex);
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

interface PersonaScoreRow {
	persona_id: string;
	window_days: number;
	total_proposals: number;
	correct_proposals: number;
	win_rate: number | null;
	avg_pnl_pct: number | null;
	stddev_pnl_pct: number | null;
	sharpe_ratio: number | null;
	confidence_calibration: number | null;
	best_symbol: string | null;
	best_symbol_pnl_pct: number | null;
	worst_symbol: string | null;
	worst_symbol_pnl_pct: number | null;
	computed_at: number;
}

interface PersonaPatternRow {
	id: string;
	persona_id: string;
	pattern_type: string;
	pattern_key: string;
	description: string;
	sample_size: number;
	success_rate: number;
	avg_pnl_pct: number;
	last_updated_at: number;
}

interface PersonaOutcomeRow {
	persona_id: string;
	persona_confidence: number;
	was_correct: number;
	realized_pnl_pct: number;
	symbol: string;
}

function rowToPersonaScore(row: PersonaScoreRow): PersonaScore {
	return {
		personaId: row.persona_id,
		windowDays: row.window_days as ScoreWindow,
		totalProposals: row.total_proposals,
		correctProposals: row.correct_proposals,
		winRate: row.win_rate,
		avgPnlPct: row.avg_pnl_pct,
		stddevPnlPct: row.stddev_pnl_pct,
		sharpeRatio: row.sharpe_ratio,
		confidenceCalibration: row.confidence_calibration,
		bestSymbol: row.best_symbol,
		bestSymbolPnlPct: row.best_symbol_pnl_pct,
		worstSymbol: row.worst_symbol,
		worstSymbolPnlPct: row.worst_symbol_pnl_pct,
		computedAt: row.computed_at,
	};
}

function rowToPersonaPattern(row: PersonaPatternRow): PersonaPattern {
	return {
		id: row.id,
		personaId: row.persona_id,
		patternType: row.pattern_type as PersonaPattern['patternType'],
		patternKey: row.pattern_key,
		description: row.description,
		sampleSize: row.sample_size,
		successRate: row.success_rate,
		avgPnlPct: row.avg_pnl_pct,
		lastUpdatedAt: row.last_updated_at,
	};
}

function getCalibrationRating(calibration: number | null): CalibrationRating {
	if (calibration === null) return 'fair';
	if (calibration >= 0.5) return 'good';
	if (calibration >= 0.2) return 'fair';
	return 'poor';
}

function applyConfidenceDampening(
	analysis: PersonaAnalysis,
	score: PersonaScore | null,
): PersonaAnalysis {
	if (!score || score.totalProposals < 5) return analysis;

	const calibration = getCalibrationRating(score.confidenceCalibration);
	const multiplier = calibration === 'good' ? 1.0 : calibration === 'fair' ? 0.8 : 0.5;

	return { ...analysis, confidence: analysis.confidence * multiplier };
}
