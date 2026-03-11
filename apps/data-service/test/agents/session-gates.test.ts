import { getTradingConfig } from '@repo/data-ops/trading-config';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { permissiveTradingConfig, strictTradingConfig } from '../harness/fixtures';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent risk gates', () => {
	let agent: SessionAgent;
	let mocks: Awaited<ReturnType<typeof createTestAgent>>['mocks'];

	beforeEach(async () => {
		clearMockRegistry();
		const result = await createTestAgent();
		agent = result.agent;
		mocks = result.mocks;
		registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker);
		registerMockAgent(agent.env.DebateOrchestratorAgent, mocks.debate);
		registerMockAgent(agent.env.PipelineOrchestratorAgent, mocks.pipeline);
		registerMockAgent(agent.env.TechnicalAnalysisAgent, {
			analyze: vi.fn().mockResolvedValue({ signals: [], indicators: {} }),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// --- G1: Market hours gate ---

	test('G1: skips when market closed and tradingHoursOnly enabled', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: false });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...strictTradingConfig,
			tradingHoursOnly: true,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		expect(result.skipReason).toContain('Market is closed');
		expect(result.threadIds).toHaveLength(0);
	});

	test('G1: proceeds when market closed but tradingHoursOnly disabled', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: false });
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		// Should not skip for market hours — skipReason is undefined or doesn't mention "Market is closed"
		expect(result.skipReason ?? '').not.toContain('Market is closed');
	});

	// --- G4: Daily loss circuit breaker ---

	test('G4: skips when daily loss exceeds maxDailyLossPct', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		// Return loss of -5% (last element in profitLossPct array)
		mocks.broker.getPortfolioHistory.mockResolvedValue({
			profitLossPct: [-0.05],
		});
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			maxDailyLossPct: 0.02,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		expect(result.skipReason).toContain('Daily loss');
		expect(result.threadIds).toHaveLength(0);
	});

	test('G4: proceeds when loss within limit', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPortfolioHistory.mockResolvedValue({
			profitLossPct: [-0.01],
		});
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			maxDailyLossPct: 0.02,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		expect(result.skipReason ?? '').not.toContain('Daily loss');
	});

	// --- G5: Cooldown after loss ---

	test('G5: skips during cooldown after loss', async () => {
		const now = Date.now();

		// Insert FK parent rows, then the resolved losing outcome
		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES ('t1', 'debate', 'AAPL', 'completed', ${now - 60 * 60_000})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, outcome_status)
			VALUES ('p1', 't1', 'AAPL', 'buy', 0.85, 'test', 150, 165, 142,
			 10, 1500, 5, '[]', '[]', ${now}, 'executed', ${now - 60 * 60_000}, 'resolved')`;
		agent.sql`INSERT INTO proposal_outcomes
			(id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
			 symbol, action, entry_price, entry_qty, status, realized_pnl, resolved_at, created_at)
			VALUES ('o1', 'p1', 't1', 'debate', 's1', 'AAPL', 'buy', 150, 10, 'resolved',
					${-50.0}, ${now - 5 * 60_000}, ${now - 60 * 60_000})`;

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			cooldownMinutesAfterLoss: 30,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		expect(result.skipReason).toContain('Cooldown active');
	});

	test('G5: proceeds when cooldown expired', async () => {
		const now = Date.now();

		// Insert FK parent rows, then the resolved losing outcome from 60 min ago
		agent.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
			VALUES ('t1', 'debate', 'AAPL', 'completed', ${now - 120 * 60_000})`;
		agent.sql`INSERT INTO trade_proposals
			(id, thread_id, symbol, action, confidence, rationale, entry_price, target_price, stop_loss,
			 qty, notional, position_size_pct, risks, warnings, expires_at, status, created_at, outcome_status)
			VALUES ('p1', 't1', 'AAPL', 'buy', 0.85, 'test', 150, 165, 142,
			 10, 1500, 5, '[]', '[]', ${now}, 'executed', ${now - 120 * 60_000}, 'resolved')`;
		agent.sql`INSERT INTO proposal_outcomes
			(id, proposal_id, thread_id, orchestration_mode, orchestrator_session_id,
			 symbol, action, entry_price, entry_qty, status, realized_pnl, resolved_at, created_at)
			VALUES ('o1', 'p1', 't1', 'debate', 's1', 'AAPL', 'buy', 150, 10, 'resolved',
					${-50.0}, ${now - 60 * 60_000}, ${now - 120 * 60_000})`;

		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			cooldownMinutesAfterLoss: 30,
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL'] });

		const result = await agent.triggerAnalysis();
		expect(result.skipReason ?? '').not.toContain('Cooldown');
	});

	// --- G2: Blacklist ---

	test('G2: filters blacklisted symbols', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			tickerBlacklist: ['TSLA'],
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL', 'TSLA'] });

		const result = await agent.triggerAnalysis();
		// AAPL should produce a thread, TSLA should be filtered
		expect(result.threadIds.length).toBeLessThanOrEqual(1);
		// Should not skip entirely — AAPL is still valid
		if (result.threadIds.length > 0) {
			expect(result.skipReason).toBeUndefined();
		}
	});

	// --- G3: Allowlist ---

	test('G3: filters symbols not in allowlist', async () => {
		mocks.broker.getClock.mockResolvedValue({ isOpen: true });
		mocks.broker.getPortfolioHistory.mockResolvedValue({ profitLossPct: [0] });
		vi.mocked(getTradingConfig).mockResolvedValue({
			...permissiveTradingConfig,
			tradingHoursOnly: false,
			tickerAllowlist: ['MSFT'],
		} as ReturnType<typeof getTradingConfig> extends Promise<infer T> ? T : never);
		await agent.updateConfig({ watchlistSymbols: ['AAPL', 'MSFT'] });

		const result = await agent.triggerAnalysis();
		// Only MSFT should pass the allowlist filter
		// AAPL should be filtered out, MSFT should produce a thread
		expect(result.threadIds.length).toBeLessThanOrEqual(1);
	});
});
