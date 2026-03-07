import type { SessionState } from '@repo/data-ops/agents/session/types';
import { Agent } from 'agents';

// TODO(M6): Extend AIChatAgent when implementing full chat + HITL flow
export class SessionAgent extends Agent<Env, SessionState> {
	initialState: SessionState = {
		enabled: false,
		lastCycleAt: null,
		cycleCount: 0,
		activeThreadId: null,
		pendingProposalCount: 0,
		errorCount: 0,
		lastError: null,
	};

	async onStart() {
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
			expires_at        INTEGER NOT NULL,
			status            TEXT NOT NULL DEFAULT 'pending',
			created_at        INTEGER NOT NULL,
			decided_at        INTEGER
		)`;

		this
			.sql`CREATE INDEX IF NOT EXISTS idx_threads_symbol ON discussion_threads(symbol, started_at DESC)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_threads_status ON discussion_threads(status)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_messages_thread ON discussion_messages(thread_id, timestamp ASC)`;
		this
			.sql`CREATE INDEX IF NOT EXISTS idx_proposals_status ON trade_proposals(status, created_at DESC)`;

		this.seedDefaults();
	}

	private seedDefaults() {
		const existing = this.sql`SELECT id FROM session_config WHERE id = 'current'`;
		if (existing.length === 0) {
			this.sql`INSERT INTO session_config (id, updated_at) VALUES ('current', ${Date.now()})`;
		}
	}
}
