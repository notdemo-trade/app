import { vi } from 'vitest';

export function createMockComplete(overrides?: Record<string, unknown>) {
	return vi.fn().mockResolvedValue({
		content: JSON.stringify({
			action: 'buy', confidence: 0.8, rationale: 'test',
			entry_price: 150, target_price: 165, stop_loss: 142,
			position_size_pct: 5, timeframe: 'swing', risks: [],
			...overrides,
		}),
		usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
	});
}

export function createMalformedComplete() {
	return vi.fn().mockResolvedValue({
		content: 'not valid json {{{',
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
	});
}
