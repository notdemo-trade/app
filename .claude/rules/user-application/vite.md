---
paths:
  - "apps/user-application/**"
---

# Vite Rules

## Cloudflare Plugin

`@cloudflare/vite-plugin` reads `wrangler.jsonc` env blocks automatically.

```ts
// vite.config.ts
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
});
```

## Build Modes

- `vite build --mode staging` → bakes staging bindings/routes into output
- `vite build --mode production` → bakes production config
- `wrangler deploy --env=''` → deploys pre-configured build (env already embedded)

## Environment Variables

- `VITE_*` prefix → exposed to client code
- Non-prefixed → server only
- Access via `import.meta.env.VITE_*` in client
- Access via `env` from `cloudflare:workers` on server

## Dev Server

- Port 3000 by default
- Hot module replacement enabled
- Service bindings simulated locally via wrangler

## Path Aliases

```ts
// tsconfig.json
"paths": { "@/*": ["./src/*"] }
```

Resolved by Vite automatically.

## Don't

- Import `cloudflare:workers` in client components
- Use `process.env` — use `import.meta.env` (client) or `env` binding (server)
- Bundle large dependencies client-side — use dynamic imports
