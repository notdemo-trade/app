# Phase 28: Proposal Status State Machine -- Fix Zombie 'approved' State -- Index

> Fix the bug where `handleTradeDecision()` sets a trade proposal to `'approved'` before order execution, leaving it permanently stuck in that status if `broker.placeOrder()` throws.

When a user approves a trade proposal, `session-agent.ts` immediately writes `status = 'approved'` to the DO SQLite `trade_proposals` table, then attempts to place the order via the broker agent. If the broker call fails (network error, insufficient funds, API auth failure, rate limit), the catch block returns an error response but never rolls back the status. The proposal remains `'approved'` forever -- invisible to the expiration sweep (which only targets `'pending'`), not retryable, and confusing in the UI.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| `handleTradeDecision()` | `session-agent.ts:590-626` | Sets `status = 'approved'` before broker call; no rollback on failure |
| `expireProposals()` | `session-agent.ts:871-875` | Only targets `status = 'pending'`; zombie approved proposals accumulate |
| `resetData()` | `session-agent.ts:322-325` | Expires `'approved'` proposals, but only on manual reset |
| `TradeProposal['status']` | `types.ts:166` | Union lacks `'failed'` -- no way to represent execution failure |
| `STATUS_CONFIG` | `proposals.index.tsx:15-27` | UI has no rendering config for a `'failed'` status |

## Target State

- New `'failed'` status in the `TradeProposal` status union representing execution failure after approval
- `handleTradeDecision()` catch block writes `status = 'failed'` instead of silently returning an error
- New `retryProposal()` callable allows users to retry execution of failed proposals
- Shared `executeApprovedProposal()` method eliminates code duplication between `handleTradeDecision` and `retryProposal`
- `expireProposals()` sweeps both `'pending'` and `'failed'` proposals past their expiry time
- UI displays `'failed'` status with a retry button and appropriate styling

## State Machine (After Fix)

```
                  +-- rejected
                  |
pending --+-- expired
          |
          +-- approved --+-- executed --+-- tracking --+-- resolved
                         |
                         +-- failed --+-- retry --> approved --+-- executed
                                      |                        |
                                      +-- expired (timeout)    +-- failed (again)
```

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [028-1-spec.md](./028-1-spec.md) | Overview, Goals/Non-Goals, Bug Analysis, Solution Design, State Machine |
| 2 | [028-2-data.md](./028-2-data.md) | Type changes, DO SQLite impact, row mapping |
| 3 | [028-3-logic.md](./028-3-logic.md) | `executeApprovedProposal`, `retryProposal`, `expireProposals` fix, `resetData` update |
| 4 | [028-4-api.md](./028-4-api.md) | `retryProposal` callable, WebSocket RPC, return types |
| 5 | [028-5-ui.md](./028-5-ui.md) | Failed status badge, retry button, proposal detail, i18n keys |
| 6 | [028-6-ops.md](./028-6-ops.md) | Implementation order, verification criteria, file change summary |
