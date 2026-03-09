# Phase 29: Risk Management Config Enforcement — Part 3: Logic

## Pre-Analysis Guards

All pre-analysis guards are added to `triggerAnalysis()` in `SessionAgent`. They execute before the watchlist iteration loop, short-circuiting the entire analysis cycle when global conditions are not met.

### Updated `triggerAnalysis()` Method

```ts
@callable()
async triggerAnalysis(): Promise<{ threadIds: string[] }> {
  this.setState({ ...this.state, lastError: null });
  const effectiveConfig = await this.loadEffectiveConfig();

  // --- G1: Market hours gate ---
  if (effectiveConfig.tradingHoursOnly) {
    const marketOpen = await this.isMarketOpen();
    if (!marketOpen) {
      console.log('[triggerAnalysis] Skipped: market is closed and tradingHoursOnly is enabled');
      return { threadIds: [] };
    }
  }

  // --- G4: Daily loss circuit breaker ---
  const dailyLossTriggered = await this.isDailyLossBreached(effectiveConfig.maxDailyLossPct);
  if (dailyLossTriggered) {
    console.log(
      `[triggerAnalysis] Skipped: daily loss exceeds ${(effectiveConfig.maxDailyLossPct * 100).toFixed(1)}% limit`,
    );
    return { threadIds: [] };
  }

  // --- G5: Cooldown after loss ---
  if (effectiveConfig.cooldownMinutesAfterLoss > 0) {
    const cooldownActive = this.isCooldownActive(effectiveConfig.cooldownMinutesAfterLoss);
    if (cooldownActive) {
      console.log(
        `[triggerAnalysis] Skipped: cooldown active (${effectiveConfig.cooldownMinutesAfterLoss} min after loss)`,
      );
      return { threadIds: [] };
    }
  }

  // --- G2 + G3: Ticker filtering ---
  const symbols = this.filterWatchlist(
    effectiveConfig.watchlistSymbols,
    effectiveConfig.tickerBlacklist,
    effectiveConfig.tickerAllowlist,
  );

  if (symbols.length === 0) {
    console.log('[triggerAnalysis] Skipped: no symbols remaining after filtering');
    return { threadIds: [] };
  }

  const portfolioContext = await this.assemblePortfolioContext();
  const threadIds: string[] = [];
  for (const symbol of symbols) {
    const result = await this.runAnalysisForSymbol(symbol, effectiveConfig, portfolioContext);
    if (result.threadId) {
      threadIds.push(result.threadId);
    }
  }
  this.setState({
    ...this.state,
    lastCycleAt: Date.now(),
    cycleCount: this.state.cycleCount + 1,
  });

  if (this.state.enabled) {
    await this.rescheduleAnalysisCycle(effectiveConfig.analysisIntervalSec);
  }

  return { threadIds };
}
```

### Guard Ordering Rationale

The guards execute in this order for a reason:

1. **Market hours (G1)** first -- cheapest check after the config load. One broker RPC call (`getClock()`). If the market is closed, there is no point checking anything else.
2. **Daily loss (G4)** second -- one broker RPC call (`getPortfolioHistory()`). If the daily loss limit is breached, no analysis should run regardless of symbols.
3. **Cooldown (G5)** third -- pure DO SQLite query, no broker call. If we recently took a loss, pause everything.
4. **Ticker filtering (G2 + G3)** last -- in-memory array filtering, zero cost. Applied to the watchlist before iteration.

This ordering minimizes unnecessary broker API calls. If the market is closed, we never call `getPortfolioHistory()`. If the daily loss is breached, we never query the cooldown.

---

## Pre-Analysis Helper Methods

### `isMarketOpen()`

```ts
private async isMarketOpen(): Promise<boolean> {
  try {
    const userId = this.name;
    const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
      this.env.AlpacaBrokerAgent,
      userId,
    );
    const clock = await broker.getClock();
    return clock.isOpen;
  } catch (err) {
    // If we cannot determine market status, allow analysis to proceed
    console.error('[isMarketOpen] Failed to check market clock:', err);
    return true;
  }
}
```

**Fail-open rationale**: If the broker API is unreachable, returning `true` allows analysis to proceed. The alternative (fail-closed) would silently block all analysis during broker outages. Since the market hours check is an optimization (saving LLM credits), not a safety-critical guard, fail-open is appropriate.

### `isDailyLossBreached(maxDailyLossPct)`

```ts
private async isDailyLossBreached(maxDailyLossPct: number): Promise<boolean> {
  try {
    const userId = this.name;
    const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
      this.env.AlpacaBrokerAgent,
      userId,
    );
    const history = await broker.getPortfolioHistory();
    const todayLossPct = history.profitLossPct[history.profitLossPct.length - 1] ?? 0;
    // profitLossPct is negative for losses; maxDailyLossPct is positive (e.g., 0.02 = 2%)
    return todayLossPct < -maxDailyLossPct;
  } catch (err) {
    // If we cannot determine daily P&L, allow analysis to proceed
    console.error('[isDailyLossBreached] Failed to check portfolio history:', err);
    return false;
  }
}
```

**Sign convention**: `PortfolioHistory.profitLossPct` uses negative values for losses (e.g., `-0.015` = -1.5% loss). `EffectiveConfig.maxDailyLossPct` is a positive number (e.g., `0.02` = 2%). The comparison is `todayLossPct < -maxDailyLossPct`, meaning a 1.5% loss does NOT trigger the 2% breaker, but a 2.5% loss DOES.

**Fail-open rationale**: Same as market hours. The daily loss check is a circuit breaker, but if we cannot read portfolio history, we should not silently halt all trading activity.

### `isCooldownActive(cooldownMinutes)`

```ts
private isCooldownActive(cooldownMinutes: number): boolean {
  const rows = this.sql<{ resolved_at: number }>`
    SELECT resolved_at FROM proposal_outcomes
    WHERE status = 'resolved' AND realized_pnl < 0
    ORDER BY resolved_at DESC LIMIT 1`;

  const lastLoss = rows[0];
  if (!lastLoss?.resolved_at) return false;

  const cooldownMs = cooldownMinutes * 60 * 1000;
  return (Date.now() - lastLoss.resolved_at) < cooldownMs;
}
```

**Note**: This is a synchronous DO SQLite query (no `await`), consistent with other `this.sql` calls in `SessionAgent`. The query reads from the existing `proposal_outcomes` table populated by `createOutcomeTracking()` and resolved by `resolveOutcome()`.

**Edge case**: If no trades have ever been resolved (`rows` is empty), the cooldown is not active. If `cooldownMinutesAfterLoss` is `0`, the guard is skipped entirely (see the `> 0` check in `triggerAnalysis()`).

### `filterWatchlist(symbols, blacklist, allowlist)`

```ts
private filterWatchlist(
  symbols: string[],
  blacklist: string[],
  allowlist: string[] | null,
): string[] {
  const blacklistSet = new Set(blacklist.map((s) => s.toUpperCase()));

  return symbols.filter((symbol) => {
    const upper = symbol.toUpperCase();

    // G2: Blacklist takes priority
    if (blacklistSet.has(upper)) {
      console.log(`[filterWatchlist] Skipping ${symbol}: blacklisted`);
      return false;
    }

    // G3: Allowlist (if set, only allow symbols in the list)
    if (allowlist && !allowlist.map((s) => s.toUpperCase()).includes(upper)) {
      console.log(`[filterWatchlist] Skipping ${symbol}: not in allowlist`);
      return false;
    }

    return true;
  });
}
```

**Blacklist priority**: If a symbol appears in both the blacklist and allowlist, the blacklist wins. This is the safer default -- explicitly blocking a symbol should override any inclusion.

**Case handling**: Both `tickerBlacklist` and `tickerAllowlist` are uppercased by the Zod schema (`z.string().toUpperCase()`), but the watchlist symbols from `session_config` may have mixed case. The filter normalizes both sides.

---

## Pre-Execution Guards

All pre-execution guards are added to `handleTradeDecision()` after the proposal is approved but before the order is placed.

### Updated `handleTradeDecision()` Method

```ts
private async handleTradeDecision(
  proposalId: string,
  approved: boolean,
): Promise<{ status: string; message: string }> {
  const rows = this.sql<ProposalRow>`SELECT * FROM trade_proposals WHERE id = ${proposalId}`;
  const row = rows[0];
  if (!row) return { status: 'error', message: 'Proposal not found' };

  const proposal = rowToProposal(row);
  if (proposal.status !== 'pending') {
    return { status: 'error', message: `Proposal already ${proposal.status}` };
  }
  if (proposal.expiresAt < Date.now()) {
    this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()}
      WHERE id = ${proposalId}`;
    return { status: 'expired', message: 'Proposal has expired' };
  }

  const decidedAt = Date.now();
  if (!approved) {
    this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${decidedAt}
      WHERE id = ${proposalId}`;
    return { status: 'rejected', message: 'Trade rejected by user' };
  }

  this.sql`UPDATE trade_proposals SET status = 'approved', decided_at = ${decidedAt}
    WHERE id = ${proposalId}`;

  try {
    const userId = this.name;
    const effectiveConfig = await this.loadEffectiveConfig();
    const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
      this.env.AlpacaBrokerAgent,
      userId,
    );

    // --- Compute notional ---
    const qty = proposal.qty ?? undefined;
    let notional = proposal.notional ?? undefined;

    if (!qty && !notional && proposal.positionSizePct) {
      const account = await broker.getAccount();
      notional = Math.round(account.cash * (proposal.positionSizePct / 100) * 100) / 100;
    }

    // --- E4: Short selling block ---
    if (proposal.action === 'sell' && !effectiveConfig.allowShortSelling) {
      const positions = await broker.getPositions();
      const hasPosition = positions.some((p) => p.symbol === proposal.symbol && p.qty > 0);
      if (!hasPosition) {
        this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${Date.now()}
          WHERE id = ${proposalId}`;
        return {
          status: 'error',
          message: `Short selling is disabled. No ${proposal.symbol} position held.`,
        };
      }
    }

    // --- E3: Max positions (buy orders only) ---
    if (proposal.action === 'buy') {
      const positions = await broker.getPositions();
      if (positions.length >= effectiveConfig.maxPositions) {
        this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${Date.now()}
          WHERE id = ${proposalId}`;
        return {
          status: 'error',
          message: `Maximum ${effectiveConfig.maxPositions} positions reached. Close a position first.`,
        };
      }
    }

    // --- E1: Max notional per trade ---
    if (notional && notional > effectiveConfig.maxNotionalPerTrade) {
      this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${Date.now()}
        WHERE id = ${proposalId}`;
      return {
        status: 'error',
        message: `Trade notional $${notional.toFixed(2)} exceeds max $${effectiveConfig.maxNotionalPerTrade} per trade.`,
      };
    }

    // --- E2: Max position value ---
    if (notional && notional > effectiveConfig.maxPositionValue) {
      this.sql`UPDATE trade_proposals SET status = 'rejected', decided_at = ${Date.now()}
        WHERE id = ${proposalId}`;
      return {
        status: 'error',
        message: `Position value $${notional.toFixed(2)} exceeds max $${effectiveConfig.maxPositionValue} per position.`,
      };
    }

    const orderResult = await broker.placeOrder({
      symbol: proposal.symbol,
      side: proposal.action,
      type: 'market',
      timeInForce: 'day',
      qty,
      notional,
    });

    this.sql`UPDATE trade_proposals SET status = 'executed' WHERE id = ${proposalId}`;
    this.createOutcomeTracking(proposal, orderResult);
    return {
      status: 'executed',
      message: `Trade executed: ${proposal.action} ${proposal.symbol}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: `Execution failed: ${message}` };
  }
}
```

### Guard Ordering Rationale (Execution)

1. **Short selling block (E4)** first -- cheapest conceptual check. For sell orders, we need positions anyway. If short selling is disabled and there is no position, reject immediately.
2. **Max positions (E3)** second -- for buy orders, check position count before checking dollar amounts.
3. **Max notional per trade (E1)** third -- dollar-amount check against the computed notional.
4. **Max position value (E2)** fourth -- second dollar-amount check. Conceptually distinct from E1: `maxNotionalPerTrade` limits any single order; `maxPositionValue` limits the total value in one position. For new positions, these checks overlap. For adding to existing positions, E2 would need to consider the existing position value (addressed in implementation notes below).

### Proposal Status on Enforcement Rejection

When an enforcement guard rejects a trade, the proposal status is set to `'rejected'` with `decided_at` timestamp. This is consistent with user-initiated rejections and keeps the proposal lifecycle simple. The error message in the return value distinguishes enforcement rejections from user rejections.

---

## Proposal-Level Enhancement: `createProposal()`

### Updated `createProposal()` Method

```ts
private async createProposal(
  threadId: string,
  symbol: string,
  consensus: {
    action: string;
    confidence: number;
    rationale: string;
    entryPrice: number | null;
    targetPrice: number | null;
    stopLoss: number | null;
    positionSizePct: number | null;
    risks: string[];
  },
  config: EffectiveConfig,
): Promise<void> {
  if (consensus.action === 'hold') return;

  const warnings: string[] = [];

  // --- P1: Block sell proposals for unheld symbols when short selling is disabled ---
  if (consensus.action === 'sell' && !config.allowShortSelling) {
    try {
      const userId = this.name;
      const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
        this.env.AlpacaBrokerAgent,
        userId,
      );
      const positions = await broker.getPositions();
      const hasPosition = positions.some((p) => p.symbol === symbol && p.qty > 0);
      if (!hasPosition) {
        // Block proposal creation entirely -- do not store a misleading sell proposal
        console.log(
          `[createProposal] Blocked sell proposal for ${symbol}: short selling disabled and no position held`,
        );
        return;
      }
    } catch {
      warnings.push('Could not verify portfolio positions — broker check failed');
      // Allow proposal creation when broker is unreachable (fail-open at proposal level;
      // execution-level guard E4 will catch it if the user approves)
    }
  }

  const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    threadId,
    symbol,
    action: consensus.action as 'buy' | 'sell',
    confidence: consensus.confidence,
    rationale: consensus.rationale,
    entryPrice: consensus.entryPrice,
    targetPrice: consensus.targetPrice,
    stopLoss: consensus.stopLoss,
    qty: null,
    notional: null,
    positionSizePct: consensus.positionSizePct ?? config.positionSizePctOfCash,
    risks: consensus.risks,
    warnings,
    expiresAt: Date.now() + config.proposalTimeoutSec * 1000,
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    orderId: null,
    filledQty: null,
    filledAvgPrice: null,
    outcomeStatus: 'none',
  };

  this.storeProposal(proposal);
  this.sql`UPDATE discussion_threads SET proposal_id = ${proposal.id} WHERE id = ${threadId}`;
}
```

### Key Change from Current Behavior

**Before**: Sell proposals for unheld symbols with `allowShortSelling: false` were created with a warning. Users would see the proposal, potentially approve it, and the order would go to the broker.

**After**: Sell proposals for unheld symbols with `allowShortSelling: false` are not created at all. The `createProposal()` method returns early. The discussion thread will show the analysis and consensus but no actionable proposal. If the broker check fails, the proposal is created with a warning (fail-open), and the execution guard (E4) provides a second layer of defense.

---

## Implementation Notes

### Broker `getPositions()` Call Optimization

Both the short-selling check (E4) and the max-positions check (E3) call `broker.getPositions()`. In the current implementation, these are separate calls. Since the method is called on the same `AlpacaBrokerAgent` Durable Object instance, the second call is fast (cached within the same request lifecycle in most broker implementations). However, for clarity and to avoid redundant RPC calls, the implementation should fetch positions once and reuse:

```ts
// Optimization: fetch positions once for all checks that need them
let positions: BrokerPosition[] | null = null;

const getPositionsOnce = async () => {
  if (!positions) {
    positions = await broker.getPositions();
  }
  return positions;
};

// E4: Short selling
if (proposal.action === 'sell' && !effectiveConfig.allowShortSelling) {
  const pos = await getPositionsOnce();
  // ...
}

// E3: Max positions
if (proposal.action === 'buy') {
  const pos = await getPositionsOnce();
  // ...
}
```

### `maxPositionValue` vs. Existing Position

For the initial implementation, E2 (`maxPositionValue`) compares the order's notional against the configured limit. This covers new positions correctly. However, if a user already holds $3,000 of AAPL and the limit is $5,000, a $3,000 add-on buy would create a $6,000 total position but pass the per-trade check.

**Future enhancement** (not in this phase): Check `existingPositionValue + notional <= maxPositionValue` by looking up the symbol in the current positions. This requires knowing which positions map to which orders, which is more complex for partial fills.

### Error Message Format

All enforcement error messages follow a consistent pattern:

```
{What happened}. {What the limit is}.
```

Examples:
- `Trade notional $7500.00 exceeds max $5000 per trade.`
- `Maximum 3 positions reached. Close a position first.`
- `Short selling is disabled. No AAPL position held.`
- `Position value $6000.00 exceeds max $5000 per position.`

---

## Error Handling

### Fail-Open vs. Fail-Closed

| Guard | Failure Mode | Rationale |
|-------|-------------|-----------|
| G1: Market hours | Fail-open (allow analysis) | Market hours is an optimization, not safety |
| G4: Daily loss | Fail-open (allow analysis) | Broker outage should not halt all trading |
| G5: Cooldown | No external dependency (DO SQLite) | Cannot fail |
| G2/G3: Ticker filter | No external dependency (in-memory) | Cannot fail |
| E1-E2: Notional checks | No external dependency (local math) | Cannot fail |
| E3: Max positions | Fail-closed (reject trade) | If we cannot verify positions, do not open a new one |
| E4: Short selling | Fail-closed (reject trade) | If we cannot verify positions, do not sell |

**Rationale split**: Pre-analysis guards are fail-open because blocking analysis is low-risk (no money moves). Pre-execution guards for position-dependent checks are fail-closed because placing an order without position verification risks real financial harm.

Exception: In `createProposal()`, the P1 short-selling check is fail-open (creates proposal with warning). This is acceptable because the execution guard E4 provides the hard block.
