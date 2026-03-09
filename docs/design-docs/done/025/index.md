# Phase 25: Fix Broken Outcome Distribution — Orchestrator Session ID Resolution

> Bug fix: `resolveOrchestratorSessionId()` returns a `userId:symbol` string instead of the actual debate/pipeline session UUID, causing outcome distribution to silently fail. Persona scores, pipeline scores, confidence dampening, and the entire feedback/learning loop are non-functional.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| `resolveOrchestratorSessionId()` | `session-agent.ts:958-963` | Returns `userId:symbol` stub, not actual session UUID |
| `createOutcomeTracking()` | `session-agent.ts:927-956` | Stores wrong `orchestrator_session_id` in `proposal_outcomes` |
| `distributeOutcome()` | `session-agent.ts:1057-1095` | Passes wrong session ID to orchestrator `recordPersonaOutcome` / `recordStepOutcome` |
| `recordPersonaOutcome()` | `debate-orchestrator-agent.ts:287-319` | Queries `persona_analyses WHERE session_id = 'userId:AAPL'` -- 0 rows (actual IDs are UUIDs) |
| `recordStepOutcome()` | `pipeline-orchestrator-agent.ts:216-246` | Queries `pipeline_sessions WHERE id = 'userId:AAPL'` -- 0 rows, silently returns |
| `persona_scores`, `pipeline_scores` | DO SQLite | Never populated because `recordPersonaOutcome` / `recordStepOutcome` match 0 rows |
| Confidence dampening | `debate-orchestrator-agent.ts:224-227` | Always uses default multiplier 1.0 (no score data) |

## Target State

- The orchestrator session UUID (created by `crypto.randomUUID()` inside `runDebate()` / `runPipeline()`) is stored alongside the trade proposal at creation time
- When an outcome resolves, the correct UUID is read from the proposal and passed to the orchestrator agent
- `recordPersonaOutcome()` matches `persona_analyses` rows and populates `persona_outcomes` and `persona_scores`
- `recordStepOutcome()` matches `pipeline_sessions` rows and populates `pipeline_outcomes` and `pipeline_scores`
- Confidence dampening begins calibrating based on actual persona performance data

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [025-1-spec.md](./025-1-spec.md) | Problem analysis, root cause, impact, goals/non-goals |
| 2 | [025-2-data.md](./025-2-data.md) | Schema changes, DO SQLite migration |
| 3 | [025-3-logic.md](./025-3-logic.md) | Code changes, data flow before/after |
| 4 | [025-4-api.md](./025-4-api.md) | API changes (none required) |
| 5 | [025-5-ui.md](./025-5-ui.md) | UI changes (none required) |
| 6 | [025-6-ops.md](./025-6-ops.md) | Implementation order, verification, testing |
