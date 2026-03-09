Implement design doc phase: $ARGUMENTS

## Argument Formats

- `025` — Full 6-part design doc (reads index.md + all parts, implements everything)
- `025-032` — Range of docs (implements each in dependency order)
- `025 026 027` — Multiple specific docs (implements each in listed order)
- `020 M2` — Phase 020, migration M2 (scoped to that migration only)
- `012-2` — Design doc 012, part 2 only

## Instructions

1. Parse "$ARGUMENTS":
   - **Single doc** (`025`): look for `docs/design-docs/025/` or `docs/design-docs/done/025/`
   - **Range** (`025-032`): expand to all docs in that range, implement in dependency order (see quick reference)
   - **Multiple** (`025 026`): implement each in the listed order
   - **Phased** (`020 M2`): scope to specific migration/phase within the doc
   - **Part-only** (`012-2`): implement only that specific part

2. Read ALL relevant design doc files:
   - Read `index.md` first — it contains the overview, current/target state, and sub-doc table
   - Read ALL numbered parts (`{docId}-1-spec.md` through `{docId}-6-ops.md`)
   - The `-3-logic.md` file contains the actual code changes with before/after diffs
   - The `-6-ops.md` file contains implementation order and verification checks
   - For bugfix docs (025-032): the `-1-spec.md` has root cause analysis, `-2-data.md` has schema changes

3. Determine implementation scope:
   - For single/range/multiple docs: implement the FULL spec from all parts
   - For phased docs (`020 M2`): implement ONLY that phase's changes
   - For part-only (`012-2`): implement ONLY that part
   - Each doc should be independently deployable

4. Check dependency chain:
   - Confirm prerequisites are implemented by checking codebase for existing code from prior phases
   - If a dependency is missing, STOP and report what needs to be done first
   - For bugfix docs 025-032, check the dependency table below

5. Implement the COMPLETE spec for the requested phase:
   - Follow the implementation order from `-6-ops.md`
   - Apply all code changes from `-3-logic.md` (before/after diffs)
   - Apply schema changes from `-2-data.md` if any (migrations, type changes)
   - Create all new files specified
   - Modify all existing files specified
   - Run any required commands (migrations, builds)
   - Use parallel agents for independent work items

6. Verify:
   - Run ALL verification checks from `-6-ops.md`
   - `pnpm run lint` passes
   - `pnpm run setup` builds

7. After implementation — summarize:
   - Created files
   - Modified files
   - Commands run
   - Verification results
   - Any deviations from the spec (with rationale)

## Bugfix Docs 025-032: Quick Reference

| Doc | Title | Severity | Depends On | Key Files |
|-----|-------|----------|------------|-----------|
| 025 | Fix Broken Outcome Distribution | CRITICAL | — | session-agent.ts, session-agent-helpers.ts, session/types.ts |
| 026 | Position Size Units Normalization | CRITICAL | — | session-agent.ts, pipeline-orchestrator-agent.ts |
| 027 | Pipeline Confidence Threshold | CRITICAL | — | pipeline-orchestrator-agent.ts, session-agent.ts |
| 028 | Proposal Status State Machine | CRITICAL | — | session-agent.ts, session/types.ts, proposals UI |
| 029 | Risk Management Enforcement | MODERATE | — | session-agent.ts |
| 030 | Schedule Lifecycle Management | MODERATE | — | session-agent.ts |
| 031 | Short Position Handling | MODERATE | — | session-agent.ts, debate-orchestrator-agent.ts |
| 032 | Proposal Dedup & Minor Fixes | MODERATE | — | session-agent.ts, pipeline-orchestrator-agent.ts |

### Recommended implementation order: `030 → 028 → 025 → 026 → 027 → 031 → 032 → 029`

## Phase 020 Quick Reference

| Phase | Depends On | Scope |
|-------|-----------|-------|
| M2 | — | Scaffold + Workers AI provider (zero behavior change) |
| M3 | M2 | Refactor TA (extract data fetching) |
| M4 | M2 | Persona support in LLM agent (parallel with M3) |
| M5 | M3 + M4 | Orchestration modes (Debate + Pipeline) |
| M6 | M5 | SessionAgent as primary UI entry point |
| M7 | M6 | Deprecate OrchestratorAgent (BREAKING) |
| M8a-d | M6 | Memory & scoring (parallel with M7) |
