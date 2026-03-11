import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestBrokerAgent } from '../harness/create-test-broker-agent';
import {
	_mockRequest,
	_mockGetAccount,
	_mockGetPositions,
	_mockGetClock,
	_mockGetPortfolioHistory,
} from '@repo/data-ops/providers/alpaca';

describe('AlpacaBrokerAgent core', () => {
	let agent: Awaited<ReturnType<typeof createTestBrokerAgent>>['agent'];
	let db: Awaited<ReturnType<typeof createTestBrokerAgent>>['db'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const harness = await createTestBrokerAgent();
		agent = harness.agent;
		db = harness.db;
	});

	// Test 52
	it('onStart creates order_log table', () => {
		const columns = db.pragma('table_info(order_log)') as { name: string }[];
		const names = columns.map((c) => c.name);
		expect(names).toContain('id');
		expect(names).toContain('client_order_id');
		expect(names).toContain('symbol');
		expect(names).toContain('side');
		expect(names).toContain('type');
		expect(names).toContain('qty');
		expect(names).toContain('notional');
		expect(names).toContain('status');
		expect(names).toContain('filled_qty');
		expect(names).toContain('filled_avg_price');
		expect(names).toContain('created_at');
		expect(names).toContain('updated_at');
	});

	// Test 53
	it('getAccount maps Alpaca response to BrokerAccount', async () => {
		vi.mocked(_mockGetAccount).mockResolvedValue({
			id: 'acc-1',
			currency: 'USD',
			cash: '50000',
			portfolio_value: '100000',
			buying_power: '75000',
			daytrade_count: 2,
			status: 'ACTIVE',
		});

		const account = await agent.getAccount();

		expect(account).toEqual({
			id: 'acc-1',
			currency: 'USD',
			cash: '50000',
			portfolioValue: '100000',
			buyingPower: '75000',
			daytradeCount: 2,
			status: 'ACTIVE',
		});
	});

	// Test 54
	it('getPositions maps array to BrokerPosition[]', async () => {
		vi.mocked(_mockGetPositions).mockResolvedValue([
			{
				symbol: 'AAPL',
				qty: '10',
				side: 'long',
				avg_entry_price: '150.00',
				current_price: '155.00',
				market_value: '1550.00',
				unrealized_pl: '50.00',
				unrealized_plpc: '0.0333',
			},
		]);

		const positions = await agent.getPositions();

		expect(positions).toEqual([
			{
				symbol: 'AAPL',
				qty: '10',
				side: 'long',
				avgEntryPrice: '150.00',
				currentPrice: '155.00',
				marketValue: '1550.00',
				unrealizedPl: '50.00',
				unrealizedPlPct: '0.0333',
			},
		]);
	});

	// Test 55
	it('getClock maps to MarketClock', async () => {
		vi.mocked(_mockGetClock).mockResolvedValue({
			is_open: true,
			next_open: '2026-03-12T13:30:00Z',
			next_close: '2026-03-11T20:00:00Z',
		});

		const clock = await agent.getClock();

		expect(clock).toEqual({
			isOpen: true,
			nextOpenAt: new Date('2026-03-12T13:30:00Z').getTime(),
			nextCloseAt: new Date('2026-03-11T20:00:00Z').getTime(),
		});
	});

	// Test 56
	it('getPortfolioHistory maps to PortfolioHistory', async () => {
		vi.mocked(_mockGetPortfolioHistory).mockResolvedValue({
			timestamp: [1710000000, 1710086400],
			equity: [100000, 100500],
			profit_loss: [0, 500],
			profit_loss_pct: [0, 0.005],
		});

		const history = await agent.getPortfolioHistory();

		expect(history).toEqual({
			timestamps: [1710000000, 1710086400],
			equity: [100000, 100500],
			profitLoss: [0, 500],
			profitLossPct: [0, 0.005],
		});
	});

	// Test 57
	it('placeOrder sends correct params, returns OrderResult', async () => {
		vi.mocked(_mockRequest).mockResolvedValue({
			id: 'order-1',
			client_order_id: 'co-1',
			status: 'accepted',
			symbol: 'AAPL',
			side: 'buy',
			qty: '10',
			filled_qty: '0',
			filled_avg_price: null,
			created_at: '2026-03-11T15:00:00Z',
		});

		const result = await agent.placeOrder({
			symbol: 'AAPL',
			side: 'buy',
			type: 'market',
			qty: 10,
			timeInForce: 'day',
		});

		expect(vi.mocked(_mockRequest)).toHaveBeenCalledWith('POST', '/v2/orders', {
			symbol: 'AAPL',
			side: 'buy',
			type: 'market',
			qty: '10',
			notional: undefined,
			limit_price: undefined,
			stop_price: undefined,
			time_in_force: 'day',
		});

		expect(result).toEqual({
			id: 'order-1',
			clientOrderId: 'co-1',
			status: 'accepted',
			symbol: 'AAPL',
			side: 'buy',
			qty: 10,
			filledQty: 0,
			filledAvgPrice: null,
			createdAt: new Date('2026-03-11T15:00:00Z').getTime(),
		});
	});

	// Test 58
	it('placeOrder logs order to order_log table', async () => {
		vi.mocked(_mockRequest).mockResolvedValue({
			id: 'order-2',
			client_order_id: 'co-2',
			status: 'filled',
			symbol: 'TSLA',
			side: 'sell',
			qty: '5',
			filled_qty: '5',
			filled_avg_price: '200.50',
			created_at: '2026-03-11T16:00:00Z',
		});

		await agent.placeOrder({
			symbol: 'TSLA',
			side: 'sell',
			type: 'limit',
			qty: 5,
			limitPrice: 200,
			timeInForce: 'gtc',
		});

		const rows = db.prepare('SELECT * FROM order_log').all() as Record<string, unknown>[];
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('order-2');
		expect(rows[0].client_order_id).toBe('co-2');
		expect(rows[0].symbol).toBe('TSLA');
		expect(rows[0].side).toBe('sell');
		expect(rows[0].type).toBe('limit');
		expect(rows[0].qty).toBe(5);
		expect(rows[0].status).toBe('filled');
		expect(rows[0].filled_qty).toBe(5);
		expect(rows[0].filled_avg_price).toBe(200.5);
	});

	// Test 59
	it('placeOrder handles null filled_avg_price', async () => {
		vi.mocked(_mockRequest).mockResolvedValue({
			id: 'order-3',
			client_order_id: 'co-3',
			status: 'accepted',
			symbol: 'GOOG',
			side: 'buy',
			qty: '1',
			filled_qty: '0',
			filled_avg_price: null,
			created_at: '2026-03-11T17:00:00Z',
		});

		const result = await agent.placeOrder({
			symbol: 'GOOG',
			side: 'buy',
			type: 'market',
			qty: 1,
			timeInForce: 'day',
		});

		expect(result.filledAvgPrice).toBeNull();
		expect(result.filledAvgPrice).not.toBeNaN();
	});

	// Test 60
	it('cancelOrder calls client with orderId', async () => {
		vi.mocked(_mockRequest).mockResolvedValue(undefined);

		await agent.cancelOrder('order-abc');

		expect(vi.mocked(_mockRequest)).toHaveBeenCalledWith('DELETE', '/v2/orders/order-abc');
	});

	// Test 61
	it('getOrderHistory reads from order_log DESC', async () => {
		const now = Date.now();
		db.prepare(
			`INSERT INTO order_log (id, client_order_id, symbol, side, type, qty, notional, status, filled_qty, filled_avg_price, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('o1', 'co1', 'AAPL', 'buy', 'market', 10, null, 'filled', 10, 150, now - 3000, now - 3000);

		db.prepare(
			`INSERT INTO order_log (id, client_order_id, symbol, side, type, qty, notional, status, filled_qty, filled_avg_price, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('o2', 'co2', 'AAPL', 'sell', 'limit', 5, null, 'filled', 5, 160, now - 2000, now - 2000);

		db.prepare(
			`INSERT INTO order_log (id, client_order_id, symbol, side, type, qty, notional, status, filled_qty, filled_avg_price, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run('o3', 'co3', 'AAPL', 'buy', 'market', 3, null, 'accepted', 0, null, now - 1000, now - 1000);

		const history = await agent.getOrderHistory('AAPL');

		expect(history).toHaveLength(3);
		expect(history[0].id).toBe('o3');
		expect(history[1].id).toBe('o2');
		expect(history[2].id).toBe('o1');
	});
});
