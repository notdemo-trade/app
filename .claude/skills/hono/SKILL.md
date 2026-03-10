---
name: hono
description: Hono framework setup, middleware, routing, validation, and error handling for Cloudflare Workers API. Use when working in apps/data-service or building Hono routes and handlers.
---

# Hono

## App Setup

```ts
import { Hono } from 'hono'
const app = new Hono<{ Bindings: Env }>()
export default { fetch: app.fetch }
```

## Middleware Chain

Apply in order: `requestId → errorHandler → cors → auth → rateLimiter → validator`

```ts
app.use('*', requestId())
app.use('*', errorHandler())
app.use('*', cors())
app.use('/api/*', authMiddleware())
app.use('/api/*', rateLimiter())
```

## Route Structure: Handlers → Services → Queries

```ts
// handlers/users.ts
export const getUser = async (c: Context) => {
  const { id } = c.req.param()
  const result = await userService.getById(c.env, id)
  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json(result)
}
```

## Request Validation

```ts
import { zValidator } from '@hono/zod-validator'

app.post('/users', zValidator('json', createUserSchema), async (c) => {
  const data = c.req.valid('json') // typed!
})

zValidator('param', z.object({ id: z.string().uuid() }))
zValidator('query', z.object({ limit: z.coerce.number().default(10) }))
```

## Error Handling

```ts
app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.statusCode)
  return c.json({ error: 'Internal error' }, 500)
})
```

## Response Patterns

```ts
return c.json({ data: user })
return c.json({ data: users, meta: { total, page } })
return c.json({ error: 'Not found' }, 404)
return c.json({ error: 'Validation failed', details: errors }, 400)
```
