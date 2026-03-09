# Phase 11: Telegram Approvals — Index

> Telegram bot integration for trade proposal approvals, execution notifications, and daily summaries. Hooks into the existing SessionAgent proposal lifecycle — no new approval tables needed.

| Part | File | Sections |
|------|------|----------|
| 1 | [011-1-spec.md](./011-1-spec.md) | Overview, Context, Goals & Non-Goals, Features, Type Definitions |
| 2 | [011-2-data.md](./011-2-data.md) | Credential Schema Changes, Database Schema (notification_settings), Zod Schemas |
| 3 | [011-3-logic.md](./011-3-logic.md) | Telegram Service, Message Builders, Notification Dispatcher, SessionAgent Integration |
| 4 | [011-4-api.md](./011-4-api.md) | Webhook Handler, API Endpoints, Server Functions |
| 5 | [011-5-ui.md](./011-5-ui.md) | Query Hooks, Telegram Setup Wizard, Notification Preferences, Settings Page |
| 6 | [011-6-ops.md](./011-6-ops.md) | Webhook Registration, Security, Wrangler Config, Implementation Order, Verification |

## Architecture Summary

```
Telegram ←webhook→ data-service webhook handler
                        ↓ getAgentByName() RPC
                    SessionAgent.approveProposal() / .rejectProposal()
                        ↓ existing flow
                    AlpacaBrokerAgent.placeOrder()

SessionAgent (on proposal create / execute / expire)
    ↓ dispatchNotification()
    TelegramService.sendMessage() → Telegram API
```

Key design decision: **no new approval table**. The existing `trade_proposals` in SessionAgent DO SQLite already tracks proposal lifecycle (pending → approved/rejected/expired → executed/failed). Telegram is a notification + remote-control layer on top.
