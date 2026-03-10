---
name: cf-deploy
description: Cloudflare Workers deployment rules: hostname separation, custom domains, SSL/TLS config, and deploy scripts for Vite plugin builds. Use when deploying workers, configuring wrangler.jsonc routes, or debugging redirect loops.
---

# Cloudflare Deployment

## Hostname Rules

Each Worker MUST have its own subdomain:
- Frontend: `staging.example.com` / `example.com`
- API: `api-staging.example.com` / `api.example.com`

## Custom Domains (Preferred)

```jsonc
// Good: auto-creates DNS + SSL
"routes": [{ "pattern": "api.example.com", "custom_domain": true }]

// Fragile: requires manual DNS record to exist
"routes": [{ "pattern": "api.example.com/*", "zone_name": "example.com" }]
```

## SSL/TLS

- Zone SSL/TLS MUST be **Full** or **Full (strict)** — never Flexible
- NEVER use the "Redirect from HTTP to HTTPS" redirect rule template — causes 301 loops on Worker domains
- USE "Always Use HTTPS" in SSL/TLS → Edge Certificates instead

## Deploy Scripts

```jsonc
// data-service (standard wrangler)
"deploy:staging": "wrangler deploy --env staging"

// user-application (Vite plugin — env baked into build)
"build:staging": "vite build --mode staging",
"deploy:staging": "pnpm run build:staging && wrangler deploy --env=''"
```

## Debugging "Too Many Redirects"

1. `curl -sI https://domain/path` — check if 301 loops to same URL
2. If `server: cloudflare` with no app headers → Worker never reached
3. Check order: Redirect Rules → Page Rules → SSL mode → Worker binding
4. Disable redirect rules first — most common culprit
