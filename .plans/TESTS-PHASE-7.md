# Phase 7: AlpacaBrokerAgent Tests

## Goal
Test AlpacaBrokerAgent (186 LOC) — broker account, positions, order placement, order history, and error handling. Design doc 024.

## Status: DONE

## Failure Triage Protocol

When a test fails, do NOT assume the test is wrong. Follow this order:

1. **Harness/mock bug** — Is the test setup incorrect? Wrong mock return value, missing table, wrong field name in the harness? Fix the test infrastructure.
2. **Implementation bug** — Does the agent code deviate from the design doc spec? Read the design doc and compare to the implementation. If the code is wrong, fix the code to match the spec and note the fix in the design doc.
3. **Design doc gap** — Is the spec ambiguous or missing a case? Ask the user, then update the spec.

**Design doc**: `docs/design-docs/done/024/` (024-1-spec.md through 024-6-ops.md)
**Agent source**: `src/agents/alpaca-broker-agent.ts`

Always read the relevant design doc section before concluding a test is wrong. The tests are spec-driven — they verify documented behavior.

## Prerequisites
- Phase 1-6 infrastructure (setup.ts, sql-template, fixtures)
- New mocks in setup.ts for `@repo/data-ops/providers/alpaca`

## Setup Changes

### 1. Add mock to `test/setup.ts`

```ts
vi.mock('@repo/data-ops/providers/alpaca', () => {
	const mockRequest = vi.fn();
	const MockAlpacaClient = vi.fn().mockImplementation(() => ({ request: mockRequest }));
	const mockGetAccount = vi.fn();
	const mockGetPositions = vi.fn();
	const mockGetClock = vi.fn();
	const mockGetPortfolioHistory = vi.fn();
	const MockAlpacaTradingProvider = vi.fn().mockImplementation(() => ({
		getAccount: mockGetAccount,
		getPositions: mockGetPositions,
		getClock: mockGetClock,
		getPortfolioHistory: mockGetPortfolioHistory,
	}));
	return {
		AlpacaClient: MockAlpacaClient,
		AlpacaTradingProvider: MockAlpacaTradingProvider,
		_mockRequest: mockRequest,
		_mockGetAccount: mockGetAccount,
		_mockGetPositions: mockGetPositions,
		_mockGetClock: mockGetClock,
		_mockGetPortfolioHistory: mockGetPortfolioHistory,
	};
});
```

### 2. Create `test/harness/create-test-broker-agent.ts`

Factory function pattern matching create-test-agent.ts:
- `Object.create(AlpacaBrokerAgent.prototype)`
- In-memory SQLite + `createSqlTag`
- Set `name = 'test-user-123'`
- Set `env` with `CREDENTIALS_ENCRYPTION_KEY: 'test-key'`
- Wire `state`/`setState` with history tracking
- Call `agent.onStart()` to create tables
- Return `{ agent, db, stateHistory }`

Key difference from SessionAgent harness: no schedules, no broadcasts, no mocks for other agents. The broker agent only needs `getCredential` (already mocked globally) and `AlpacaClient`/`AlpacaTradingProvider` (mocked above).

### 3. Create test files

```
test/agents/
├── broker-core.test.ts       # Tests 52-61
└── broker-errors.test.ts     # Tests 62-63
```

## Tests

### broker-core.test.ts

| # | Test | What to verify | Source lines |
|---|------|----------------|-------------|
| 52 | `onStart creates order_log table` | `PRAGMA table_info(order_log)` returns columns | 25-54 |
| 53 | `getAccount maps Alpaca response to BrokerAccount` | Mock provider.getAccount returns `{ id, currency, cash, portfolio_value, buying_power, daytrade_count, status }` → verify mapped fields `{ id, currency, cash, portfolioValue, buyingPower, daytradeCount, status }` | 56-68 |
| 54 | `getPositions maps array to BrokerPosition[]` | Mock provider.getPositions returns array with `{ symbol, qty, side, avg_entry_price, current_price, market_value, unrealized_pl, unrealized_plpc }` → verify mapped fields | 70-83 |
| 55 | `getClock maps to MarketClock` | Mock provider.getClock returns `{ is_open, next_open, next_close }` → verify `{ isOpen, nextOpenAt, nextCloseAt }` as timestamps | 147-155 |
| 56 | `getPortfolioHistory maps to PortfolioHistory` | Mock provider.getPortfolioHistory returns `{ timestamp, equity, profit_loss, profit_loss_pct }` → verify mapped fields `{ timestamps, equity, profitLoss, profitLossPct }` | 136-145 |
| 57 | `placeOrder sends correct params, returns OrderResult` | Mock client.request for POST /v2/orders → verify params sent, response mapped to OrderResult | 85-129 |
| 58 | `placeOrder logs order to order_log table` | After placeOrder, query SQLite `SELECT * FROM order_log` → verify row with all fields | 122-126 |
| 59 | `placeOrder handles null filled_avg_price` | Mock response with `filled_avg_price: null` → verify `result.filledAvgPrice` is `null` not `NaN` | 116-117 |
| 60 | `cancelOrder calls client with orderId` | Mock client.request → verify called with `DELETE /v2/orders/{id}` | 131-134 |
| 61 | `getOrderHistory reads from order_log DESC` | Insert 3 orders with different created_at → verify returned in DESC order | 157-165 |

### broker-errors.test.ts

| # | Test | What to verify | Source lines |
|---|------|----------------|-------------|
| 62 | `getAccount throws when credentials missing` | Mock `getCredential` returning `null` → verify throws 'Alpaca credentials not configured' | 171-177 |
| 63 | `placeOrder propagates API error` | Mock `client.request` rejecting → verify error bubbles up | 87-106 |

## Mocking Strategy

- `vi.mock('@repo/data-ops/providers/alpaca')` at setup level provides mock constructors
- In each test's `beforeEach`, access the mock instances via `vi.mocked()`:
  ```ts
  const { AlpacaClient, AlpacaTradingProvider } = await import('@repo/data-ops/providers/alpaca');
  const mockClient = { request: vi.fn() };
  vi.mocked(AlpacaClient).mockImplementation(() => mockClient as any);
  ```
- Real SQLite for order_log table verification
- `getCredential` already mocked globally; override per-test for error cases

## Key Source References
- Agent: `src/agents/alpaca-broker-agent.ts` (186 LOC)
- Types: `packages/data-ops/src/agents/broker/types.ts`
- Provider: `packages/data-ops/src/providers/alpaca/`

## Verification
```bash
pnpm run test --filter data-service -- test/agents/broker-core.test.ts test/agents/broker-errors.test.ts
```
All 12 tests pass.
