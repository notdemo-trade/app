import { vi } from 'vitest';

export function createMockDebateOrchestrator(overrides?: Record<string, unknown>) {
	return {
		runDebate: vi.fn().mockResolvedValue({
			consensus: {
				action: 'buy',
				confidence: 0.85,
				rationale: 'test',
				positionSizePct: 5,
				entryPrice: 150,
				targetPrice: 165,
				stopLoss: 142,
				risks: [],
			},
			session: { id: 'debate-session-001', status: 'completed' },
		}),
		recordPersonaOutcome: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

export function createMockPipelineOrchestrator(overrides?: Record<string, unknown>) {
	return {
		runPipeline: vi.fn().mockResolvedValue({
			proposal: null,
			session: { id: 'pipeline-session-001', status: 'completed' },
		}),
		recordStepOutcome: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}
