# Phase 030: Schedule Lifecycle Management -- Index

> Fix schedule leaks in `SessionAgent` where `stop()` fails to cancel outcome tracking and `start()` accumulates duplicate schedules across start/stop cycles.

The `SessionAgent` Durable Object manages two recurring schedules: `runScheduledCycle` (analysis at a configurable interval) and `runOutcomeTrackingCycle` (outcome tracking every 300 seconds). Two bugs cause schedule leaks that waste broker API quota, risk race conditions, and violate user expectations of what "stop" means.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| `stop()` callable | `session-agent.ts:184-194` | Only cancels `runScheduledCycle` schedules; `runOutcomeTrackingCycle` keeps firing |
| `start()` callable | `session-agent.ts:175-181` | Calls `scheduleEvery(300, 'runOutcomeTrackingCycle')` without canceling existing ones first |
| `onStart()` lifecycle | `session-agent.ts:77-94` | Same accumulation issue on DO restart when `enabled` is true |
| `runOutcomeTrackingCycle()` | `session-agent.ts:965-1016` | No guard against running when session is stopped |

## Bugs

### Bug 1: `stop()` leaks outcome tracking schedule

`stop()` filters by `s.callback === 'runScheduledCycle'`, leaving `runOutcomeTrackingCycle` active. After stopping, broker API calls continue every 5 minutes indefinitely.

### Bug 2: Schedules accumulate on start/stop/start cycles

Each `start()` call adds a new `runOutcomeTrackingCycle` schedule without removing the previous one. After N start/stop/start cycles, N concurrent outcome tracking schedules exist, each making independent broker API calls every 5 minutes.

## Impact

- Unnecessary broker API calls when session is stopped (wastes quota, could trigger rate limits)
- Multiple concurrent outcome tracking cycles race on resolving the same outcomes
- Race conditions could cause duplicate entries in `persona_outcomes` or `pipeline_outcomes`
- Resource waste scales linearly with number of start/stop cycles

## Target State

- `stop()` cancels ALL schedules (analysis + outcome tracking)
- `start()` cancels all existing schedules before creating new ones (prevents accumulation)
- `onStart()` does the same on DO restart
- `runOutcomeTrackingCycle()` has a safety guard that exits early if `enabled` is false
- A single `cancelAllSchedules()` helper centralizes cleanup logic

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [030-1-spec.md](./030-1-spec.md) | Overview, Goals/Non-Goals, Root Cause Analysis, Design Decision |
| 2 | [030-2-data.md](./030-2-data.md) | Schedule State Model, Current vs. Target Schedule Behavior |
| 3 | [030-3-logic.md](./030-3-logic.md) | `cancelAllSchedules()` helper, `start()`, `stop()`, `onStart()`, `runOutcomeTrackingCycle()` fixes |
| 4 | [030-4-api.md](./030-4-api.md) | No API changes (internal fix), RPC behavior verification |
| 5 | [030-5-ui.md](./030-5-ui.md) | No UI changes, observable behavior improvements |
| 6 | [030-6-ops.md](./030-6-ops.md) | Implementation order, verification criteria, deployment |
