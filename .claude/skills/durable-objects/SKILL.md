---
name: durable-objects
description: Cloudflare Durable Objects class structure, storage, alarms, WebSockets, and wrangler migrations. Use when building raw Durable Object classes in apps/data-service/src/durable-objects (prefer cf-agents-sdk for new stateful services).
---

# Durable Objects

## Class Structure

```ts
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async increment(): Promise<number> {
    const value = (await this.ctx.storage.get<number>('count')) ?? 0
    await this.ctx.storage.put('count', value + 1)
    return value + 1
  }
}
```

## Accessing from Worker

```ts
const id = env.COUNTER.idFromName('global')   // named — shared state
const id = env.COUNTER.newUniqueId()           // unique — isolated
const stub = env.COUNTER.get(id)
const count = await stub.increment()
```

## Storage

```ts
// KV storage
await this.ctx.storage.get<T>(key)
await this.ctx.storage.put(key, value)

// Transactions
await this.ctx.storage.transaction(async (txn) => {
  const balance = await txn.get<number>('balance') ?? 0
  await txn.put('balance', balance - amount)
})

// SQLite (if enabled with new_sqlite_classes)
this.ctx.storage.sql
```

## Alarms

```ts
await this.ctx.storage.setAlarm(Date.now() + delayMs)

async alarm() {
  await this.sendReminder()
}
```

## WebSockets

```ts
async fetch(request: Request): Promise<Response> {
  const [client, server] = Object.values(new WebSocketPair())
  this.ctx.acceptWebSocket(server)
  return new Response(null, { status: 101, webSocket: client })
}

async webSocketMessage(ws: WebSocket, message: string) { }
```

## Wrangler Config

```jsonc
{
  "durable_objects": { "bindings": [{ "name": "COUNTER", "class_name": "Counter" }] },
  "migrations": [{ "tag": "v1", "new_classes": ["Counter"] }]
}
```
