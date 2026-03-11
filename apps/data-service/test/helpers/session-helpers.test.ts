import type { EnrichmentData } from '@repo/data-ops/agents/enrichment/types';
import { describe, expect, test } from 'vitest';
import type {
	MessageRow,
	OutcomeSnapshotRow,
	ProposalOutcomeRow,
	ProposalRow,
	SessionConfigRow,
	ThreadRow,
} from '@/agents/session-agent-helpers';
import {
	normalizePositionSizePct,
	rowToConfig,
	rowToMessage,
	rowToOutcome,
	rowToProposal,
	rowToSnapshot,
	rowToThread,
	summarizeEnrichment,
} from '@/agents/session-agent-helpers';

// --- Test 1: rowToConfig ---

describe('rowToConfig', () => {
	const baseRow: SessionConfigRow = {
		orchestration_mode: 'debate',
		broker_type: 'AlpacaBrokerAgent',
		llm_provider: 'workers-ai',
		llm_model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		watchlist_symbols: '["AAPL","TSLA"]',
		analysis_interval_sec: 120,
		min_confidence_threshold: 0.7,
		position_size_pct: 0.05,
		active_strategy_id: 'moderate',
		debate_rounds: 2,
		proposal_timeout_sec: 900,
		data_feeds: null,
	};

	test('converts SQL row to SessionConfig with JSON parsing', () => {
		const config = rowToConfig(baseRow);
		expect(config.watchlistSymbols).toEqual(['AAPL', 'TSLA']);
		expect(config.orchestrationMode).toBe('debate');
		expect(config.brokerType).toBe('AlpacaBrokerAgent');
		expect(config.llmProvider).toBe('workers-ai');
		expect(config.llmModel).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
		expect(config.analysisIntervalSec).toBe(120);
		expect(config.minConfidenceThreshold).toBe(0.7);
		expect(config.positionSizePctOfCash).toBe(0.05);
		expect(config.activeStrategyId).toBe('moderate');
		expect(config.debateRounds).toBe(2);
		expect(config.proposalTimeoutSec).toBe(900);
	});

	test('uses default dataFeeds when data_feeds is null', () => {
		const config = rowToConfig(baseRow);
		expect(config.dataFeeds).toEqual({
			technicalAnalysis: true,
			fundamentals: false,
			marketIntelligence: false,
			earnings: false,
		});
	});

	test('parses valid data_feeds JSON', () => {
		const row = {
			...baseRow,
			data_feeds: JSON.stringify({
				technicalAnalysis: true,
				fundamentals: true,
				marketIntelligence: false,
				earnings: true,
			}),
		};
		const config = rowToConfig(row);
		expect(config.dataFeeds.fundamentals).toBe(true);
		expect(config.dataFeeds.earnings).toBe(true);
	});

	test('falls back to default dataFeeds on invalid JSON', () => {
		const row = { ...baseRow, data_feeds: 'not-json' };
		const config = rowToConfig(row);
		expect(config.dataFeeds.technicalAnalysis).toBe(true);
		expect(config.dataFeeds.fundamentals).toBe(false);
	});
});

// --- Test 2: rowToProposal ---

describe('rowToProposal', () => {
	const baseProposalRow: ProposalRow = {
		id: 'prop-1',
		thread_id: 'thread-1',
		symbol: 'AAPL',
		action: 'buy',
		confidence: 0.85,
		rationale: 'Strong momentum',
		entry_price: 150.5,
		target_price: 165.0,
		stop_loss: 145.0,
		qty: 10,
		notional: 1505.0,
		position_size_pct: 5,
		risks: '["market_volatility","earnings_risk"]',
		warnings: '["sell without position"]',
		expires_at: 1700000000,
		status: 'pending',
		created_at: 1699999000,
		decided_at: null,
		order_id: null,
		filled_qty: null,
		filled_avg_price: null,
		outcome_status: 'none',
		orchestrator_session_id: 'sess-1',
	};

	test('converts SQL row to TradeProposal with all fields', () => {
		const proposal = rowToProposal(baseProposalRow);
		expect(proposal.id).toBe('prop-1');
		expect(proposal.threadId).toBe('thread-1');
		expect(proposal.symbol).toBe('AAPL');
		expect(proposal.action).toBe('buy');
		expect(proposal.confidence).toBe(0.85);
		expect(proposal.rationale).toBe('Strong momentum');
		expect(proposal.entryPrice).toBe(150.5);
		expect(proposal.targetPrice).toBe(165.0);
		expect(proposal.stopLoss).toBe(145.0);
		expect(proposal.qty).toBe(10);
		expect(proposal.notional).toBe(1505.0);
		expect(proposal.positionSizePct).toBe(5);
		expect(proposal.risks).toEqual(['market_volatility', 'earnings_risk']);
		expect(proposal.warnings).toEqual(['sell without position']);
		expect(proposal.expiresAt).toBe(1700000000);
		expect(proposal.status).toBe('pending');
		expect(proposal.orchestratorSessionId).toBe('sess-1');
	});

	test('handles null optional fields', () => {
		const proposal = rowToProposal(baseProposalRow);
		expect(proposal.decidedAt).toBeNull();
		expect(proposal.orderId).toBeNull();
		expect(proposal.filledQty).toBeNull();
		expect(proposal.filledAvgPrice).toBeNull();
	});

	test('defaults outcomeStatus to none when null', () => {
		const row = { ...baseProposalRow, outcome_status: null as unknown as string };
		const proposal = rowToProposal(row);
		expect(proposal.outcomeStatus).toBe('none');
	});

	test('handles empty warnings JSON', () => {
		const row = { ...baseProposalRow, warnings: '' };
		const proposal = rowToProposal(row);
		expect(proposal.warnings).toEqual([]);
	});
});

// --- Test 3: rowToThread ---

describe('rowToThread', () => {
	test('hydrates thread with messages and proposal', () => {
		const threadRow: ThreadRow = {
			id: 'thread-1',
			orchestration_mode: 'debate',
			symbol: 'TSLA',
			status: 'in_progress',
			started_at: 1699999000,
			completed_at: null,
		};
		const messages = [
			{
				id: 'msg-1',
				threadId: 'thread-1',
				timestamp: 1699999100,
				sender: { type: 'system' as const },
				phase: 'data_collection' as const,
				content: 'Starting analysis',
				metadata: {},
			},
		];
		const proposal = {
			id: 'prop-1',
			threadId: 'thread-1',
			symbol: 'TSLA',
			action: 'buy' as const,
			confidence: 0.8,
			rationale: 'Momentum',
			entryPrice: 200,
			targetPrice: 220,
			stopLoss: 190,
			qty: 5,
			notional: 1000,
			positionSizePct: 5,
			risks: [],
			warnings: [],
			expiresAt: 1700000000,
			status: 'pending' as const,
			createdAt: 1699999500,
			decidedAt: null,
			orderId: null,
			filledQty: null,
			filledAvgPrice: null,
			outcomeStatus: 'none' as const,
			orchestratorSessionId: null,
		};

		const thread = rowToThread(threadRow, messages, proposal);
		expect(thread.id).toBe('thread-1');
		expect(thread.orchestrationMode).toBe('debate');
		expect(thread.symbol).toBe('TSLA');
		expect(thread.status).toBe('in_progress');
		expect(thread.startedAt).toBe(1699999000);
		expect(thread.completedAt).toBeNull();
		expect(thread.messages).toHaveLength(1);
		expect(thread.messages[0].id).toBe('msg-1');
		expect(thread.proposal).toBe(proposal);
	});

	test('accepts null proposal', () => {
		const threadRow: ThreadRow = {
			id: 'thread-2',
			orchestration_mode: 'pipeline',
			symbol: 'AAPL',
			status: 'completed',
			started_at: 1699999000,
			completed_at: 1700000000,
		};
		const thread = rowToThread(threadRow, [], null);
		expect(thread.proposal).toBeNull();
		expect(thread.messages).toEqual([]);
		expect(thread.completedAt).toBe(1700000000);
	});
});

// --- Test 4: rowToMessage ---

describe('rowToMessage', () => {
	test('parses sender and metadata JSON', () => {
		const row: MessageRow = {
			id: 'msg-1',
			thread_id: 'thread-1',
			timestamp: 1699999100,
			sender: '{"type":"persona","persona":"bull_analyst"}',
			phase: 'debate_round',
			content: 'I see bullish signals',
			metadata: '{"round":1,"confidence":0.8}',
		};

		const msg = rowToMessage(row);
		expect(msg.id).toBe('msg-1');
		expect(msg.threadId).toBe('thread-1');
		expect(msg.timestamp).toBe(1699999100);
		expect(msg.sender).toEqual({ type: 'persona', persona: 'bull_analyst' });
		expect(msg.phase).toBe('debate_round');
		expect(msg.content).toBe('I see bullish signals');
		expect(msg.metadata).toEqual({ round: 1, confidence: 0.8 });
	});

	test('handles system sender', () => {
		const row: MessageRow = {
			id: 'msg-2',
			thread_id: 'thread-1',
			timestamp: 1699999000,
			sender: '{"type":"system"}',
			phase: 'data_collection',
			content: 'Starting',
			metadata: '{}',
		};
		const msg = rowToMessage(row);
		expect(msg.sender).toEqual({ type: 'system' });
		expect(msg.metadata).toEqual({});
	});
});

// --- Test 5: rowToOutcome / rowToSnapshot ---

describe('rowToOutcome', () => {
	test('maps all fields correctly', () => {
		const row: ProposalOutcomeRow = {
			id: 'out-1',
			proposal_id: 'prop-1',
			thread_id: 'thread-1',
			orchestration_mode: 'debate',
			orchestrator_session_id: 'sess-1',
			symbol: 'AAPL',
			action: 'buy',
			entry_price: 150.0,
			entry_qty: 10,
			status: 'resolved',
			exit_price: 165.0,
			exit_reason: 'target_hit',
			realized_pnl: 150.0,
			realized_pnl_pct: 10.0,
			holding_duration_ms: 86400000,
			resolved_at: 1700100000,
			created_at: 1699999000,
		};

		const outcome = rowToOutcome(row);
		expect(outcome.id).toBe('out-1');
		expect(outcome.proposalId).toBe('prop-1');
		expect(outcome.threadId).toBe('thread-1');
		expect(outcome.orchestrationMode).toBe('debate');
		expect(outcome.symbol).toBe('AAPL');
		expect(outcome.action).toBe('buy');
		expect(outcome.entryPrice).toBe(150.0);
		expect(outcome.entryQty).toBe(10);
		expect(outcome.status).toBe('resolved');
		expect(outcome.exitPrice).toBe(165.0);
		expect(outcome.exitReason).toBe('target_hit');
		expect(outcome.realizedPnl).toBe(150.0);
		expect(outcome.realizedPnlPct).toBe(10.0);
		expect(outcome.holdingDurationMs).toBe(86400000);
		expect(outcome.resolvedAt).toBe(1700100000);
	});

	test('handles null exit fields for tracking outcomes', () => {
		const row: ProposalOutcomeRow = {
			id: 'out-2',
			proposal_id: 'prop-2',
			thread_id: 'thread-2',
			orchestration_mode: 'pipeline',
			orchestrator_session_id: 'sess-2',
			symbol: 'TSLA',
			action: 'buy',
			entry_price: 200.0,
			entry_qty: 5,
			status: 'tracking',
			exit_price: null,
			exit_reason: null,
			realized_pnl: null,
			realized_pnl_pct: null,
			holding_duration_ms: null,
			resolved_at: null,
			created_at: 1699999000,
		};

		const outcome = rowToOutcome(row);
		expect(outcome.status).toBe('tracking');
		expect(outcome.exitPrice).toBeNull();
		expect(outcome.exitReason).toBeNull();
		expect(outcome.realizedPnl).toBeNull();
		expect(outcome.resolvedAt).toBeNull();
	});
});

describe('rowToSnapshot', () => {
	test('maps all fields correctly', () => {
		const row: OutcomeSnapshotRow = {
			id: 'snap-1',
			outcome_id: 'out-1',
			unrealized_pnl: 25.5,
			unrealized_pnl_pct: 1.7,
			current_price: 152.55,
			snapshot_at: 1700050000,
		};

		const snapshot = rowToSnapshot(row);
		expect(snapshot.id).toBe('snap-1');
		expect(snapshot.outcomeId).toBe('out-1');
		expect(snapshot.unrealizedPnl).toBe(25.5);
		expect(snapshot.unrealizedPnlPct).toBe(1.7);
		expect(snapshot.currentPrice).toBe(152.55);
		expect(snapshot.snapshotAt).toBe(1700050000);
	});
});

// --- Test 6: normalizePositionSizePct ---

describe('normalizePositionSizePct', () => {
	test('converts fractions to whole numbers', () => {
		expect(normalizePositionSizePct(0.05)).toBe(5);
		expect(normalizePositionSizePct(0.1)).toBe(10);
		expect(normalizePositionSizePct(0.5)).toBe(50);
		expect(normalizePositionSizePct(0.99)).toBeCloseTo(99);
	});

	test('leaves whole numbers unchanged', () => {
		expect(normalizePositionSizePct(5)).toBe(5);
		expect(normalizePositionSizePct(10)).toBe(10);
		expect(normalizePositionSizePct(1)).toBe(1);
		expect(normalizePositionSizePct(100)).toBe(100);
	});

	test('handles zero', () => {
		expect(normalizePositionSizePct(0)).toBe(0);
	});

	test('handles negative values', () => {
		expect(normalizePositionSizePct(-5)).toBe(-5);
	});
});

// --- Test 7: summarizeEnrichment ---

describe('summarizeEnrichment', () => {
	test('builds summary with all sections', () => {
		const data: EnrichmentData = {
			fundamentals: {
				latestIncome: { revenue: 100000 },
				latestBalanceSheet: { totalAssets: 500000 },
				latestCashFlow: { operatingCashFlow: 30000 },
			},
			marketIntelligence: {
				recentInsiderTrades: [
					{ name: 'CEO', type: 'sell', shares: 1000, date: '2024-01-01' },
					{ name: 'CFO', type: 'buy', shares: 500, date: '2024-01-02' },
				],
				topInstitutionalHolders: [{ name: 'Vanguard', shares: 1000000, changePct: 2.5 }],
			},
			earnings: {
				lastEarnings: {
					period: 'Q3 2024',
					epsActual: 1.5,
					epsEstimate: 1.4,
					surprisePct: 7.14,
				},
				nextEarningsDate: '2025-01-28',
			},
		};

		const summary = summarizeEnrichment('AAPL', data);
		expect(summary).toContain('Enrichment data for AAPL');
		expect(summary).toContain(
			'**Fundamentals**: income statement, balance sheet, cash flow available',
		);
		expect(summary).toContain('2 insider trades');
		expect(summary).toContain('1 institutional holders');
		expect(summary).toContain('last EPS 1.5 vs est 1.4 (+7.1%)');
		expect(summary).toContain('next report: 2025-01-28');
	});

	test('shows no data messages for empty sections', () => {
		const data: EnrichmentData = {
			fundamentals: {},
			marketIntelligence: {},
			earnings: {},
		};

		const summary = summarizeEnrichment('TSLA', data);
		expect(summary).toContain('**Fundamentals**: no data in database');
		expect(summary).toContain('**Market Intelligence**: no data in database');
		expect(summary).toContain('**Earnings**: no data in database');
	});

	test('handles completely empty enrichment data', () => {
		const data: EnrichmentData = {};
		const summary = summarizeEnrichment('MSFT', data);
		expect(summary).toBe('Enrichment data for MSFT: no data available in database');
	});

	test('handles negative earnings surprise', () => {
		const data: EnrichmentData = {
			earnings: {
				lastEarnings: {
					period: 'Q2 2024',
					epsActual: 1.2,
					epsEstimate: 1.5,
					surprisePct: -20.0,
				},
			},
		};

		const summary = summarizeEnrichment('META', data);
		expect(summary).toContain('last EPS 1.2 vs est 1.5 (-20.0%)');
	});
});
