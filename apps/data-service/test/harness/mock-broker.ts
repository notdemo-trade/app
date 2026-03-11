import { vi } from 'vitest';

export function createMockBroker(overrides?: Record<string, unknown>) {
	return {
		getAccount: vi.fn().mockResolvedValue({
			cash: 100_000,
			portfolioValue: 100_000,
			buyingPower: 200_000,
		}),
		getPositions: vi.fn().mockResolvedValue([]),
		getClock: vi.fn().mockResolvedValue({ isOpen: true }),
		getPortfolioHistory: vi.fn().mockResolvedValue({ profitLossPct: [0] }),
		placeOrder: vi.fn().mockResolvedValue({
			id: 'order-001',
			filledQty: 10,
			filledAvgPrice: 150.0,
		}),
		getOrderHistory: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}
