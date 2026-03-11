import { beforeEach, describe, expect, test } from 'vitest';
import type { SessionAgent } from '@/agents/session-agent';
import { createTestAgent } from '../harness/create-test-agent';
import { insertExecutedProposalWithOutcome } from '../harness/test-helpers';
import { clearMockRegistry, registerMockAgent } from '../setup';

describe('SessionAgent reset', () => {
	let agent: SessionAgent;

	beforeEach(async () => {
		clearMockRegistry();
		const result = await createTestAgent();
		agent = result.agent;
		registerMockAgent(agent.env.AlpacaBrokerAgent, result.mocks.broker);
	});

	test('resetData fails when session enabled', async () => {
		await agent.start();

		const result = await agent.resetData();
		expect(result.status).toBe('error');
		expect(result.message).toContain('must be stopped');
	});

	test('resetData clears all data and returns counts', async () => {
		// Insert test data
		insertExecutedProposalWithOutcome(agent, { symbol: 'AAPL' });

		// Add a snapshot for the outcome
		const outcomes = agent.getOutcomes('tracking');
		if (outcomes[0]) {
			agent.sql`INSERT INTO outcome_snapshots (id, outcome_id, unrealized_pnl, unrealized_pnl_pct, current_price, snapshot_at)
				VALUES (${crypto.randomUUID()}, ${outcomes[0].id}, 10, 0.5, 155, ${Date.now()})`;
		}

		const result = await agent.resetData();
		expect(result.status).toBe('success');
		expect(result.cleared.threads).toBeGreaterThanOrEqual(1);
		expect(result.cleared.proposals).toBeGreaterThanOrEqual(1);
		expect(result.cleared.outcomes).toBeGreaterThanOrEqual(1);

		// Verify data is actually cleared
		expect(agent.getThreads()).toHaveLength(0);
		expect(agent.getProposals()).toHaveLength(0);
		expect(agent.getOutcomes()).toHaveLength(0);
	});

	test('resetData reseeds strategies after clearing', async () => {
		// Insert and then reset
		insertExecutedProposalWithOutcome(agent);

		const result = await agent.resetData();
		expect(result.status).toBe('success');

		// Verify strategies were re-seeded by checking that getConfig still returns valid config
		// (getActiveStrategy would fail if strategies table was empty)
		const config = agent.getConfig();
		expect(config.activeStrategyId).toBe('moderate');
	});
});
