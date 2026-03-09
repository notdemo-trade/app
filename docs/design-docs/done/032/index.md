# Phase 32: Proposal Dedup Guards & Minor Data Fixes -- Index

> Prevent duplicate trade proposals for the same symbol, fix exit order matching logic, and eliminate the fragile empty-then-patched `threadId` pattern in pipeline proposals.

Three independent bugs discovered during code review of `session-agent.ts` and `pipeline-orchestrator-agent.ts`. All three are low-effort, high-value correctness fixes that prevent silent data integrity issues during automated analysis cycles.

## Current State

| # | Component | Location | Issue |
|---|-----------|----------|-------|
| 1 | `runAnalysisForSymbol()` | `session-agent.ts:408-457` | No guard against generating a new proposal when a pending/approved proposal already exists for the same symbol. LLM receives portfolio context with pending proposals but may ignore it. |
| 2 | `findExitOrder()` | `session-agent.ts:1189-1200` | Sorts exit orders descending by `createdAt` and takes `[0]` (most recent). Should take the earliest exit after entry to correctly match a specific position's closing order. |
| 3 | `buildProposal()` | `pipeline-orchestrator-agent.ts:468-497` | Sets `threadId: ''` at construction, later patched via spread in `runPipelineAnalysis()`. Fragile pattern -- the empty string is visible in any logging or intermediate processing before the patch. |

## Target State

- Analysis cycles skip symbols that already have a `pending` or `approved` proposal, with a log message explaining the skip
- `findExitOrder()` returns the first filled exit-side order chronologically after the entry, not the most recent
- Pipeline proposals receive their `threadId` at construction time via `RunPipelineParams`

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [032-1-spec.md](./032-1-spec.md) | Overview, Goals/Non-Goals, Problem Analysis, Constraints |
| 2 | [032-2-data.md](./032-2-data.md) | DO SQLite queries, Type changes |
| 3 | [032-3-logic.md](./032-3-logic.md) | Dedup guard, Exit order fix, ThreadId fix, Error handling |
| 4 | [032-4-api.md](./032-4-api.md) | No API changes (internal fixes only) |
| 5 | [032-5-ui.md](./032-5-ui.md) | No UI changes (skip message visible in thread history) |
| 6 | [032-6-ops.md](./032-6-ops.md) | Implementation order, Verification criteria, File change summary |
