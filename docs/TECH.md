# SaaS-on-CF (Software as a Service on Cloudflare)

Modular web application template

## Architecture

Monorepo using [pnpm workspace](https://pnpm.io/workspaces) with modular packages shared across apps:

- [apps/user-application](./apps/user-application/) - TanStack Start consumer-facing app
- [apps/data-service](./apps/data-service/) - Backend service for long-running tasks
- [packages/data-ops](./packages/data-ops/) - Shared DB layer (schemas, queries, auth)

Stack: 

- [Better Auth](https://www.better-auth.com/docs/introduction), 
- [Drizzle ORM](https://orm.drizzle.team/docs/overview), 
- [Cloudflare Workers](https://developers.cloudflare.com/workers/), 
- [Neon Postgres](https://neon.tech).

## [packages/data-ops](./packages/data-ops/)

Central shared package for all database operations. Both apps consume this package for type-safe DB access.

**Purpose**: Single source of truth for database schemas, queries, validations, and auth config.

### Directory Structure (domain-barrel)

Each domain gets its own directory with co-located table, schema, queries, and barrel export:

```
src/
├── {domain}/             # one dir per domain
│   ├── table.ts          # Drizzle table definition
│   ├── schema.ts         # Zod schemas + types
│   ├── queries.ts        # DB operations
│   └── index.ts          # barrel re-export
├── drizzle/
│   ├── schema.ts         # imports all domain tables
│   ├── auth-schema.ts    # Better Auth tables (auto-generated, don't edit)
│   ├── relations.ts      # Drizzle relational queries config
│   └── migrations/{env}/ # Migration history per environment
├── database/
│   ├── setup.ts          # DB client initialization (getDb())
│   └── seed/             # Data seeding utilities
└── auth/
    ├── setup.ts          # Auth config (providers, plugins)
    └── server.ts         # Auth server instance
```

**Usage**: Import from domain barrel — queries, schemas, and types from a single path.

```ts
import { checkDatabase } from "@repo/data-ops/health";
import type { DatabaseStatus } from "@repo/data-ops/health";
```

**Zod naming conventions:**

| Purpose      | Suffix         | Example                 |
|--------------|----------------|-------------------------|
| Domain model | Schema         | UserSchema              |
| Request      | RequestSchema  | UserCreateRequestSchema |
| Response     | ResponseSchema | UserListResponseSchema  |
| Type         | no suffix      | User, UserCreateInput   |

### Workflow for New DB Features

1. **Create domain dir** `src/{domain}/` with `table.ts`, `schema.ts`, `queries.ts`, `index.ts`
2. **Import table** into `src/drizzle/schema.ts`
3. **Add relations** to `src/drizzle/relations.ts` (if needed)
4. **Add export** to `package.json`: `"./{domain}": { "types": "./dist/{domain}/index.d.ts", "default": "./dist/{domain}/index.js" }`
5. **Generate migration**: `pnpm run drizzle:dev:generate`
6. **Apply migration**: `pnpm run drizzle:dev:migrate`
7. **Rebuild package**: `pnpm run build:data-ops`
8. **Import in apps**: Use `@repo/data-ops/{domain}` from both apps

## Error Handling

**Backend (data-service)**: Services return `Result<T>` (never throw). Handlers unwrap via `resultToResponse()`. Error class: `AppError` from `types/result.ts`.

**Frontend (user-application)**: `AppError` in `core/errors.ts`, thrown by `api-client.ts` on non-2xx responses. Display via `mutation.error.message`.

## Linting

```bash
pnpm run lint          # check
pnpm run lint:fix      # autofix
```

Uses [Biome](https://biomejs.dev/) v2 with GritQL plugins (`.biome-plugins/`).

## Setup

```bash
pnpm run setup
```

Installs all dependencies and builds data-ops package.

## Development

```bash
pnpm run dev:user-application  # TanStack Start app (port 3000)
pnpm run dev:data-service      # Hono backend service (port 8788)
```

### Database Migrations

From `packages/data-ops/` directory:

```bash
pnpm run drizzle:dev:generate  # Generate migration
pnpm run drizzle:dev:migrate   # Apply to database
```

Replace `dev` with `staging` or `production`. Migrations stored in `src/drizzle/migrations/{env}/`.

### Environment Variables

Config files in `packages/data-ops/`:
- `.env.dev` - Local development
- `.env.staging` - Staging
- `.env.production` - Production

Replace `dev` with `staging` or `production`.

Sample `.env` file with minimum number of values available - [.env.example](./packages/data-ops/.env.example)

**Note**: `user-application` uses `.env` / `.env.staging` / `.env.production`. `data-service` uses Wrangler-style `.dev.vars` / `.staging.vars` / `.production.vars`.

**Required secrets**:
- `APPROVAL_SECRET` - HMAC key for signing approval tokens (Phase 10). Generate: `openssl rand -hex 32`. Required in all environments.

## Deployment

### Cloudflare Account Configuration

If you want to deploy to a different Cloudflare account that is not logged in globally on your machine, prepare a `.env` file in the main directory with values from `.env.example`. This allows you to specify account credentials for deployment without changing your global Cloudflare configuration.

### User Application

Once the deployment is done, Cloudflare will response with URL to view the deployment. If you want to change the name associated with Worker, do so by changing the `name` in the [wrangler.jsonc](./apps/user-application/wrangler.jsonc) file.

You can also use your own domain names associated with Cloudflare account by adding a route to this file as well.

#### Staging Environment

```bash
pnpm run deploy:staging:user-application
```

This will deploy the [user-application](./apps/user-application/) to Cloudflare Workers into staging environment.

#### Production Environment

```bash
pnpm run deploy:production:user-application
```

This will deploy the [user-application](./apps/user-application/) to Cloudflare Workers into production environment.

### Data Service

Once the deployment is done, Cloudflare will response with URL to view the deployment. If you want to change the name associated with Worker, do so by changing the `name` in the [wrangler.jsonc](./apps/data-service/wrangler.jsonc) file.

You can also use your own domain names associated with Cloudflare account by adding a route to this file as well.

#### Staging Environment

```bash
pnpm run deploy:staging:data-service
```

This will deploy the [data-service](./apps/data-service/) to Cloudflare Workers into staging environment.

#### Production Environment

```bash
pnpm run deploy:production:data-service
```

This will deploy the [data-service](./apps/data-service/) to Cloudflare Workers into production environment.