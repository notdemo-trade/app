# data-service

Cloudflare Worker API exposing data-ops queries via Hono REST endpoints.

## Stack

- Hono (Cloudflare Workers adapter)
- WorkerEntrypoint class pattern
- Consumes `@repo/data-ops` for DB queries and Zod schemas

## Structure

```
src/
├── index.ts              # Worker entrypoint, initializes DB
├── hono/
│   ├── app.ts            # Hono app, middleware chain, routes
│   ├── handlers/         # Route handlers (thin, unwrap Result<T>)
│   ├── services/         # Business logic, returns Result<T>
│   ├── middleware/        # request-id, cors, auth, rate-limiter, error-handler
│   ├── types/
│   │   └── result.ts     # AppError, Result<T>, ok(), err()
│   └── utils/
│       └── result-to-response.ts
├── scheduled/            # Cron triggers
├── queues/               # Queue consumers
├── durable-objects/      # Durable Objects
└── workflows/            # Workflows
```

## Patterns

**Handlers → Services → data-ops queries**
- Handlers: validation, auth middleware, unwrap Result via `resultToResponse()`
- Services: return `Result<T>`, never throw
- Queries: defined in `@repo/data-ops/{domain}`

**Result<T> pattern:**
```ts
// service
async function getUser(id: string): Promise<Result<User>> {
  const user = await getUserById(id);
  if (!user) return err(new AppError('Not found', 404, 'NOT_FOUND'));
  return ok(user);
}

// handler
const result = await getUser(id);
return resultToResponse(c, result);
```

**Middleware order** (in app.ts):
1. `requestId()` — generates/passes correlation ID
2. `onError` — global error handler (catches unhandled)
3. `cors` — CORS headers
4. Route-specific: `authMiddleware`, `rateLimiter`, `zValidator`

**Zod validation**: use `zValidator('param' | 'query' | 'json', Schema)`

## Endpoints

- `GET /health/live` — liveness (instant 200)
- `GET /health/ready` — readiness (checks DB)
- `POST /webhooks/*` — inbound webhooks (signature verified)

## Dev

```bash
pnpm run dev              # local dev server
pnpm run deploy:staging   # deploy to staging
pnpm run deploy:production # deploy to production
```

## Env vars

Required in `.dev.vars` (local) or Cloudflare dashboard (remote):
- `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `API_TOKEN` — Bearer token for protected endpoints
- `CLOUDFLARE_ENV` — dev | staging | production
- `ALLOWED_ORIGINS` — comma-separated origins (prod/staging only)

## Don't

- Put DB queries here — add to `@repo/data-ops/{domain}`
- Throw from services — return `Result<T>` with `err()`
- Use old `@repo/data-ops/queries/*` or `@repo/data-ops/zod-schema/*` paths
- Modify `worker-configuration.d.ts` — use `pnpm run cf-typegen`
