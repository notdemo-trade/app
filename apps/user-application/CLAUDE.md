# user-application

TanStack Start frontend with SSR on Cloudflare Workers.

## Stack

- TanStack Start (Router + Query + Form)
- Cloudflare Workers with service bindings
- Better Auth for authentication
- Consumes `@repo/data-ops` for direct DB access and Zod schemas

## Structure

```
src/
├── server.ts                 # Worker entry, DB + auth init
├── router.tsx                # TanStack Router config
├── core/
│   ├── errors.ts             # AppError class
│   └── middleware/
│       └── auth.ts           # protectedFunctionMiddleware, protectedRequestMiddleware
├── routes/                   # File-based routing
│   ├── __root.tsx            # Root layout
│   ├── index.tsx             # Landing page
│   ├── faq/$categoryId.tsx   # Dynamic FAQ pages
│   ├── _auth/                # Protected routes (require auth)
│   └── api/                  # API handlers (Better Auth, health)
├── lib/
│   ├── utils.ts              # Shared utilities
│   ├── auth-client.ts        # Better Auth client
│   ├── data-service.ts       # Service binding client (DATA_SERVICE)
│   ├── api-client.ts         # HTTP fetch wrapper (throws AppError)
│   └── query-keys.ts         # Query key factories + createEntityQueryOptions
└── components/               # React components
    ├── landing/              # Landing page sections
    ├── faq/                  # FAQ page component
    ├── navigation/           # Nav bar
    ├── theme/                # Theme toggle + provider
    ├── auth/                 # Auth components
    └── ui/                   # Radix/shadcn primitives
```

## Error Handling

- `AppError` in `core/errors.ts` — thrown by `api-client.ts` on non-2xx
- Display via `mutation.error.message` in forms
- Error boundaries for unexpected crashes

```tsx
{mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}
```

## Data Patterns

Three access patterns:
1. **Direct** — Server Fn → data-ops → DB (`@repo/data-ops/{domain}`)
2. **Binding** — Server Fn → `fetchDataService()` → data-service → DB
3. **API** — Browser → `api-client.ts` → data-service HTTP

Use `createEntityQueryKeys()` from `lib/query-keys.ts` for key factories.

## Service Binding (DATA_SERVICE)

Use `fetchDataService()` from `lib/data-service.ts` for server-side calls to data-service via Worker service binding. Never call the public API URL from server code.

## Dev

```bash
pnpm run dev              # local dev (port 3000)
pnpm run deploy:staging   # deploy to staging
pnpm run deploy:production # deploy to production
```

## Env vars

`.env` (local) or Cloudflare dashboard:
- `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `BETTER_AUTH_SECRET`
- `CLOUDFLARE_ENV` — dev | staging | production
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional, OAuth)
- `VITE_DATA_SERVICE_URL` — public API URL
- `VITE_API_TOKEN` — client-side API auth

## Don't

- Import `env` from 'cloudflare:workers' in client code (server only)
- Call data-service via public URL from server code — use `fetchDataService()`
- Put DB queries here — add to `@repo/data-ops/{domain}`
- Skip `enabled: !!id` on detail queries (prevents empty ID fetches)
- Use useState for URL-driven state — use `validateSearch` + `useNavigate`
- Use old `@repo/data-ops/queries/*` or `@repo/data-ops/zod-schema/*` paths
