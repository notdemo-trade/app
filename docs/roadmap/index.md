# Roadmap

Future phases. Full design docs in each subfolder. Implementation order by tier.

## Trading Tier

After MVP ships. Adds trade execution to the orchestrator recommendation flow.

| Order | Phase | Summary |
|-------|-------|---------|
| 4 | [008: Order Execution](./008/index.md) | Alpaca trading (stocks, crypto, options). Order UI, position close, cancellation |
| 5 | [009: Risk Management](./009/index.md) | Policy engine pre-execution. Kill switch, daily loss limits, position size limits |
| 6 | [010: Approval Flow](./010/index.md) | HITL trade approval w/ TTL tokens. Pending UI, auto-approve mode |
| 7 | [011: Telegram Approvals](./011/index.md) | Mobile approvals via Telegram bot. Inline buttons, timeout auto-reject |

## Data Expansion Tier

Plug into existing orchestrator. Deploy DOs + enable entitlements.

| Order | Phase | Summary |
|-------|-------|---------|
| 8 | [004: Signal Gathering Agents](./004/index.md) | StockTwits, Twitter, SEC, FRED agents. Shared PG signal storage |
| 9 | [007: Strategy Templates](./007/index.md) | Prompt-based strategy customization. Conservative/Moderate/Aggressive, fork/share |

## Polish Tier

| Order | Phase | Summary |
|-------|-------|---------|
| 10 | [013: Trade Journal](./013/index.md) | Trade outcome tracking, auto-journal on close, win rate / avg P&L metrics |
| 11 | [014: Platform Stats](./014/index.md) | Public aggregate stats (users, trades, volume). Hourly cron, user opt-out |
| 12 | [015: Anonymous Leaderboard](./015/index.md) | Rankings w/ composite scoring (ROI, Sharpe, drawdown). Anonymous aliases |
| 13 | [016: Notifications](./016/index.md) | Telegram push alerts for executions, stop losses, errors, daily summaries |
| 14 | [017: Dashboard Refinement](./017/index.md) | Unified UX: sidebar nav, error handling, loading/empty states |
| 15 | [018: Production Launch](./018/index.md) | Security audit, rate limiting, production domain, monitoring, DB backups |
