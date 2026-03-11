import { describe, it, expect, vi } from 'vitest';
import { getBarsForSymbol } from '@repo/data-ops/market-data-bars';
import { createTestPipelineAgent } from '../harness/create-test-pipeline-agent';
import { sampleBars, sampleStrategy } from '../harness/fixtures';
import type { RunPipelineParams } from '@/agents/pipeline-orchestrator-agent';

const mockedGetBars = vi.mocked(getBarsForSymbol);

function makeRunPipelineParams(overrides?: Partial<RunPipelineParams>): RunPipelineParams {
	return {
		symbol: 'AAPL',
		strategyId: 'moderate',
		strategy: sampleStrategy,
		onMessage: vi.fn(),
		threadId: 'thread-001',
		...overrides,
	};
}

describe('PipelineOrchestratorAgent — proposal building (tests 154-156)', () => {
	beforeEach(() => {
		mockedGetBars.mockResolvedValue(sampleBars);
	});

	// Test 154
	it('buildProposal uses adjustedPositionSize when set', async () => {
		const { agent } = await createTestPipelineAgent({
			llm: {
				validateRisk: vi.fn().mockResolvedValue({
					approved: true, adjustedPositionSize: 3,
					warnings: [], rationale: 'Risk approved',
				}),
			},
		});
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.proposal).not.toBeNull();
		expect(result.proposal!.positionSizePct).toBe(3);
	});

	// Test 155
	it('buildProposal normalizes positionSizePct (fraction → whole number)', async () => {
		const { agent } = await createTestPipelineAgent({
			llm: {
				validateRisk: vi.fn().mockResolvedValue({
					approved: true, adjustedPositionSize: 0.05,
					warnings: [], rationale: 'Risk approved',
				}),
			},
		});
		const params = makeRunPipelineParams();
		const result = await agent.runPipeline(params);

		expect(result.proposal).not.toBeNull();
		expect(result.proposal!.positionSizePct).toBe(5);
	});

	// Test 156
	it('buildProposal sets expiresAt from proposalTimeoutSec', async () => {
		const { agent } = await createTestPipelineAgent();
		const now = Date.now();
		const params = makeRunPipelineParams({ proposalTimeoutSec: 600 });
		const result = await agent.runPipeline(params);

		expect(result.proposal).not.toBeNull();
		// expiresAt should be approximately now + 600*1000
		const diff = result.proposal!.expiresAt - now;
		expect(diff).toBeGreaterThanOrEqual(590_000);
		expect(diff).toBeLessThanOrEqual(610_000);
	});
});
