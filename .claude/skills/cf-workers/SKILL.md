---
name: cf-workers
description: Cloudflare Workers entry point, env bindings, secrets, and request lifecycle patterns. Use when creating or modifying Worker entry points in apps/data-service or configuring wrangler.jsonc bindings.
---

# Cloudflare Workers

## Worker Entry

```ts
import { WorkerEntrypoint } from 'cloudflare:workers'

export default class extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    initDatabase({ host: this.env.DATABASE_HOST, ... })
    return app.fetch(request, this.env)
  }
}
```

## Env Bindings

Run `pnpm cf-typegen` to generate `Env` types from `wrangler.jsonc`.

```ts
interface Env {
  DATABASE_URL: string
  MY_KV: KVNamespace
  MY_BUCKET: R2Bucket
  MY_QUEUE: Queue
  MY_DO: DurableObjectNamespace
}
```

Access via `this.env` (Worker) or `c.env` (Hono).

## Secrets

- Never hardcode secrets — configure via `sync-secrets.sh`
- Use `.dev.vars` for local dev (gitignored)
- Access same as env vars: `env.SECRET_NAME`

## Request Lifecycle

- Workers are stateless — no global mutable state
- Use `ctx.waitUntil()` for async work after response

```ts
ctx.waitUntil(logAnalytics(request))
return response
```

## Testing

- `@cloudflare/vitest-pool-workers` for integration tests
- Mock bindings in unit tests
- Test locally with `wrangler dev`
