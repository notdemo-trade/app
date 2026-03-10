---
name: cf-storage
description: Cloudflare KV and R2 storage patterns, key naming, and wrangler binding config. Use when reading/writing KV or R2 in apps/data-service or configuring storage bindings.
---

# Cloudflare Storage (KV & R2)

## KV — Use For

Read-heavy workloads: config, routing tables, cache. Eventually consistent — not for real-time sync.

## KV Patterns

```ts
const value = await env.MY_KV.get('user:123')
const data = await env.MY_KV.get('config', { type: 'json' })

await env.MY_KV.put('session:abc', JSON.stringify(session), {
  expirationTtl: 60 * 60 * 24, // 24h TTL
})

await env.MY_KV.delete('user:123')
const { keys } = await env.MY_KV.list({ prefix: 'user:' })
```

Key naming: `user:`, `session:`, `config:` prefixes. Cache busting: `cache:v2:posts`.

## R2 — Use For

Large files (images, documents, backups). S3-compatible, no egress fees.

## R2 Patterns

```ts
await env.MY_BUCKET.put('uploads/image.png', imageData, {
  httpMetadata: { contentType: 'image/png' },
})

const object = await env.MY_BUCKET.get('uploads/image.png')
if (object) {
  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
  })
}

await env.MY_BUCKET.delete('uploads/image.png')
const { objects } = await env.MY_BUCKET.list({ prefix: 'uploads/' })
```

Key naming: `users/{userId}/avatar.png`, `files/{hash}.pdf`

## Binding Config (wrangler.jsonc)

```jsonc
{
  "kv_namespaces": [{ "binding": "MY_KV", "id": "xxx" }],
  "r2_buckets": [{ "binding": "MY_BUCKET", "bucket_name": "my-bucket" }]
}
```
