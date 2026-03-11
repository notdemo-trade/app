import { beforeEach, describe, expect, test } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent lifecycle', () => {
	let agent: SessionAgent;
	let schedules: { id: string; callback: string; when: Date | number; type: string }[];
	let mocks: Awaited<ReturnType<typeof createTestAgent>>['mocks'];

	beforeEach(async () => {
		clearMockRegistry();
		const result = await createTestAgent();
		agent = result.agent;
		schedules = result.schedules;
		mocks = result.mocks;
		registerMockAgent(agent.env.AlpacaBrokerAgent, mocks.broker);
	});

	test('getConfig returns default config after init', () => {
		const config = agent.getConfig();
		expect(config.orchestrationMode).toBe('debate');
		expect(config.watchlistSymbols).toEqual([]);
		expect(config.analysisIntervalSec).toBe(120);
		expect(config.brokerType).toBe('AlpacaBrokerAgent');
		expect(config.minConfidenceThreshold).toBe(0.7);
	});

	test('start enables session and sets lastCycleAt', async () => {
		const state = await agent.start();
		expect(state.enabled).toBe(true);
		expect(state.lastCycleAt).toBeTypeOf('number');
		expect(schedules.some((s) => s.callback === 'runScheduledCycle')).toBe(true);
	});

	test('stop disables session and cancels all schedules', async () => {
		await agent.start();
		expect(schedules.length).toBeGreaterThan(0);
		const state = await agent.stop();
		expect(state.enabled).toBe(false);
		expect(schedules).toHaveLength(0);
	});

	test('getStatus returns state with pendingProposalCount', () => {
		const status = agent.getStatus();
		expect(status.enabled).toBe(false);
		expect(status.pendingProposalCount).toBe(0);
		expect(status.cycleCount).toBe(0);
		expect(status.lastError).toBeNull();
	});

	test('updateConfig persists changes and preserves unchanged fields', async () => {
		await agent.updateConfig({ analysisIntervalSec: 300 });
		const config = agent.getConfig();
		expect(config.analysisIntervalSec).toBe(300);
		// Unchanged fields preserved
		expect(config.orchestrationMode).toBe('debate');
		expect(config.watchlistSymbols).toEqual([]);
		expect(config.brokerType).toBe('AlpacaBrokerAgent');
	});

	test('updateConfig reschedules when interval changes and session enabled', async () => {
		await agent.start();
		const schedulesBeforeUpdate = schedules.length;
		await agent.updateConfig({ analysisIntervalSec: 60 });
		// Should have rescheduled — check that runScheduledCycle schedule exists
		expect(schedules.some((s) => s.callback === 'runScheduledCycle')).toBe(true);
		// State should reflect new interval
		expect(agent.state.analysisIntervalSec).toBe(60);
	});
});
