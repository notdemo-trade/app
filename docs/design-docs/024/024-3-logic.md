# Phase 24: Customizable Debate Personas — Part 3: Logic

## Service Layer

### New File: `apps/data-service/src/hono/services/debate-persona-service.ts`

Follows the existing Handlers -> Services -> data-ops queries pattern. Services return `Result<T>`, never throw.

```ts
import {
  countUserPersonas,
  createDebatePersona,
  type CreateDebatePersonaRequest,
  type DebatePersona,
  type DebatePersonaListResponse,
  deleteDebatePersona,
  deleteUserCustomPersonas,
  getDebatePersonaById,
  getDebatePersonaByName,
  getDebatePersonas,
  seedDefaultPersonas,
  type UpdateDebatePersonaRequest,
} from '@repo/data-ops/debate-persona';
import { getTradingConfig, upsertTradingConfig } from '@repo/data-ops/trading-config';
import { DEFAULT_MODERATOR_PROMPT } from '@repo/data-ops/agents/session/defaults';
import type { Result } from '../types/result';
import { err, ok } from '../types/result';
import { AppError } from '../types/result';

const MAX_PERSONAS = 5;
const MIN_ACTIVE_PERSONAS = 2;

export async function listPersonas(userId: string): Promise<Result<DebatePersonaListResponse>> {
  let personas = await getDebatePersonas(userId);

  // Lazy seeding: if user has no personas, create defaults
  if (personas.length === 0) {
    personas = await seedDefaultPersonas(userId);
  }

  const tradingConfig = await getTradingConfig(userId);
  const moderatorPrompt = tradingConfig?.moderatorPrompt ?? null;

  return ok({ personas, moderatorPrompt });
}

export async function createPersona(
  userId: string,
  data: CreateDebatePersonaRequest,
): Promise<Result<DebatePersona>> {
  // Enforce max persona count
  const currentCount = await countUserPersonas(userId);
  if (currentCount >= MAX_PERSONAS) {
    return err(
      new AppError(
        `Maximum of ${MAX_PERSONAS} personas allowed. Delete a custom persona first.`,
        400,
        'MAX_PERSONAS_EXCEEDED',
      ),
    );
  }

  // Enforce unique name per user
  const existing = await getDebatePersonaByName(userId, data.name);
  if (existing) {
    return err(
      new AppError(
        `A persona with name '${data.name}' already exists.`,
        409,
        'PERSONA_NAME_CONFLICT',
      ),
    );
  }

  // Ensure defaults are seeded before adding custom persona
  const personas = await getDebatePersonas(userId);
  if (personas.length === 0) {
    await seedDefaultPersonas(userId);
  }

  const nextSortOrder = Math.max(0, ...personas.map((p) => p.sortOrder)) + 1;

  const persona = await createDebatePersona(userId, {
    ...data,
    isDefault: false,
    sortOrder: nextSortOrder,
  });

  return ok(persona);
}

export async function updatePersona(
  userId: string,
  personaId: string,
  data: UpdateDebatePersonaRequest,
): Promise<Result<DebatePersona>> {
  const existing = await getDebatePersonaById(userId, personaId);
  if (!existing) {
    return err(new AppError('Persona not found.', 404, 'PERSONA_NOT_FOUND'));
  }

  // Prevent disabling too many personas
  if (data.isActive === false && existing.isActive) {
    const allPersonas = await getDebatePersonas(userId);
    const activeCount = allPersonas.filter((p) => p.isActive).length;
    // This persona is currently active and we're disabling it
    if (activeCount <= MIN_ACTIVE_PERSONAS) {
      return err(
        new AppError(
          `At least ${MIN_ACTIVE_PERSONAS} personas must remain active for debates.`,
          400,
          'MIN_ACTIVE_PERSONAS',
        ),
      );
    }
  }

  const updated = await updateDebatePersona(userId, personaId, data);
  if (!updated) {
    return err(new AppError('Failed to update persona.', 500, 'UPDATE_FAILED'));
  }

  return ok(updated);
}

export async function removePersona(
  userId: string,
  personaId: string,
): Promise<Result<{ deleted: true }>> {
  const existing = await getDebatePersonaById(userId, personaId);
  if (!existing) {
    return err(new AppError('Persona not found.', 404, 'PERSONA_NOT_FOUND'));
  }

  // Cannot delete default personas
  if (existing.isDefault) {
    return err(
      new AppError(
        'Default personas cannot be deleted. You can disable them instead.',
        400,
        'CANNOT_DELETE_DEFAULT',
      ),
    );
  }

  // Prevent deleting if it would leave fewer than MIN_ACTIVE active personas
  if (existing.isActive) {
    const allPersonas = await getDebatePersonas(userId);
    const activeCount = allPersonas.filter((p) => p.isActive).length;
    if (activeCount <= MIN_ACTIVE_PERSONAS) {
      return err(
        new AppError(
          `At least ${MIN_ACTIVE_PERSONAS} active personas are required. Enable another persona before deleting this one.`,
          400,
          'MIN_ACTIVE_PERSONAS',
        ),
      );
    }
  }

  await deleteDebatePersona(userId, personaId);
  return ok({ deleted: true });
}

export async function resetPersonas(
  userId: string,
): Promise<Result<DebatePersonaListResponse>> {
  // Delete all custom personas
  await deleteUserCustomPersonas(userId);

  // Delete all existing defaults (to reset their prompts/settings)
  const existing = await getDebatePersonas(userId);
  for (const persona of existing) {
    if (persona.isDefault) {
      await deleteDebatePersona(userId, persona.id);
    }
  }

  // Re-seed defaults
  const personas = await seedDefaultPersonas(userId);

  // Reset moderator prompt to default (set to NULL)
  await upsertTradingConfig(userId, { moderatorPrompt: null });

  return ok({ personas, moderatorPrompt: null });
}

export async function updateModeratorPrompt(
  userId: string,
  moderatorPrompt: string | null,
): Promise<Result<{ moderatorPrompt: string | null }>> {
  await upsertTradingConfig(userId, { moderatorPrompt });
  return ok({ moderatorPrompt });
}
```

---

## Lazy Seeding

Default personas are created the first time a user accesses the debate personas API, not during user registration. This pattern:

1. Avoids modifying the auth registration flow
2. Avoids a migration that backfills rows for every existing user
3. Is idempotent -- `seedDefaultPersonas()` uses `onConflictDoNothing()` on the unique `(user_id, name)` index

### Seeding Flow

```
GET /api/debate-personas
  -> listPersonas(userId)
    -> getDebatePersonas(userId)
    -> rows.length === 0?
       -> seedDefaultPersonas(userId)
       -> return seeded rows
    -> rows.length > 0?
       -> return existing rows
```

### Edge Case: Partial Seeds

If seeding is interrupted (e.g., network timeout after inserting 2 of 3 defaults), the next call to `listPersonas()` will see `rows.length > 0` and skip seeding. The missing default persona would not exist. This is acceptable because:
- The user can still run debates with 2 personas
- The user can manually re-trigger seeding via the "Reset to Defaults" action
- `onConflictDoNothing()` makes re-seeding safe even if some rows already exist

---

## Reset Logic

The "Reset to Defaults" operation:

1. Deletes all custom (non-default) personas via `deleteUserCustomPersonas(userId)`
2. Deletes all existing default personas (to reset any prompt/bias edits)
3. Re-seeds the 3 default personas with original values via `seedDefaultPersonas(userId)`
4. Sets `user_trading_config.moderator_prompt` to `NULL` (reverting to system default)

This is a destructive operation. The UI should confirm before executing.

**Impact on persona performance tracking**: Resetting personas does NOT clear `persona_outcomes` or `persona_scores` in the DO SQLite. The scores remain associated with the persona's `name` field (e.g., `bull_analyst`). After reset, the persona has the same `name` but potentially different prompt content. Historical scores reflect the persona's entire lifetime, not just the current prompt.

---

## SessionAgent Integration

### Current Code (`session-agent.ts`)

```ts
// Line 411-415
const personas = this.loadPersonas();
const debateConfig = {
  personas,
  rounds: config.debateRounds,
  moderatorPrompt: DEFAULT_DEBATE_CONFIG.moderatorPrompt,
};
```

### Updated Code

```ts
// Replace loadPersonas() with PostgreSQL-backed fetch
const personas = await this.loadPersonasFromDb();
const moderatorPrompt = await this.loadModeratorPrompt();
const debateConfig = {
  personas,
  rounds: config.debateRounds,
  moderatorPrompt,
};
```

### New Private Methods on SessionAgent

```ts
private async loadPersonasFromDb(): Promise<PersonaConfig[]> {
  try {
    const userId = this.name; // SessionAgent instance key is userId
    let rows = await getDebatePersonas(userId);

    // Lazy seed if no rows exist
    if (rows.length === 0) {
      rows = await seedDefaultPersonas(userId);
    }

    // Filter to active personas only
    const active = rows.filter((r) => r.isActive);

    // Map DB rows to PersonaConfig for orchestrator
    return active.map((row) => ({
      id: row.name,
      name: row.displayName,
      role: row.role,
      systemPrompt: row.systemPrompt,
      bias: row.bias,
    }));
  } catch (error) {
    // Fallback to hardcoded defaults if DB fetch fails
    console.error('Failed to load personas from DB, using defaults:', error);
    return [...DEFAULT_PERSONAS];
  }
}

private async loadModeratorPrompt(): Promise<string> {
  try {
    const userId = this.name;
    const tradingConfig = await getTradingConfig(userId);
    return tradingConfig?.moderatorPrompt ?? DEFAULT_MODERATOR_PROMPT;
  } catch {
    return DEFAULT_MODERATOR_PROMPT;
  }
}
```

### Removing DO SQLite Persona Storage

After this change, the DO SQLite `personas` table in `SessionAgent` is no longer needed. The migration path:

1. **Phase 24 implementation**: Add `loadPersonasFromDb()` and `loadModeratorPrompt()`. Keep `loadPersonas()` and the SQLite `personas` table as fallback.
2. **After verification**: Remove the `loadPersonas()` method, `updatePersona()` callable, and the `CREATE TABLE IF NOT EXISTS personas` DDL from `onStart()`.
3. **The SQLite table can be left in place** -- it won't be written to or read from, and DO SQLite tables cannot be dropped via migration.

### Removing the `updatePersona()` Callable

The existing `updatePersona()` `@callable()` method on `SessionAgent` becomes redundant. It currently modifies the DO SQLite blob. After this phase, persona updates go through the Hono API -> PostgreSQL. The callable should be removed to avoid confusion.

**Impact**: Any client code calling `sessionAgent.updatePersona()` via WebSocket RPC needs to switch to the REST API endpoint. Currently, no client code calls this method (it was a backend-only capability used for testing).

---

## DebateOrchestratorAgent: No Changes

The `DebateOrchestratorAgent.runDebate()` method receives `DebateConfig` as a parameter (which includes `personas: PersonaConfig[]`). It does not fetch personas itself. The change is entirely in `SessionAgent`, which now provides DB-backed personas instead of DO SQLite-backed ones.

The orchestrator's `persona_outcomes`, `persona_scores`, and `persona_patterns` tables continue to reference personas by their `PersonaId` (the `name` field, e.g., `bull_analyst`, `momentum_trader`). Custom personas participate in scoring identically to default personas.

---

## Error Handling

All service methods return `Result<T>`. Error codes used:

| Code | HTTP Status | When |
|------|-------------|------|
| `MAX_PERSONAS_EXCEEDED` | 400 | Creating persona when 5 already exist |
| `PERSONA_NAME_CONFLICT` | 409 | Creating persona with duplicate name |
| `PERSONA_NOT_FOUND` | 404 | Updating/deleting non-existent persona |
| `CANNOT_DELETE_DEFAULT` | 400 | Attempting to delete a system default persona |
| `MIN_ACTIVE_PERSONAS` | 400 | Disabling/deleting would leave fewer than 2 active |
| `UPDATE_FAILED` | 500 | Database update returned no rows |

### Fallback Behavior

If the PostgreSQL fetch fails during a debate cycle (e.g., database outage), `loadPersonasFromDb()` catches the error and falls back to `DEFAULT_PERSONAS`. This ensures debates can still run even if the persona configuration cannot be loaded. The error is logged for observability.
