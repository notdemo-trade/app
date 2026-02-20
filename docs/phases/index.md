# Design Docs — Split Index

Each phase doc has been split into up to 6 focused sub-docs:

| # | Part | Purpose |
|---|------|---------|
| 1 | Spec | Overview, goals, features, type definitions |
| 2 | Data Model | DB schema, Drizzle, Zod schemas, migrations |
| 3 | Business Logic | Services, clients, queries, crons |
| 4 | API & Server Fns | HTTP handlers, server functions |
| 5 | Frontend & UI | Query hooks, components, pages |
| 6 | Ops & Verification | Impl order, verification, security, decisions |

## Phases

- [001: Project Foundation](./phases/001/index.md)
  Better Auth w/ email/password, per-user bearer tokens for API/Telegram access. Deploy to staging.notdemo.trade.

- [002: Credentials Configuration](./phases/002/index.md)
  BYOK encrypted storage for Alpaca + LLM provider keys. Connection validation, trading config per user.

- [003: Account Portfolio View](./phases/003/index.md)
  Alpaca account info, positions with P&L, recent orders. Dashboard displays equity and buying power.

- [004: Signal Gathering](./phases/004/index.md)
  StockTwits signal ingestion for user watchlists. Raw event storage, deduplication, signal feed UI.

- [005: Technical Analysis](./phases/005/index.md)
  TA indicators (SMA, EMA, RSI, MACD, Bollinger, ATR) from Alpaca market data. Signal detection + chart overlays.

- [006: LLM Analysis](./phases/006/index.md)
  Multi-provider LLM analysis (OpenAI, Anthropic, Google, xAI, DeepSeek). Trade recommendations, usage tracking, cost estimation.

- [007: Strategy Templates](./phases/007/index.md)
  Prompt-based strategy customization. Default templates (Conservative/Moderate/Aggressive), fork/share, versioning.

- [008: Order Execution](./phases/008/index.md)
  Full Alpaca trading: stocks, crypto (24/7), options. Order entry UI with confirmation, position close, cancellation.

- [009: Risk Management](./phases/009/index.md)
  Policy engine validates orders pre-execution. Kill switch, daily loss limits, cooldown periods, position size limits.

- [010: Approval Flow](./phases/010/index.md)
  HITL trade approval with TTL tokens. Pending approvals UI, approve/reject, auto-approve mode, expiration cleanup.

- [011: Telegram Approvals](./phases/011/index.md)
  Telegram bot for mobile trade approvals. Inline keyboard buttons, timeout auto-reject, daily summaries, risk alerts.

- [012: Autonomous Agent](./phases/012/index.md)
  Per-user trading agent (Agents SDK). Scheduled signal gathering + LLM analysis loops, real-time state sync via WebSocket, streaming analysis.

- [013: Trade Journal](./phases/013/index.md)
  Trade outcome tracking with full context (signals, TA, notes). Auto-journal on close, performance metrics (win rate, avg P&L).

- [014: Platform Stats](./phases/014/index.md)
  Public aggregate stats (users, trades, volume, ROI). Hourly cron refresh, user opt-out, no individual identification.

- [015: Anonymous Leaderboard](./phases/015/index.md)
  Individual rankings with composite scoring (ROI, Sharpe, win rate, drawdown). Anonymous aliases, multi-timeframe, paper/live split.

- [016: Notifications](./phases/016/index.md)
  Telegram push alerts for trade executions, stop losses, errors, daily summaries. Per-user preferences, cooldown spam prevention.

- [017: Dashboard Refinement](./phases/017/index.md)
  Unified UX: sidebar nav, error handling, loading/empty states. Polished desktop dashboard integrating all features.

- [018: Production Launch](./phases/018/index.md)
  Security audit, per-user rate limiting, production domain setup, monitoring, DB backups. Live at notdemo.trade.
