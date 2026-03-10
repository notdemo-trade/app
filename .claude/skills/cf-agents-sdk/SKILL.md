---
name: cf-agents-sdk
description: Cloudflare Agents SDK for stateful agents with WebSocket, scheduling, queues, workflows, and SQLite. Use when building or extending Agent classes in apps/data-service/src/agents, or when implementing real-time state sync, durable scheduling, or multi-step workflows.
---

# Cloudflare Agents SDK

## Quick Start

```ts
import { Agent, callable } from "agents"

export class MyAgent extends Agent<Env, MyState> {
  initialState: MyState = { status: 'idle' }
  static options = { hibernate: true, retry: { maxAttempts: 3 } }

  async onStart(props?) { /* init or wake from hibernation */ }
}
```

## Core APIs

| API | Usage |
|-----|-------|
| `this.setState(s)` | Update + persist + broadcast to WS clients |
| `this.sql` | Per-instance SQLite |
| `@callable()` | Expose method to client via WS RPC |
| `this.retry(fn, opts)` | Jitter backoff for external calls |
| `this.queue("cb", payload)` | FIFO durable task queue |
| `scheduleEvery(s, "cb", p)` | Recurring schedule |
| `schedule(when, "cb", p)` | One-off schedule |
| `this.runWorkflow("name", p)` | Start a durable workflow |

## Entry Point (route before Hono)

```ts
import { routeAgentRequest } from "agents"

export default {
  async fetch(request, env, ctx) {
    const resp = await routeAgentRequest(request, env, {
      onBeforeConnect: async (req) => { /* auth check */ },
    })
    if (resp) return resp
    return app.fetch(request, env, ctx)
  },
}
```

## Server-Side RPC

```ts
import { getAgentByName } from "agents"
const agent = await getAgentByName<MyAgent>(env.MyAgent, instanceName)
await agent.someMethod(params)
```

## Wrangler Config

```jsonc
{
  "durable_objects": { "bindings": [{ "name": "MyAgent", "class_name": "MyAgent" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyAgent"] }]
}
```

Use `new_sqlite_classes` (not `new_classes`). Add `"nodejs_compat"` to `compatibility_flags`.

## Full Reference

See [REFERENCE.md](REFERENCE.md) for: state validation, callable streaming, workflow steps, client SDK, observability, readonly connections, MCP, AI integration.
