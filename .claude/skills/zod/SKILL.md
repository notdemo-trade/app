---
name: zod
description: Zod v4 schema definition, validation patterns, and schema composition. Use when defining validation schemas, parsing user input, or working in packages/data-ops/src/zod-schema.
---

# Zod v4

## Schema Definition

```ts
// zod-schema/user.ts
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

export type User = z.infer<typeof userSchema>
```

## Validation (use safeParse, not parse)

```ts
const result = userSchema.safeParse(input)
if (!result.success) {
  return { ok: false, errors: result.error.flatten() }
}
return { ok: true, data: result.data }
```

## Schema Composition

```ts
const createUserSchema = userSchema.omit({ id: true })
const updateUserSchema = userSchema.partial().required({ id: true })
const patchSchema = baseSchema.extend({ extra: z.string() })
```

## Common Patterns

```ts
const statusSchema = z.enum(['active', 'inactive', 'pending'])
const tagsSchema = z.array(z.string()).min(1).max(10)
const limitSchema = z.number().int().positive().default(10)
const trimmed = z.string().transform(s => s.trim())
const password = z.string()
  .min(8)
  .refine(p => /[A-Z]/.test(p), 'Must contain uppercase')
  .refine(p => /[0-9]/.test(p), 'Must contain number')
```

## Integration with Drizzle

- Create **separate** Zod schemas for validation — don't derive from Drizzle types
- Use Zod for input validation, Drizzle types for DB operations
