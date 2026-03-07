Implement design doc phase: $ARGUMENTS

## Argument Formats

- `020 M2` — Phase 020, migration M2
- `020 M3` — Phase 020, migration M3
- `006` — Simple design doc 006
- `012-2` — Design doc 012, part 2

## Instructions

1. Parse "$ARGUMENTS":
   - If format is `{docId} {phase}` (e.g. `020 M2`): look for `docs/design-docs/{docId}/` directory with index + sub-docs. The phase (M2, M3, etc.) scopes what to implement.
   - If format is `{docId}` or `{docId}-{part}`: find matching doc in `docs/design-docs/`

2. Read ALL relevant design doc files:
   - For phased docs (like 020): read the `index.md` + ALL part files (020-1 through 020-7) since phases reference content across multiple parts
   - For simple docs: read the single doc file

3. Scope the work to the requested phase:
   - For `020 M2`: implement ONLY M2 changes described across the docs (types, stubs, wrangler, exports, Workers AI provider)
   - For `020 M3`: implement ONLY M3 changes (requires M2 already done)
   - Each phase is independently deployable — do NOT implement later phases

4. Check dependency chain:
   - Confirm prerequisites are implemented by checking codebase for existing code from prior phases
   - If a dependency is missing, STOP and report what needs to be done first

5. Implement the COMPLETE spec for the requested phase:
   - Create all new files specified
   - Modify all existing files specified
   - Run any required commands (migrations, builds)
   - Use parallel agents for independent work items

6. Verify:
   - Run the phase-specific verification checks from the design doc
   - `pnpm run setup` builds
   - `pnpm run lint` clean

7. After implementation — summarize:
   - Created files
   - Modified files
   - Commands run
   - Verification results

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
