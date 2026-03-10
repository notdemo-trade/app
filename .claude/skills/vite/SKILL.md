---
name: vite
description: Vite config with Cloudflare plugin, build modes, environment variables, and path aliases for user-application. Use when configuring vite.config.ts, build scripts, or troubleshooting env variable access.
---

# Vite (Cloudflare Plugin)

## Config

```ts
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [cloudflare()],
})
```

The plugin reads all env blocks from `wrangler.jsonc` automatically — no `CLOUDFLARE_ENV` needed.

## Build Modes

```bash
vite build --mode staging      # bakes staging bindings into output
vite build --mode production   # bakes production config
wrangler deploy --env=''       # deploys pre-configured build (env already embedded)
```

## Environment Variables

| Location | Access | Example |
|----------|--------|---------|
| Client code | `import.meta.env.VITE_*` | `VITE_API_URL` |
| Server (Worker) | `env` from `cloudflare:workers` | `env.SECRET` |

- `VITE_*` prefix → exposed to client
- Non-prefixed → server only
- Never use `process.env`

## Path Aliases

```ts
// tsconfig.json
"paths": { "@/*": ["./src/*"] }
```

Resolved by Vite automatically.

## Don'ts

- Don't import `cloudflare:workers` in client components
- Don't bundle large deps client-side — use dynamic imports
- Don't use `process.env` anywhere
