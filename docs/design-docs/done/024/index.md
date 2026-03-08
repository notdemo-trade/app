# Phase 24: Customizable Debate Personas — Index

> Allow users to customize, create, disable, and reset the AI debate personas that analyze trade opportunities, plus customize the moderator synthesis prompt.

Currently, the three debate personas (Bull Analyst, Bear Analyst, Risk Manager) and the moderator prompt are hardcoded in `packages/data-ops/src/agents/session/defaults.ts`. Users cannot modify persona behavior, add new analysis perspectives, or tune how consensus is synthesized. This phase introduces a `debate_personas` table in PostgreSQL, CRUD API endpoints, a settings UI, and wires the `DebateOrchestratorAgent` to read user-configured personas from the database.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| 3 hardcoded personas | `packages/data-ops/src/agents/session/defaults.ts` (lines 6-44) | Not user-editable, bias values are freeform strings |
| Hardcoded moderator prompt | `defaults.ts` (lines 46-52) | Not user-editable |
| DO SQLite persona blob | `session-agent.ts` `loadPersonas()` | Single JSON blob, lost on DO eviction, no PostgreSQL persistence |
| `updatePersona()` callable | `session-agent.ts` | Can only update existing personas in-place, no add/remove/reset |
| No persona limit enforcement | `session-agent.ts` | No maximum count, no validation on persona fields |

## Target State

- Per-user persona configurations persisted in Neon PostgreSQL via new `debate_personas` table
- Moderator prompt stored in new `user_trading_config.moderator_prompt` column
- Full CRUD API for personas (list, create, update, delete, reset to defaults)
- Settings UI with card-based persona editor and collapsible moderator prompt editor
- `SessionAgent` reads personas from PostgreSQL via data-ops queries, caches in DO SQLite, falls back to hardcoded defaults
- `DebateOrchestratorAgent` receives personas from `SessionAgent` (no change to orchestrator interface)
- Maximum 5 personas per user, minimum 2 active personas for debates
- Default personas seeded on first access (lazy seeding pattern)

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [024-1-spec.md](./024-1-spec.md) | Overview, Goals/Non-Goals, Persona Model, Moderator Prompt, Constraints |
| 2 | [024-2-data.md](./024-2-data.md) | PostgreSQL schema, Drizzle table, Zod schemas, Migration |
| 3 | [024-3-logic.md](./024-3-logic.md) | Service layer, Seeding, Reset logic, SessionAgent integration |
| 4 | [024-4-api.md](./024-4-api.md) | Hono endpoints, Validation, Error handling |
| 5 | [024-5-ui.md](./024-5-ui.md) | Settings page, Persona cards, Moderator editor |
| 6 | [024-6-ops.md](./024-6-ops.md) | Migration steps, Implementation order, Verification |
