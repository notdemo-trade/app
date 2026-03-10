# Roadmap

Future phases. Full design docs in each subfolder. Implementation order by tier.

> **Note:** All specs below reference pre-020 monolithic architecture. Review and update to SRP agent patterns (Phase 020) before implementing.

## Data Expansion Tier

Plug into existing multi-agent system. Deploy new agent DOs + enable entitlements.

| Order | Phase | Summary |
|-------|-------|---------|
| 1 | [004: Signal Gathering Agents](./004/index.md) | StockTwits, Twitter, SEC, FRED agents. Shared PG signal storage |

## Polish Tier

| Order | Phase | Summary |
|-------|-------|---------|
| 2 | [013: Trade Journal](./013/index.md) | Trade outcome tracking, auto-journal on close, win rate / avg P&L metrics |
| 3 | [014: Platform Stats](./014/index.md) | Public aggregate stats (users, trades, volume). Hourly cron, user opt-out |
| 4 | [015: Anonymous Leaderboard](./015/index.md) | Rankings w/ composite scoring (ROI, Sharpe, drawdown). Anonymous aliases |
| 5 | [016: Notifications](./016/index.md) | Telegram push alerts for executions, stop losses, errors, daily summaries |
| 6 | [017: Dashboard Refinement](./017/index.md) | Unified UX: sidebar nav, error handling, loading/empty states |
| 7 | [018: Production Launch](./018/index.md) | Security audit, rate limiting, production domain, monitoring, DB backups |
