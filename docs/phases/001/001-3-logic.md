# Phase 1: Project Foundation — Part 3: Business Logic
> Split from `001-phase-1-project-foundation.md`. See other parts in this directory.

## Implementation Details

### Migration Order

1. Project rename (1.1)
2. Domain setup (1.2)
3. Enable email/password (1.3)
4. Database migration for api_tokens (1.5)
5. Token queries (1.5)
6. Token management UI (1.6)
7. Auth middleware (1.7)
8. Profile UI (1.4)

### Database Migration

```sql
-- 0001_api_tokens.sql
CREATE TYPE token_type AS ENUM ('access', 'kill_switch');

CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  type token_type NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);

-- Ensure only one active token per type per user
CREATE UNIQUE INDEX idx_api_tokens_unique_active
  ON api_tokens(user_id, type)
  WHERE revoked_at IS NULL;
```

### Zod Schemas

Add `packages/data-ops/src/zod-schema/api-token.ts`:

```ts
import { z } from "zod"

export const TokenTypeSchema = z.enum(["access", "kill_switch"])
export type TokenType = z.infer<typeof TokenTypeSchema>

export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  type: TokenTypeSchema,
  tokenPrefix: z.string(),
  expiresAt: z.date(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
})

export const CreateApiTokenRequestSchema = z.object({
  type: TokenTypeSchema,
})

export const CreateApiTokenResponseSchema = z.object({
  id: z.string().uuid(),
  token: z.string(), // only returned on creation
  tokenPrefix: z.string(),
  type: TokenTypeSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
})

export const RevokeApiTokenRequestSchema = z.object({
  type: TokenTypeSchema, // revoke by type since only one per type
})

export type ApiToken = z.infer<typeof ApiTokenSchema>
export type CreateApiTokenRequest = z.infer<typeof CreateApiTokenRequestSchema>
export type CreateApiTokenResponse = z.infer<typeof CreateApiTokenResponseSchema>
```

---

