---
name: neon-db
description: Neon serverless Postgres connection setup, singleton pattern, and query best practices for Cloudflare Workers. Use when initializing the database or working with packages/data-ops database setup.
---

# Neon DB

## Connection Setup (Singleton)

```ts
// packages/data-ops/src/database/setup.ts
import { drizzle } from 'drizzle-orm/neon-http'

let db: ReturnType<typeof drizzle>

export function initDatabase(connection: { host: string; username: string; password: string }) {
  if (db) return db
  const connectionString = `postgres://${connection.username}:${connection.password}@${connection.host}`
  db = drizzle(connectionString)
  return db
}

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}
```

## Initialization (Worker Entry Point)

```ts
initDatabase({
  host: env.DATABASE_HOST,
  username: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
})
```

## Environment Variables

```bash
DATABASE_HOST="ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
DATABASE_USERNAME="neondb_owner"
DATABASE_PASSWORD="npg_xxx"
```

Set via `.env.*` (user-application) or `.*.vars` (data-service). NOT in wrangler.jsonc.

## Query Layer

- All queries call `getDb()` — never accept DB as parameter
- Use `.returning()` for mutations to avoid extra round trips

## Best Practices

- Avoid long-running transactions in serverless
- `Promise.all()` for independent parallel queries
- `.onConflictDoNothing()` for idempotent inserts (seeds)
