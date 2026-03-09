# Roadmap

Future phases. Full design docs in each subfolder. Implementation order by tier.

## Completed (implemented differently than originally planned)

These phases were superseded by the SRP multi-agent refactor (Phase 020+). The original specs below reference the pre-020 monolithic architecture and are outdated — kept for historical reference only.

| Phase | Summary | Implemented By |
|-------|---------|----------------|
| [008: Order Execution](./008/index.md) | Alpaca trading, order UI, position close, cancellation | Phase 020 (AlpacaBrokerAgent) |
| [009: Risk Management](./009/index.md) | Policy engine, kill switch, daily loss limits, position size limits | Phase 029 (risk config enforcement) |
| [010: Approval Flow](./010/index.md) | HITL trade approval w/ TTL tokens, pending UI | Phase 020 (SDK-native HITL in SessionAgent) |
| [007: Strategy Templates](./007/index.md) | Prompt-based strategy customization, presets | Phases 020-022 (strategy profiles, TA config profiles) — fork/share UX not yet built |

## Trading Tier

| Order | Phase | Summary |
|-------|-------|---------|
| 1 | [011: Telegram Approvals](./011/index.md) | Mobile approvals via Telegram bot. Inline buttons, timeout auto-reject |

> **Note:** Specs reference pre-020 architecture. Update agent names and API shapes before implementing.

## Data Expansion Tier

Plug into existing multi-agent system. Deploy new agent DOs + enable entitlements.

| Order | Phase | Summary |
|-------|-------|---------|
| 2 | [004: Signal Gathering Agents](./004/index.md) | StockTwits, Twitter, SEC, FRED agents. Shared PG signal storage |

> **Note:** Specs reference pre-020 architecture. New agents should follow SRP agent patterns from Phase 020.

## Polish Tier

| Order | Phase | Summary |
|-------|-------|---------|
| 3 | [013: Trade Journal](./013/index.md) | Trade outcome tracking, auto-journal on close, win rate / avg P&L metrics |
| 4 | [014: Platform Stats](./014/index.md) | Public aggregate stats (users, trades, volume). Hourly cron, user opt-out |
| 5 | [015: Anonymous Leaderboard](./015/index.md) | Rankings w/ composite scoring (ROI, Sharpe, drawdown). Anonymous aliases |
| 6 | [016: Notifications](./016/index.md) | Telegram push alerts for executions, stop losses, errors, daily summaries |
| 7 | [017: Dashboard Refinement](./017/index.md) | Unified UX: sidebar nav, error handling, loading/empty states |
| 8 | [018: Production Launch](./018/index.md) | Security audit, rate limiting, production domain, monitoring, DB backups |

> **Note:** All Polish Tier specs reference pre-020 architecture. Review and update before implementing.
