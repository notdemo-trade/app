import { vi } from 'vitest';
import type { PersonaConfig } from '@repo/data-ops/agents/debate/types';

export function createMockLLMAgent(overrides?: Record<string, unknown>) {
	return {
		analyzeAsPersona: vi.fn().mockImplementation(async (persona: PersonaConfig) => ({
			personaId: persona.id,
			action: 'buy',
			confidence: 0.8,
			rationale: `${persona.name} analysis`,
			keyPoints: ['point 1', 'point 2'],
		})),
		runDebateRound: vi.fn().mockImplementation(
			async (_session: unknown, roundNumber: number, personas: PersonaConfig[]) => ({
				roundNumber,
				responses: personas.map((p) => ({
					personaId: p.id,
					respondingTo: personas.filter((o) => o.id !== p.id).map((o) => o.id),
					content: `${p.name} debate response`,
					revisedConfidence: 0.75,
					revisedAction: 'buy',
				})),
			}),
		),
		synthesizeConsensus: vi.fn().mockResolvedValue({
			action: 'buy', confidence: 0.85, rationale: 'Consensus rationale',
			dissent: null, entryPrice: 150, targetPrice: 165, stopLoss: 142,
			positionSizePct: 5, risks: [],
		}),
		validateRisk: vi.fn().mockResolvedValue({
			approved: true, adjustedPositionSize: null,
			warnings: [], rationale: 'Risk approved',
		}),
		analyze: vi.fn().mockResolvedValue({
			id: 'analysis-001', userId: 'test-user-123', symbol: 'AAPL',
			timestamp: new Date().toISOString(),
			recommendation: {
				action: 'buy', confidence: 0.8, rationale: 'test',
				entry_price: 150, target_price: 165, stop_loss: 142,
				position_size_pct: 5, timeframe: 'swing', risks: [],
			},
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.005 },
			model: 'gpt-4o', provider: 'openai',
		}),
		...overrides,
	};
}
