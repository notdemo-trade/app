import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';
import {
	DEFAULT_ENTITLEMENTS,
	DEFAULT_STRATEGIES,
	getDefaultOrchestratorConfig,
} from '@repo/data-ops/agents/orchestrator/defaults';
import type {
	AgentAction,
	AgentActivity,
	AgentEntitlement,
	AggregatedSignals,
	OrchestratorConfig,
	OrchestratorState,
	OrchestratorStatus,
	Recommendation,
} from '@repo/data-ops/agents/orchestrator/types';
import type { TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getSignalsSince } from '@repo/data-ops/signal';
import { Agent, callable, getAgentByName } from 'agents';
import type { LLMAnalysisAgent } from './llm-analysis-agent';
import type { TechnicalAnalysisAgent } from './technical-analysis-agent';

const DEFAULT_CONFIG = getDefaultOrchestratorConfig();

interface StrategyTemplateRow {
	id: string;
	name: string;
	data: string;
	is_default: number;
	created_at: string;
}

interface EntitlementRow {
	agent_type: string;
	enabled: number;
}

interface ActivityRow {
	id: string;
	timestamp: string;
	action: string;
	symbol: string;
	details: string;
}

interface ConfigRow {
	data: string;
}

interface CountRow {
	cnt: number;
}

interface RecommendationRow {
	id: string;
	symbol: string;
	action: string;
	confidence: number;
	rationale: string;
	strategy_id: string;
	signals_summary: string | null;
	created_at: string;
}

export class OrchestratorAgent extends Agent<Env, OrchestratorState> {
	static options = { hibernate: true };

	initialState: OrchestratorState = {
		enabled: false,
		lastDataGatherAt: null,
		lastAnalysisAt: null,
		lastTradeAt: null,
		currentCycleStartedAt: null,
		cycleCount: 0,
		errorCount: 0,
		lastError: null,
	};

	private config: OrchestratorConfig = DEFAULT_CONFIG;

	async onStart() {
		initDatabase({
			host: this.env.DATABASE_HOST,
			username: this.env.DATABASE_USERNAME,
			password: this.env.DATABASE_PASSWORD,
		});

		this.initSqliteTables();
		this.loadConfig();
		this.seedDefaults();

		if (this.state.enabled) {
			await this.scheduleEvery(this.config.analystIntervalSec, 'runAnalysisCycle');
		}
	}

	private initSqliteTables() {
		this.sql`CREATE TABLE IF NOT EXISTS config (
			key TEXT PRIMARY KEY DEFAULT 'main',
			data TEXT NOT NULL
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS strategy_templates (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			data TEXT NOT NULL,
			is_default INTEGER DEFAULT 0,
			created_at TEXT DEFAULT (datetime('now'))
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS entitlements (
			agent_type TEXT PRIMARY KEY,
			enabled INTEGER NOT NULL DEFAULT 1
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS activity_log (
			id TEXT PRIMARY KEY,
			timestamp TEXT NOT NULL,
			action TEXT NOT NULL,
			symbol TEXT,
			details TEXT DEFAULT '{}',
			created_at TEXT DEFAULT (datetime('now'))
		)`;
		this.sql`CREATE TABLE IF NOT EXISTS recommendations (
			id TEXT PRIMARY KEY,
			symbol TEXT NOT NULL,
			action TEXT NOT NULL,
			confidence REAL NOT NULL,
			rationale TEXT NOT NULL,
			strategy_id TEXT NOT NULL,
			signals_summary TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)`;
	}

	private loadConfig() {
		const rows = this.sql<ConfigRow>`SELECT data FROM config WHERE key = 'main'`;
		if (rows[0]) {
			this.config = { ...DEFAULT_CONFIG, ...JSON.parse(rows[0].data) };
		}
	}

	private seedDefaults() {
		const existingStrategies = this.sql<{
			cnt: number;
		}>`SELECT COUNT(*) as cnt FROM strategy_templates`;
		if ((existingStrategies[0]?.cnt ?? 0) === 0) {
			for (let idx = 0; idx < DEFAULT_STRATEGIES.length; idx++) {
				const s = DEFAULT_STRATEGIES[idx];
				if (!s) continue;
				this.sql`INSERT OR IGNORE INTO strategy_templates (id, name, data, is_default, created_at)
					VALUES (${s.id}, ${s.name}, ${JSON.stringify(s)}, ${idx === 1 ? 1 : 0}, ${new Date().toISOString()})`;
			}
		}

		const existingEntitlements = this.sql<{
			cnt: number;
		}>`SELECT COUNT(*) as cnt FROM entitlements`;
		if ((existingEntitlements[0]?.cnt ?? 0) === 0) {
			for (const e of DEFAULT_ENTITLEMENTS) {
				this.sql`INSERT OR IGNORE INTO entitlements (agent_type, enabled)
					VALUES (${e.agentType}, ${e.enabled ? 1 : 0})`;
			}
		}
	}

	// --- Callable RPCs ---

	@callable()
	async start(): Promise<OrchestratorStatus> {
		this.setState({ ...this.state, enabled: true });
		await this.scheduleEvery(this.config.analystIntervalSec, 'runAnalysisCycle');
		this.logActivity('started', undefined, 'Orchestrator started');
		return this.getStatus();
	}

	@callable()
	async stop(): Promise<OrchestratorStatus> {
		this.setState({ ...this.state, enabled: false });
		this.logActivity('stopped', undefined, 'Orchestrator stopped');
		return this.getStatus();
	}

	@callable()
	async triggerCycle(): Promise<OrchestratorStatus> {
		await this.runAnalysisCycle();
		return this.getStatus();
	}

	@callable()
	async updateConfig(partial: Partial<OrchestratorConfig>): Promise<OrchestratorConfig> {
		this.config = { ...this.config, ...partial };
		this
			.sql`INSERT OR REPLACE INTO config (key, data) VALUES ('main', ${JSON.stringify(this.config)})`;
		return this.config;
	}

	@callable()
	async setEntitlement(agentType: string, enabled: boolean): Promise<AgentEntitlement[]> {
		this
			.sql`INSERT OR REPLACE INTO entitlements (agent_type, enabled) VALUES (${agentType}, ${enabled ? 1 : 0})`;
		return this.getEntitlements();
	}

	@callable()
	async getStatus(): Promise<OrchestratorStatus> {
		const todayStart = new Date();
		todayStart.setUTCHours(0, 0, 0, 0);
		const todayStr = todayStart.toISOString();

		const signalCount = this.sql<CountRow>`
			SELECT COUNT(*) as cnt FROM activity_log
			WHERE action = 'signals_aggregated' AND timestamp >= ${todayStr}`;

		const recCount = this.sql<CountRow>`
			SELECT COUNT(*) as cnt FROM activity_log
			WHERE action = 'recommendation_logged' AND timestamp >= ${todayStr}`;

		return {
			enabled: this.state.enabled,
			state: this.state,
			config: this.config,
			entitlements: this.getEntitlements(),
			recentActivity: this.getRecentActivity(20),
			stats: {
				signalsToday: signalCount[0]?.cnt ?? 0,
				recommendationsToday: recCount[0]?.cnt ?? 0,
			},
		};
	}

	@callable()
	async getActivity(limit = 50): Promise<AgentActivity[]> {
		return this.getRecentActivity(limit);
	}

	@callable()
	async enable(): Promise<OrchestratorStatus> {
		return this.start();
	}

	@callable()
	async disable(): Promise<OrchestratorStatus> {
		return this.stop();
	}

	@callable()
	async trigger(): Promise<OrchestratorStatus> {
		return this.triggerCycle();
	}

	@callable()
	async updateEntitlement(agentType: string, enabled: boolean): Promise<AgentEntitlement[]> {
		return this.setEntitlement(agentType, enabled);
	}

	@callable()
	getOrchestratorConfig(): OrchestratorConfig {
		return this.config;
	}

	@callable()
	getRecommendations(limit = 20): Recommendation[] {
		const rows = this.sql<RecommendationRow>`
			SELECT id, symbol, action, confidence, rationale, strategy_id, signals_summary, created_at
			FROM recommendations ORDER BY created_at DESC LIMIT ${limit}`;
		return rows.map((r) => ({
			id: r.id,
			symbol: r.symbol,
			action: r.action,
			confidence: r.confidence,
			rationale: r.rationale,
			strategyId: r.strategy_id,
			signalsSummary: r.signals_summary,
			createdAt: r.created_at,
		}));
	}

	// --- Analysis Cycle ---

	async runAnalysisCycle() {
		if (!this.state.enabled) return;

		const cycleStart = new Date().toISOString();
		this.setState({ ...this.state, currentCycleStartedAt: cycleStart });

		try {
			const signals = await this.collectAllSignals();
			this.setState({ ...this.state, lastDataGatherAt: new Date().toISOString() });
			this.logActivity(
				'signals_aggregated',
				undefined,
				`Collected signals for ${Object.keys(signals.technicals).length} symbols`,
			);

			const strategy = this.getActiveStrategy();
			if (!strategy) {
				this.logActivity(
					'error',
					undefined,
					`Strategy '${this.config.activeStrategyId}' not found`,
				);
				return;
			}

			const entitlements = this.getEntitlements();
			const llmEnabled =
				entitlements.find((e) => e.agentType === 'LLMAnalysisAgent')?.enabled ?? false;
			if (!llmEnabled) {
				this.logActivity('error', undefined, 'LLMAnalysisAgent not entitled');
				return;
			}

			for (const [symbol, techSignals] of Object.entries(signals.technicals)) {
				if (techSignals.length === 0) continue;
				if (this.config.tickerBlacklist.includes(symbol)) continue;

				await this.analyzeSymbol(symbol, techSignals, strategy);
			}

			this.setState({
				...this.state,
				lastAnalysisAt: new Date().toISOString(),
				cycleCount: this.state.cycleCount + 1,
				currentCycleStartedAt: null,
			});
		} catch (err) {
			this.setState({
				...this.state,
				errorCount: this.state.errorCount + 1,
				lastError: String(err),
				currentCycleStartedAt: null,
			});
			this.logActivity('error', undefined, String(err));
		}
	}

	private async collectAllSignals(): Promise<AggregatedSignals> {
		const technicals: Record<string, TechnicalSignal[]> = {};
		const entitlements = this.getEntitlements();
		const taEnabled =
			entitlements.find((e) => e.agentType === 'TechnicalAnalysisAgent')?.enabled ?? false;

		if (!taEnabled || this.config.watchlistSymbols.length === 0) {
			return { technicals };
		}

		// Query PG for recent signals written by TA agents
		const since = new Date(Date.now() - this.config.analystIntervalSec * 2 * 1000);
		const pgSignals = await getSignalsSince(since);

		for (const sig of pgSignals) {
			if (!sig.symbol) continue;
			if (!this.config.watchlistSymbols.includes(sig.symbol)) continue;

			const arr = technicals[sig.symbol] ?? [];
			arr.push({
				type: sig.signalType,
				direction: sig.direction as TechnicalSignal['direction'],
				strength: Number(sig.strength),
				description: sig.summary ?? '',
			});
			technicals[sig.symbol] = arr;
		}

		// For symbols with no PG signals, trigger TA analysis on-demand
		for (const symbol of this.config.watchlistSymbols) {
			if (technicals[symbol] && technicals[symbol].length > 0) continue;

			try {
				const userId = this.name;
				const ta = await getAgentByName<Env, TechnicalAnalysisAgent>(
					this.env.TechnicalAnalysisAgent,
					`${userId}:${symbol}`,
				);
				const result = await ta.analyze('1Day');
				if (result.signals.length > 0) {
					technicals[symbol] = result.signals;
				}
			} catch (err) {
				this.logActivity('error', symbol, `TA analysis failed for ${symbol}: ${String(err)}`);
			}
		}

		return { technicals };
	}

	private async analyzeSymbol(
		symbol: string,
		techSignals: TechnicalSignal[],
		strategy: StrategyTemplate,
	) {
		this.logActivity('analysis_started', symbol, `LLM analysis for ${symbol}`);

		try {
			const userId = this.name;
			const llm = await getAgentByName<Env, LLMAnalysisAgent>(this.env.LLMAnalysisAgent, userId);

			const analysisSignals = techSignals.map((s) => ({
				type: s.type,
				direction: s.direction,
				strength: s.strength,
				source: 'technical_analysis',
			}));

			const result = await llm.analyze({
				symbol,
				signals: analysisSignals,
				strategy,
			});

			this.logActivity(
				'analysis_completed',
				symbol,
				`Action: ${result.recommendation.action}, confidence: ${result.recommendation.confidence}`,
			);

			this
				.sql`INSERT INTO recommendations (id, symbol, action, confidence, rationale, strategy_id, signals_summary)
				VALUES (${result.id}, ${symbol}, ${result.recommendation.action}, ${result.recommendation.confidence}, ${result.recommendation.rationale}, ${strategy.id}, ${JSON.stringify(techSignals)})`;

			this.logActivity(
				'recommendation_logged',
				symbol,
				`${result.recommendation.action.toUpperCase()} ${symbol} @ ${result.recommendation.confidence.toFixed(2)} confidence`,
			);
		} catch (err) {
			this.logActivity('error', symbol, `Analysis failed for ${symbol}: ${String(err)}`);
		}
	}

	// --- Helpers ---

	private getActiveStrategy(): StrategyTemplate | null {
		const rows = this
			.sql<StrategyTemplateRow>`SELECT * FROM strategy_templates WHERE id = ${this.config.activeStrategyId}`;
		const row = rows[0];
		if (!row) return null;
		return JSON.parse(row.data) as StrategyTemplate;
	}

	private getEntitlements(): AgentEntitlement[] {
		const rows = this.sql<EntitlementRow>`SELECT agent_type, enabled FROM entitlements`;
		return rows.map((r) => ({
			agentType: r.agent_type,
			enabled: r.enabled === 1,
		}));
	}

	private getRecentActivity(limit: number): AgentActivity[] {
		const rows = this.sql<ActivityRow>`
			SELECT id, timestamp, action, symbol, details FROM activity_log
			ORDER BY timestamp DESC LIMIT ${limit}`;
		return rows.map((r) => ({
			id: r.id,
			timestamp: r.timestamp,
			action: r.action as AgentAction,
			symbol: r.symbol || undefined,
			details: r.details,
		}));
	}

	private logActivity(action: AgentAction, symbol: string | undefined, details: string) {
		const id = crypto.randomUUID();
		const timestamp = new Date().toISOString();
		this.sql`INSERT INTO activity_log (id, timestamp, action, symbol, details)
			VALUES (${id}, ${timestamp}, ${action}, ${symbol ?? null}, ${details})`;
	}
}
