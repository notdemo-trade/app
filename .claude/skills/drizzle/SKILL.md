---
name: drizzle
description: Drizzle ORM schema definition, type inference, query patterns, and migrations for this project. Use when working in packages/data-ops or writing DB queries and schema changes.
---

# Drizzle ORM

## Schema Definition

```ts
// drizzle/schema.ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>
```

- Define tables in `drizzle/schema.ts`, relations in `drizzle/relations.ts`
- Never edit auto-generated files (e.g., `auth-schema.ts`)

## Query Patterns

```ts
// SQL-like (joins)
const result = await db.select().from(users)
  .leftJoin(posts, eq(posts.authorId, users.id))
  .where(eq(users.id, userId))

// Relational (nested data)
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: { posts: true }
})
```

Always use `eq()`, `and()`, `or()` helpers — never raw strings.

## Queries Module

```ts
// queries/users.ts
export async function getUserById(db: Database, id: string): Promise<User | null> {
  return db.query.users.findFirst({ where: eq(users.id, id) })
}
```

Accept `db` as first parameter for testability.

## Migrations

- Never manually edit generated migration files
- Use env-specific configs: `drizzle-{dev,staging,production}.config.ts`
- Run `drizzle:*:generate` then `drizzle:*:migrate`
- Test on dev/staging before production
