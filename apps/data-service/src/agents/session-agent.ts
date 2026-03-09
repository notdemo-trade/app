import type { OnChatMessageOptions } from '@cloudflare/ai-chat';
import { AIChatAgent } from '@cloudflare/ai-chat';
import type { BrokerPosition, OrderLogEntry } from '@repo/data-ops/agents/broker/types';
import type { PersonaConfig } from '@repo/data-ops/agents/debate/types';
import type { LLMProviderConfig, StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import type {
	ExitReason,
	OutcomeSnapshot,
	ProposalOutcome,
} from '@repo/data-ops/agents/memory/types';
import {
	DEFAULT_MODERATOR_PROMPT,
	DEFAULT_PERSONAS,
	DEFAULT_SESSION_CONFIG,
} from '@repo/data-ops/agents/session/defaults';
import { resolveEffectiveConfig } from '@repo/data-ops/agents/session/resolve-config';
import type {
	DiscussionMessage,
	DiscussionThread,
	EffectiveConfig,
	ResetResult,
	SessionConfig,
	SessionState,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';
import type { LLMCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getDebatePersonas, seedDefaultPersonas } from '@repo/data-ops/debate-persona';
import { createLanguageModel } from '@repo/data-ops/providers/llm';
import { getTradingConfig } from '@repo/data-ops/trading-config';
import { callable, getAgentByName } from 'agents';
import type { StreamTextOnFinishCallback, ToolSet } from 'ai';
import { convertToModelMessages, jsonSchema, stepCountIs, streamText, tool } from 'ai';
import type { AlpacaBrokerAgent } from './alpaca-broker-agent';
import type { DebateOrchestratorAgent, RunDebateResult } from './debate-orchestrator-agent';
import type { LLMAnalysisAgent } from './llm-analysis-agent';
import type { PipelineOrchestratorAgent, RunPipelineResult } from './pipeline-orchestrator-agent';
import {
	type CountRow,
	DEFAULT_STRATEGIES,
	type MessageRow,
	type OutcomeSnapshotRow,
	type ProposalOutcomeRow,
	type ProposalRow,
	rowToConfig,
	rowToMessage,
	rowToOutcome,
	rowToProposal,
	rowToSnapshot,
	rowToThread,
	type SessionConfigRow,
	type StrategyTemplateRow,
	SYSTEM_PROMPT,
	type ThreadRow,
} from './session-agent-helpers';
import type { TechnicalAnalysisAgent } from './technical-analysis-agent';

export class SessionAgent extends AIChatAgent<Env, SessionState> {
	maxPersistedMessages = 500;

	initialState: SessionState = {
		enabled: false,
		lastCycleAt: null,
		cycleCount: 0,
		analysisIntervalSec: 120,
		activeThreadId: null,
		activeThread: null,
		pendingProposalCount: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.initTables();
		this.seedDefaults();

		const config = this.loadConfig();
		this.setState({ ...this.state, analysisIntervalSec: config.analysisIntervalSec });

		if (this.state.enabled) {
			await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
			await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
		}
	}

	// --- AIChatAgent: onChatMessage ---

	async onChatMessage(
		onFinish: StreamTextOnFinishCallback<ToolSet>,
		options?: OnChatMessageOptions,
	): Promise<Response | undefined> {
		const effectiveConfig = await this.loadEffectiveConfig();
		const providerConfig = await this.resolveProviderConfig(effectiveConfig);
		const model = createLanguageModel(providerConfig);

		const modelMessages = await convertToModelMessages(this.messages);

		const result = streamText({
			model,
			system: SYSTEM_PROMPT,
			messages: modelMessages,
			tools: {
				analyzeSymbol: tool({
					description: 'Run a full analysis cycle for a given ticker symbol',
					inputSchema: jsonSchema<{ symbol: string }>({
						type: 'object',
						properties: {
							symbol: {
								type: 'string',
								description: 'The ticker symbol to analyze (e.g. AAPL, TSLA)',
							},
						},
						required: ['symbol'],
					}),
					execute: async ({ symbol }) => {
						return this.runAnalysisForSymbol(symbol.toUpperCase(), effectiveConfig);
					},
				}),
				executeTrade: tool({
					description: 'Execute a trade from a pending proposal',
					inputSchema: jsonSchema<{ proposalId: string; approved: boolean }>({
						type: 'object',
						properties: {
							proposalId: {
								type: 'string',
								description: 'The ID of the trade proposal to execute',
							},
							approved: { type: 'boolean', description: 'Whether the trade is approved' },
						},
						required: ['proposalId', 'approved'],
					}),
					execute: async ({ proposalId, approved }) => {
						return this.handleTradeDecision(proposalId, approved);
					},
					needsApproval: async () => true,
				}),
			},
			stopWhen: stepCountIs(5),
			abortSignal: options?.abortSignal,
			onFinish,
		});

		return result.toTextStreamResponse();
	}

	// --- Scheduling helpers ---

	private async rescheduleAnalysisCycle(intervalSec: number): Promise<void> {
		// Cancel existing analysis schedules
		const existing = this.getSchedules({ type: 'interval' });
		for (const s of existing) {
			if (s.callback === 'runScheduledCycle') {
				await this.cancelSchedule(s.id);
			}
		}
		// Schedule next cycle as a one-shot, runScheduledCycle re-schedules itself
		const nextAt = new Date(Date.now() + intervalSec * 1000);
		await this.schedule(nextAt, 'runScheduledCycle');
	}

	// --- @callable() RPCs ---

	@callable()
	async start(): Promise<SessionState> {
		const config = this.loadConfig();
		this.setState({ ...this.state, enabled: true });
		await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
		await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
		return this.state;
	}

	@callable()
	async stop(): Promise<SessionState> {
		this.setState({ ...this.state, enabled: false });
		// Cancel analysis schedule
		const existing = this.getSchedules();
		for (const s of existing) {
			if (s.callback === 'runScheduledCycle') {
				await this.cancelSchedule(s.id);
			}
		}
		return this.state;
	}

	@callable()
	async updateConfig(partial: Partial<SessionConfig>): Promise<SessionConfig> {
		const current = this.loadConfig();
		const updated = { ...current, ...partial };
		this.persistConfig(updated);

		// Sync LLM provider to LLMAnalysisAgent if changed
		if (partial.llmProvider || partial.llmModel) {
			await this.syncLLMProvider(updated);
		}

		// Reschedule if interval changed and enabled
		if (partial.analysisIntervalSec) {
			this.setState({ ...this.state, analysisIntervalSec: updated.analysisIntervalSec });
			if (this.state.enabled) {
				await this.rescheduleAnalysisCycle(updated.analysisIntervalSec);
			}
		}

		return updated;
	}

	@callable()
	getConfig(): SessionConfig {
		return this.loadConfig();
	}

	@callable()
	getStatus(): SessionState {
		const pending = this
			.sql<CountRow>`SELECT COUNT(*) as cnt FROM trade_proposals WHERE status = 'pending'`;
		return {
			...this.state,
			pendingProposalCount: pending[0]?.cnt ?? 0,
		};
	}

	@callable()
	async triggerAnalysis(): Promise<{ threadIds: string[] }> {
		this.setState({ ...this.state, lastError: null });
		const effectiveConfig = await this.loadEffectiveConfig();
		const threadIds: string[] = [];
		for (const symbol of effectiveConfig.watchlistSymbols) {
			const result = await this.runAnalysisForSymbol(symbol, effectiveConfig);
			if (result.threadId) {
				threadIds.push(result.threadId);
			}
		}
		this.setState({
			...this.state,
			lastCycleAt: Date.now(),
			cycleCount: this.state.cycleCount + 1,
		});

		// Reschedule so next cycle aligns with this trigger
		if (this.state.enabled) {
			await this.rescheduleAnalysisCycle(effectiveConfig.analysisIntervalSec);
		}

		return { threadIds };
	}

	@callable()
	getThreads(limit = 20): DiscussionThread[] {
		const rows = this.sql<ThreadRow>`
			SELECT id, orchestration_mode, symbol, status, started_at, completed_at, proposal_id
			FROM discussion_threads ORDER BY started_at DESC LIMIT ${limit}`;
		return rows.map((row) => this.hydrateThread(row));
	}

	@callable()
	getThread(threadId: string): DiscussionThread | null {
		const rows = this.sql<ThreadRow>`
			SELECT id, orchestration_mode, symbol, status, started_at, completed_at, proposal_id
			FROM discussion_threads WHERE id = ${threadId}`;
		const row = rows[0];
		if (!row) return null;
		return this.hydrateThread(row);
	}

	@callable()
	getProposals(status?: string): TradeProposal[] {
		if (status) {
			const rows = this.sql<ProposalRow>`
				SELECT * FROM trade_proposals WHERE status = ${status} ORDER BY created_at DESC`;
			return rows.map(rowToProposal);
		}
		const rows = this.sql<ProposalRow>`
			SELECT * FROM trade_proposals ORDER BY created_at DESC LIMIT 50`;
		return rows.map(rowToProposal);
	}

	// Phase 24: updatePersona and resetPersonas callables removed.
	// Persona CRUD is now handled via REST API -> PostgreSQL.

	@callable()
	async approveProposal(proposalId: string): Promise<{ status: string; message: string }> {
		const result = await this.handleTradeDecision(proposalId, true);
		this.broadcastThread(
			this.sql<ThreadRow>`SELECT * FROM discussion_threads WHERE proposal_id = ${proposalId}`[0]
				?.id ?? '',
		);
		return result;
	}

	@callable()
	async rejectProposal(proposalId: string): Promise<{ status: string; message: string }> {
		const result = await this.handleTradeDecision(proposalId, false);
		this.broadcastThread(
			this.sql<ThreadRow>`SELECT * FROM discussion_threads WHERE proposal_id = ${proposalId}`[0]
				?.id ?? '',
		);
		return result;
	}

	@callable()
	async resetData(): Promise<ResetResult> {
		if (this.state.enabled) {
			return {
				status: 'error',
				message: 'Session must be stopped before resetting data',
				cleared: { threads: 0, messages: 0, proposals: 0, outcomes: 0, snapshots: 0 },
			};
		}

		// Expire pending/approved proposals and resolve tracking outcomes before clearing
		const now = Date.now();
		this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
			WHERE status IN ('pending', 'approved')`;
		this.sql`UPDATE proposal_outcomes SET status = 'resolved', resolved_at = ${now}
			WHERE status = 'tracking'`;
		this.sql`UPDATE trade_proposals SET outcome_status = 'resolved'
			WHERE outcome_status = 'tracking'`;

		// Delete in FK-safe order
		const snapshots = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM outcome_snapshots`;
		this.sql`DELETE FROM outcome_snapshots`;

		const messages = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM discussion_messages`;
		this.sql`DELETE FROM discussion_messages`;

		const outcomes = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM proposal_outcomes`;
		this.sql`DELETE FROM proposal_outcomes`;

		const proposals = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM trade_proposals`;
		this.sql`DELETE FROM trade_proposals`;

		const threads = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM discussion_threads`;
		this.sql`DELETE FROM discussion_threads`;

		this.sql`DELETE FROM strategy_templates`;
		this.sql`DELETE FROM personas`;

		// Re-seed strategy templates
		for (let idx = 0; idx < DEFAULT_STRATEGIES.length; idx++) {
			const s = DEFAULT_STRATEGIES[idx] as StrategyTemplate;
			this.sql`INSERT OR IGNORE INTO strategy_templates (id, name, data, is_default, created_at)
				VALUES (${s.id}, ${s.name}, ${JSON.stringify(s)}, ${idx === 1 ? 1 : 0}, ${new Date().toISOString()})`;
		}

		// Clear chat history (server-side persisted messages)
		await this.saveMessages([]);

		// Reset in-memory state
		this.setState({
			...this.state,
			cycleCount: 0,
			errorCount: 0,
			lastError: null,
			lastCycleAt: null,
			activeThreadId: null,
			activeThread: null,
			pendingProposalCount: 0,
		});

		return {
			status: 'success',
			message: 'Session data has been reset',
			cleared: {
				threads: threads[0]?.cnt ?? 0,
				messages: messages[0]?.cnt ?? 0,
				proposals: proposals[0]?.cnt ?? 0,
				outcomes: outcomes[0]?.cnt ?? 0,
				snapshots: snapshots[0]?.cnt ?? 0,
			},
		};
	}

	// --- Scheduled analysis ---

	async runScheduledCycle() {
		if (!this.state.enabled) return;

		try {
			await this.triggerAnalysis();
			this.expireProposals();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const config = this.loadConfig();
			this.setState({
				...this.state,
				lastCycleAt: Date.now(),
				errorCount: this.state.errorCount + 1,
				lastError: message,
			});
			await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
		}
	}

	// --- Analysis orchestration ---

	private async runAnalysisForSymbol(
		symbol: string,
		config: EffectiveConfig,
	): Promise<{ threadId: string; summary: string }> {
		const threadId = crypto.randomUUID();
		const now = Date.now();

		this.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES (${threadId}, ${config.orchestrationMode}, ${symbol}, 'in_progress', ${now})`;

		this.setState({ ...this.state, activeThreadId: threadId });

		const onMessage = (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => {
			const msgId = crypto.randomUUID();
			const ts = Date.now();
			this
				.sql`INSERT INTO discussion_messages (id, thread_id, timestamp, sender, phase, content, metadata)
				VALUES (${msgId}, ${threadId}, ${ts}, ${JSON.stringify(msg.sender)}, ${msg.phase}, ${msg.content}, ${JSON.stringify(msg.metadata)})`;
			this.broadcastThread(threadId);
		};

		try {
			const strategy = this.getActiveStrategy(config);
			let summary: string;

			if (config.orchestrationMode === 'debate') {
				summary = await this.runDebateAnalysis(threadId, symbol, strategy, config, onMessage);
			} else {
				summary = await this.runPipelineAnalysis(threadId, symbol, strategy, config, onMessage);
			}

			this
				.sql`UPDATE discussion_threads SET status = 'completed', completed_at = ${Date.now()} WHERE id = ${threadId}`;
			this.setState({ ...this.state, activeThreadId: null });
			this.broadcastThread(threadId);

			return { threadId, summary };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this
				.sql`UPDATE discussion_threads SET status = 'failed', completed_at = ${Date.now()} WHERE id = ${threadId}`;
			this.setState({
				...this.state,
				activeThreadId: null,
				errorCount: this.state.errorCount + 1,
				lastError: message,
			});
			return { threadId, summary: `Analysis failed: ${message}` };
		}
	}

	private async runDebateAnalysis(
		threadId: string,
		symbol: string,
		strategy: StrategyTemplate,
		config: EffectiveConfig,
		onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void,
	): Promise<string> {
		const userId = this.name;
		const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
			this.env.DebateOrchestratorAgent,
			`${userId}:${symbol}`,
		);
		const ta = await getAgentByName<Env, TechnicalAnalysisAgent>(
			this.env.TechnicalAnalysisAgent,
			`${userId}:${symbol}`,
		);
		const taResult = await ta.analyze('1Day');

		const personas = await this.loadPersonasFromDb();
		const moderatorPrompt = await this.loadModeratorPrompt();
		const debateConfig = {
			personas,
			rounds: config.debateRounds,
			moderatorPrompt,
		};

		const result = (await debate.runDebate({
			symbol,
			signals: taResult.signals,
			indicators: taResult.indicators,
			strategy,
			config: debateConfig,
			onMessage,
			llmPrefs: {
				temperature: config.llmTemperature,
				maxTokens: config.llmMaxTokens,
			},
			scoreWindows: config.scoreWindows,
		})) as RunDebateResult;

		const consensus = result.consensus;
		if (consensus.action !== 'hold' && consensus.confidence >= config.minConfidenceThreshold) {
			await this.createProposal(threadId, symbol, consensus, config);
		}

		return `Debate analysis for ${symbol}: ${consensus.action} (confidence: ${consensus.confidence.toFixed(2)})`;
	}

	private async runPipelineAnalysis(
		threadId: string,
		symbol: string,
		strategy: StrategyTemplate,
		config: EffectiveConfig,
		onMessage: (msg: Omit<DiscussionMessage, 'id' | 'threadId' | 'timestamp'>) => void,
	): Promise<string> {
		const userId = this.name;
		const pipeline = await getAgentByName<Env, PipelineOrchestratorAgent>(
			this.env.PipelineOrchestratorAgent,
			`${userId}:${symbol}`,
		);

		const result = (await pipeline.runPipeline({
			symbol,
			strategyId: config.activeStrategyId,
			strategy,
			onMessage,
			llmPrefs: {
				temperature: config.llmTemperature,
				maxTokens: config.llmMaxTokens,
			},
			proposalTimeoutSec: config.proposalTimeoutSec,
			scoreWindows: config.scoreWindows,
		})) as RunPipelineResult;

		if (result.proposal) {
			const proposal = { ...result.proposal, threadId };
			this.storeProposal(proposal);
			this.sql`UPDATE discussion_threads SET proposal_id = ${proposal.id} WHERE id = ${threadId}`;
		}

		const status = result.session.status;
		const action = result.proposal?.action ?? 'hold';
		return `Pipeline analysis for ${symbol}: ${action} (status: ${status})`;
	}

	// --- Trade decision ---

	private async handleTradeDecision(
		proposalId: string,
		approved: boolean,
	): Promise<{ status: string; message: string }> {
		const rows = this.sql<ProposalRow>`SELECT * FROM trade_proposals WHERE id = ${proposalId}`;
		const row = rows[0];
		if (!row) return { status: 'error', message: 'Proposal not found' };

		const proposal = rowToProposal(row);
		if (proposal.status !== 'pending') {
			return { status: 'error', message: `Proposal already ${proposal.status}` };
		}
		if (proposal.expiresAt < Date.now()) {
			this
				.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()} WHERE id = ${proposalId}`;
			return { status: 'expired', message: 'Proposal has expired' };
		}

		const decidedAt = Date.now();
		if (!approved) {
			this
				.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${decidedAt} WHERE id = ${proposalId}`;
			return { status: 'rejected', message: 'Trade rejected by user' };
		}

		this
			.sql`UPDATE trade_proposals SET status = 'approved', decided_at = ${decidedAt} WHERE id = ${proposalId}`;

		try {
			const userId = this.name;
			const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
				this.env.AlpacaBrokerAgent,
				userId,
			);

			const qty = proposal.qty ?? undefined;
			let notional = proposal.notional ?? undefined;

			if (!qty && !notional && proposal.positionSizePct) {
				const account = await broker.getAccount();
				notional = Math.round(account.cash * (proposal.positionSizePct / 100) * 100) / 100;
			}

			const orderResult = await broker.placeOrder({
				symbol: proposal.symbol,
				side: proposal.action,
				type: 'market',
				timeInForce: 'day',
				qty,
				notional,
			});

			this.sql`UPDATE trade_proposals SET status = 'executed' WHERE id = ${proposalId}`;
			this.createOutcomeTracking(proposal, orderResult);
			return {
				status: 'executed',
				message: `Trade executed: ${proposal.action} ${proposal.symbol}`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { status: 'error', message: `Execution failed: ${message}` };
		}
	}

	// --- Helpers ---

	private broadcastThread(threadId: string): void {
		const thread = this.getThread(threadId);
		if (thread) {
			this.setState({
				...this.state,
				activeThreadId: thread.status === 'in_progress' ? threadId : null,
				activeThread: thread,
				pendingProposalCount: this.countPendingProposals(),
			});
		}
	}

	private hydrateThread(row: ThreadRow): DiscussionThread {
		const msgRows = this.sql<MessageRow>`
			SELECT * FROM discussion_messages WHERE thread_id = ${row.id} ORDER BY timestamp ASC`;
		const messages = msgRows.map(rowToMessage);

		let proposal: TradeProposal | null = null;
		if (row.proposal_id) {
			const pRows = this
				.sql<ProposalRow>`SELECT * FROM trade_proposals WHERE id = ${row.proposal_id}`;
			if (pRows[0]) proposal = rowToProposal(pRows[0]);
		}

		return rowToThread(row, messages, proposal);
	}

	private loadConfig(): SessionConfig {
		const rows = this.sql<SessionConfigRow>`
			SELECT orchestration_mode, broker_type, llm_provider, llm_model,
				watchlist_symbols, analysis_interval_sec, min_confidence_threshold,
				position_size_pct, active_strategy_id, debate_rounds, proposal_timeout_sec
			FROM session_config WHERE id = 'current'`;
		if (rows[0]) return rowToConfig(rows[0]);
		return DEFAULT_SESSION_CONFIG;
	}

	private async loadEffectiveConfig(): Promise<EffectiveConfig> {
		const sessionConfig = this.loadConfig();
		const tradingConfig = await getTradingConfig(this.name);
		const activeStrategy = this.getActiveStrategy(sessionConfig);
		return resolveEffectiveConfig({ tradingConfig, sessionConfig, activeStrategy });
	}

	private persistConfig(config: SessionConfig): void {
		this.sql`UPDATE session_config SET
			orchestration_mode = ${config.orchestrationMode},
			broker_type = ${config.brokerType},
			llm_provider = ${config.llmProvider},
			llm_model = ${config.llmModel},
			watchlist_symbols = ${JSON.stringify(config.watchlistSymbols)},
			analysis_interval_sec = ${config.analysisIntervalSec},
			min_confidence_threshold = ${config.minConfidenceThreshold},
			position_size_pct = ${config.positionSizePctOfCash},
			active_strategy_id = ${config.activeStrategyId},
			debate_rounds = ${config.debateRounds},
			proposal_timeout_sec = ${config.proposalTimeoutSec},
			updated_at = ${Date.now()}
			WHERE id = 'current'`;
	}

	private async loadPersonasFromDb(): Promise<PersonaConfig[]> {
		try {
			const userId = this.name;
			let rows = await getDebatePersonas(userId);

			// Lazy seed if no rows exist
			if (rows.length === 0) {
				rows = await seedDefaultPersonas(userId);
			}

			// Filter to active personas only
			const active = rows.filter((r) => r.isActive);

			// Map DB rows to PersonaConfig for orchestrator
			return active.map((row) => ({
				id: row.name,
				name: row.displayName,
				role: row.role,
				systemPrompt: row.systemPrompt,
				bias: row.bias,
			}));
		} catch (error) {
			// Fallback to hardcoded defaults if DB fetch fails
			console.error('Failed to load personas from DB, using defaults:', error);
			return [...DEFAULT_PERSONAS];
		}
	}

	private async loadModeratorPrompt(): Promise<string> {
		try {
			const userId = this.name;
			const tradingConfig = await getTradingConfig(userId);
			return tradingConfig?.moderatorPrompt ?? DEFAULT_MODERATOR_PROMPT;
		} catch {
			return DEFAULT_MODERATOR_PROMPT;
		}
	}

	private getActiveStrategy(config: Pick<SessionConfig, 'activeStrategyId'>): StrategyTemplate {
		const rows = this.sql<StrategyTemplateRow>`
			SELECT id, name, data, is_default FROM strategy_templates WHERE id = ${config.activeStrategyId}`;
		if (rows[0]) return JSON.parse(rows[0].data) as StrategyTemplate;

		// Fallback to moderate
		const fallback = DEFAULT_STRATEGIES.find((s) => s.id === 'moderate');
		if (fallback) return fallback;
		return DEFAULT_STRATEGIES[0] as StrategyTemplate;
	}

	private async createProposal(
		threadId: string,
		symbol: string,
		consensus: {
			action: string;
			confidence: number;
			rationale: string;
			entryPrice: number | null;
			targetPrice: number | null;
			stopLoss: number | null;
			positionSizePct: number | null;
			risks: string[];
		},
		config: EffectiveConfig,
	): Promise<void> {
		if (consensus.action === 'hold') return;

		const warnings: string[] = [];

		if (consensus.action === 'sell') {
			try {
				const userId = this.name;
				const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
					this.env.AlpacaBrokerAgent,
					userId,
				);
				const positions = await broker.getPositions();
				const hasPosition = positions.some((p) => p.symbol === symbol && p.qty > 0);
				if (!hasPosition) {
					warnings.push(
						`No ${symbol} position held — selling would require short selling or this may not be executable`,
					);
				}
			} catch {
				warnings.push('Could not verify portfolio positions — broker check failed');
			}
		}

		const proposal: TradeProposal = {
			id: crypto.randomUUID(),
			threadId,
			symbol,
			action: consensus.action as 'buy' | 'sell',
			confidence: consensus.confidence,
			rationale: consensus.rationale,
			entryPrice: consensus.entryPrice,
			targetPrice: consensus.targetPrice,
			stopLoss: consensus.stopLoss,
			qty: null,
			notional: null,
			positionSizePct: consensus.positionSizePct ?? config.positionSizePctOfCash,
			risks: consensus.risks,
			warnings,
			expiresAt: Date.now() + config.proposalTimeoutSec * 1000,
			status: 'pending',
			createdAt: Date.now(),
			decidedAt: null,
			orderId: null,
			filledQty: null,
			filledAvgPrice: null,
			outcomeStatus: 'none',
		};

		this.storeProposal(proposal);
		this.sql`UPDATE discussion_threads SET proposal_id = ${proposal.id} WHERE id = ${threadId}`;
	}

	private storeProposal(p: TradeProposal): void {
		this.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price,
			 stop_loss, qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, decided_at,
			 order_id, filled_qty, filled_avg_price, outcome_status)
			VALUES (${p.id}, ${p.threadId}, ${p.symbol}, ${p.action}, ${p.confidence}, ${p.rationale},
				${p.entryPrice}, ${p.targetPrice}, ${p.stopLoss}, ${p.qty}, ${p.notional},
				${p.positionSizePct}, ${JSON.stringify(p.risks)}, ${JSON.stringify(p.warnings)},
				${p.expiresAt}, ${p.status},
				${p.createdAt}, ${p.decidedAt}, ${p.orderId}, ${p.filledQty}, ${p.filledAvgPrice},
				${p.outcomeStatus})`;
	}

	private countPendingProposals(): number {
		const rows = this
			.sql<CountRow>`SELECT COUNT(*) as cnt FROM trade_proposals WHERE status = 'pending'`;
		return rows[0]?.cnt ?? 0;
	}

	private expireProposals(): void {
		const now = Date.now();
		this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${now}
			WHERE status = 'pending' AND expires_at < ${now}`;
	}

	private async syncLLMProvider(config: SessionConfig): Promise<void> {
		try {
			const userId = this.name;
			const llm = await getAgentByName<Env, LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);
			await llm.setProviderConfig({
				provider: config.llmProvider,
				model: config.llmModel,
			});
		} catch {
			// Non-critical: LLM agent will use its own fallback
		}
	}

	private async resolveProviderConfig(
		config: Pick<EffectiveConfig, 'llmProvider' | 'llmModel'>,
	): Promise<LLMProviderConfig> {
		if (config.llmProvider === 'workers-ai') {
			return {
				provider: 'workers-ai',
				model: config.llmModel,
				aiBinding: this.env.AI,
			};
		}

		const userId = this.name;
		const cred = await getCredential<LLMCredential>({
			userId,
			provider: config.llmProvider,
			masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY,
		});

		if (cred) {
			return {
				provider: config.llmProvider,
				apiKey: cred.apiKey,
				model: config.llmModel,
				baseUrl: cred.baseUrl,
			};
		}

		// Fallback to workers-ai
		return {
			provider: 'workers-ai',
			model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			aiBinding: this.env.AI,
		};
	}

	// --- Outcome tracking ---

	private createOutcomeTracking(
		proposal: TradeProposal,
		orderResult: { id: string; filledQty: number; filledAvgPrice: number | null },
	): void {
		const filledPrice = orderResult.filledAvgPrice ?? proposal.entryPrice ?? 0;
		const filledQty = orderResult.filledQty;

		this.sql`UPDATE trade_proposals SET
			order_id = ${orderResult.id},
			filled_qty = ${filledQty},
			filled_avg_price = ${filledPrice},
			outcome_status = 'tracking'
			WHERE id = ${proposal.id}`;

		const thread = this.sql<ThreadRow>`
			SELECT * FROM discussion_threads WHERE id = ${proposal.threadId}`;
		const threadRow = thread[0];

		const orchestrationMode = threadRow?.orchestration_mode ?? 'debate';
		const orchestratorSessionId = this.resolveOrchestratorSessionId(proposal, orchestrationMode);

		const outcomeId = crypto.randomUUID();
		this.sql`INSERT INTO proposal_outcomes
			(id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
			 symbol, action, entry_price, entry_qty, status, created_at)
			VALUES (${outcomeId}, ${proposal.id}, ${proposal.threadId},
				${orchestrationMode}, ${orchestratorSessionId},
				${proposal.symbol}, ${proposal.action},
				${filledPrice}, ${filledQty}, 'tracking', ${Date.now()})`;
	}

	private resolveOrchestratorSessionId(proposal: TradeProposal, _mode: string): string {
		// The orchestrator session ID links this outcome back to the specific debate/pipeline session
		// For now, use the convention: {userId}:{symbol}
		const userId = this.name;
		return `${userId}:${proposal.symbol}`;
	}

	async runOutcomeTrackingCycle(): Promise<void> {
		try {
			const userId = this.name;
			const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
				this.env.AlpacaBrokerAgent,
				userId,
			);

			const clock = await broker.getClock();
			if (!clock.isOpen) return;

			const tracking = this.sql<ProposalOutcomeRow>`
				SELECT * FROM proposal_outcomes WHERE status = 'tracking'`;
			if (tracking.length === 0) return;

			const positions = await broker.getPositions();
			const positionMap = new Map(positions.map((p) => [p.symbol, p]));

			for (const row of tracking) {
				const outcome = rowToOutcome(row);
				const position = positionMap.get(outcome.symbol);

				if (!position || position.qty === 0) {
					await this.resolveOutcome(outcome, broker);
				} else {
					this.recordSnapshot(outcome, position);
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: `Outcome tracking failed: ${message}`,
			});
		}
	}

	private async resolveOutcome(
		outcome: ProposalOutcome,
		broker: Pick<AlpacaBrokerAgent, 'getOrderHistory'>,
	): Promise<void> {
		let exitOrder: OrderLogEntry | undefined;
		try {
			const orders = await broker.getOrderHistory(outcome.symbol);
			exitOrder = this.findExitOrder(orders, outcome);
		} catch {
			// getOrderHistory may not be implemented yet — resolve with entry price
		}

		const exitPrice = exitOrder?.filledAvgPrice ?? outcome.entryPrice;
		const pnl =
			outcome.action === 'buy'
				? (exitPrice - outcome.entryPrice) * outcome.entryQty
				: (outcome.entryPrice - exitPrice) * outcome.entryQty;
		const pnlPct =
			((exitPrice - outcome.entryPrice) / outcome.entryPrice) * (outcome.action === 'buy' ? 1 : -1);

		const exitReason = this.determineExitReason(exitOrder, outcome);
		const now = Date.now();

		this.sql`UPDATE proposal_outcomes SET
			status = 'resolved',
			exit_price = ${exitPrice},
			exit_reason = ${exitReason},
			realized_pnl = ${pnl},
			realized_pnl_pct = ${pnlPct},
			holding_duration_ms = ${now - outcome.createdAt},
			resolved_at = ${now}
			WHERE id = ${outcome.id}`;

		this.sql`UPDATE trade_proposals SET outcome_status = 'resolved'
			WHERE id = ${outcome.proposalId}`;

		await this.distributeOutcome(outcome, pnl, pnlPct);
	}

	private async distributeOutcome(
		outcome: ProposalOutcome,
		pnl: number,
		pnlPct: number,
	): Promise<void> {
		const resolvedOutcome = {
			symbol: outcome.symbol,
			realizedPnl: pnl,
			realizedPnlPct: pnlPct,
			action: outcome.action,
		};

		try {
			const userId = this.name;
			if (outcome.orchestrationMode === 'debate') {
				const debate = await getAgentByName<Env, DebateOrchestratorAgent>(
					this.env.DebateOrchestratorAgent,
					userId,
				);
				await debate.recordPersonaOutcome(
					outcome.proposalId,
					outcome.orchestratorSessionId,
					resolvedOutcome,
				);
			} else {
				const pipeline = await getAgentByName<Env, PipelineOrchestratorAgent>(
					this.env.PipelineOrchestratorAgent,
					userId,
				);
				await pipeline.recordStepOutcome(
					outcome.proposalId,
					outcome.orchestratorSessionId,
					resolvedOutcome,
				);
			}
		} catch {
			// Non-critical: outcome distribution failure shouldn't break tracking
		}
	}

	private recordSnapshot(outcome: ProposalOutcome, position: BrokerPosition): void {
		this.sql`INSERT INTO outcome_snapshots
			(id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
			VALUES (${crypto.randomUUID()}, ${outcome.id}, ${position.unrealizedPl},
				${position.unrealizedPlPct}, ${position.currentPrice}, ${Date.now()})`;
	}

	private findExitOrder(
		orders: OrderLogEntry[],
		outcome: ProposalOutcome,
	): OrderLogEntry | undefined {
		// Find the most recent filled order that closes the position
		const exitSide = outcome.action === 'buy' ? 'sell' : 'buy';
		return orders
			.filter(
				(o) => o.side === exitSide && o.status === 'filled' && o.createdAt > outcome.createdAt,
			)
			.sort((a, b) => b.createdAt - a.createdAt)[0];
	}

	private determineExitReason(
		exitOrder: OrderLogEntry | undefined,
		outcome: ProposalOutcome,
	): ExitReason {
		if (!exitOrder) return 'manual_close';

		const proposal = this.sql<ProposalRow>`
			SELECT * FROM trade_proposals WHERE id = ${outcome.proposalId}`;
		const row = proposal[0];
		if (!row) return 'manual_close';

		const p = rowToProposal(row);
		if (
			p.stopLoss !== null &&
			exitOrder.filledAvgPrice !== null &&
			exitOrder.filledAvgPrice <= p.stopLoss
		) {
			return 'stop_loss';
		}
		if (
			p.targetPrice !== null &&
			exitOrder.filledAvgPrice !== null &&
			exitOrder.filledAvgPrice >= p.targetPrice
		) {
			return 'target_hit';
		}
		return 'manual_close';
	}

	@callable()
	getOutcomes(status?: string): ProposalOutcome[] {
		if (status) {
			const rows = this.sql<ProposalOutcomeRow>`
				SELECT * FROM proposal_outcomes WHERE status = ${status} ORDER BY created_at DESC`;
			return rows.map(rowToOutcome);
		}
		const rows = this.sql<ProposalOutcomeRow>`
			SELECT * FROM proposal_outcomes ORDER BY created_at DESC LIMIT 50`;
		return rows.map(rowToOutcome);
	}

	@callable()
	getOutcomeSnapshots(outcomeId: string): OutcomeSnapshot[] {
		const rows = this.sql<OutcomeSnapshotRow>`
			SELECT * FROM outcome_snapshots WHERE outcome_id = ${outcomeId} ORDER BY snapshot_at DESC`;
		return rows.map(rowToSnapshot);
	}

	// --- Table init + seeding ---

	private initTables(): void {
		this.sql`CREATE TABLE IF NOT EXISTS session_config (
			id                       TEXT PRIMARY KEY DEFAULT 'current',
			orchestration_mode       TEXT NOT NULL DEFAULT 'debate',
			broker_type              TEXT NOT NULL DEFAULT 'AlpacaBrokerAgent',
			llm_provider             TEXT NOT NULL DEFAULT 'workers-ai',
			llm_model                TEXT NOT NULL DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			watchlist_symbols        TEXT NOT NULL DEFAULT '[]',
			analysis_interval_sec    INTEGER NOT NULL DEFAULT 120,
			min_confidence_threshold REAL NOT NULL DEFAULT 0.7,
			position_size_pct        REAL NOT NULL DEFAULT 0.05,
			active_strategy_id       TEXT NOT NULL DEFAULT 'moderate',
			debate_rounds            INTEGER NOT NULL DEFAULT 2,
			proposal_timeout_sec     INTEGER NOT NULL DEFAULT 900,
			updated_at               INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS discussion_threads (
			id                  TEXT PRIMARY KEY,
			orchestration_mode  TEXT NOT NULL,
			symbol              TEXT NOT NULL,
			status              TEXT NOT NULL DEFAULT 'in_progress',
			started_at          INTEGER NOT NULL,
			completed_at        INTEGER,
			proposal_id         TEXT
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS discussion_messages (
			id          TEXT PRIMARY KEY,
			thread_id   TEXT NOT NULL,
			timestamp   INTEGER NOT NULL,
			sender      TEXT NOT NULL,
			phase       TEXT NOT NULL,
			content     TEXT NOT NULL,
			metadata    TEXT NOT NULL DEFAULT '{}'
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS trade_proposals (
			id                TEXT PRIMARY KEY,
			thread_id         TEXT NOT NULL,
			symbol            TEXT NOT NULL,
			action            TEXT NOT NULL,
			confidence        REAL NOT NULL,
			rationale         TEXT NOT NULL,
			entry_price       REAL,
			target_price      REAL,
			stop_loss         REAL,
			qty               REAL,
			notional          REAL,
			position_size_pct REAL NOT NULL,
			risks             TEXT NOT NULL DEFAULT '[]',
			warnings          TEXT NOT NULL DEFAULT '[]',
			expires_at        INTEGER NOT NULL,
			status            TEXT NOT NULL DEFAULT 'pending',
			created_at        INTEGER NOT NULL,
			decided_at        INTEGER,
			order_id          TEXT,
			filled_qty        REAL,
			filled_avg_price  REAL,
			outcome_status    TEXT NOT NULL DEFAULT 'none'
		)`;

		this.migrateTradeProposals();

		this.sql`CREATE TABLE IF NOT EXISTS proposal_outcomes (
			id                      TEXT PRIMARY KEY,
			proposal_id             TEXT NOT NULL REFERENCES trade_proposals(id),
			thread_id               TEXT NOT NULL REFERENCES discussion_threads(id),
			orchestration_mode      TEXT NOT NULL,
			orchestrator_session_id TEXT NOT NULL,
			symbol                  TEXT NOT NULL,
			action                  TEXT NOT NULL,
			entry_price             REAL NOT NULL,
			entry_qty               REAL NOT NULL,
			status                  TEXT NOT NULL DEFAULT 'tracking',
			exit_price              REAL,
			exit_reason             TEXT,
			realized_pnl            REAL,
			realized_pnl_pct        REAL,
			holding_duration_ms     INTEGER,
			resolved_at             INTEGER,
			created_at              INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS outcome_snapshots (
			id                 TEXT PRIMARY KEY,
			outcome_id         TEXT NOT NULL REFERENCES proposal_outcomes(id),
			unrealized_pnl     REAL NOT NULL,
			unrealized_pnl_pct REAL NOT NULL,
			current_price      REAL NOT NULL,
			snapshot_at        INTEGER NOT NULL
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS strategy_templates (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			data TEXT NOT NULL,
			is_default INTEGER DEFAULT 0,
			created_at TEXT DEFAULT (datetime('now'))
		)`;

		this.sql`CREATE TABLE IF NOT EXISTS personas (
			key TEXT PRIMARY KEY,
			data TEXT NOT NULL
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_threads_symbol ON discussion_threads(symbol, started_at DESC)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_threads_status ON discussion_threads(status)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_messages_thread ON discussion_messages(thread_id, timestamp ASC)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_proposals_status ON trade_proposals(status, created_at DESC)`;

		this.sql`CREATE INDEX IF NOT EXISTS idx_outcomes_status ON proposal_outcomes(status)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON proposal_outcomes(symbol, created_at DESC)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_outcomes_proposal ON proposal_outcomes(proposal_id)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_snapshots_outcome ON outcome_snapshots(outcome_id, snapshot_at DESC)`;
	}

	private migrateTradeProposals(): void {
		const columns = this.sql<{ name: string }>`PRAGMA table_info(trade_proposals)`;
		const columnNames = new Set(columns.map((c) => c.name));

		if (!columnNames.has('order_id')) {
			this.sql`ALTER TABLE trade_proposals ADD COLUMN order_id TEXT`;
		}
		if (!columnNames.has('filled_qty')) {
			this.sql`ALTER TABLE trade_proposals ADD COLUMN filled_qty REAL`;
		}
		if (!columnNames.has('filled_avg_price')) {
			this.sql`ALTER TABLE trade_proposals ADD COLUMN filled_avg_price REAL`;
		}
		if (!columnNames.has('outcome_status')) {
			this.sql`ALTER TABLE trade_proposals ADD COLUMN outcome_status TEXT NOT NULL DEFAULT 'none'`;
		}
		if (!columnNames.has('warnings')) {
			this.sql`ALTER TABLE trade_proposals ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'`;
		}
	}

	private seedDefaults(): void {
		const existing = this.sql`SELECT id FROM session_config WHERE id = 'current'`;
		if (existing.length === 0) {
			this.sql`INSERT INTO session_config (id, updated_at) VALUES ('current', ${Date.now()})`;
		}

		const stratCount = this.sql<CountRow>`SELECT COUNT(*) as cnt FROM strategy_templates`;
		if ((stratCount[0]?.cnt ?? 0) === 0) {
			for (let idx = 0; idx < DEFAULT_STRATEGIES.length; idx++) {
				const s = DEFAULT_STRATEGIES[idx] as StrategyTemplate;
				this.sql`INSERT OR IGNORE INTO strategy_templates (id, name, data, is_default, created_at)
					VALUES (${s.id}, ${s.name}, ${JSON.stringify(s)}, ${idx === 1 ? 1 : 0}, ${new Date().toISOString()})`;
			}
		}

		// Phase 24: Personas are now stored in PostgreSQL via debate_personas table.
		// DO SQLite personas table is kept for backward compat but no longer seeded or read.
	}
}
