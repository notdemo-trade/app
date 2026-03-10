# Cloudflare Agents SDK — Reference

## State Management

```ts
// Guard state transitions
validateStateChange(nextState: MyState, source: string | Connection) {
  if (!isValidTransition(this.state, nextState)) throw new Error("Invalid state transition")
}

// Post-change hook
onStateChanged(state: MyState, source: "server" | Connection) { }
```

## Callable Methods

```ts
@callable()
async doSomething(): Promise<Result> { ... }

@callable({ streaming: true })
async streamResults(stream: StreamingResponse, params: Params) {
  stream.send(chunk)
  stream.end(finalValue?)
}
```

`@callable()` is only for WS RPC from clients — not needed for server-side calls.

## Retry

```ts
const result = await this.retry(
  (attempt) => externalApi.call(params),
  { maxAttempts: 3, shouldRetry: (err) => err.status >= 500 }
)
```

Always use `shouldRetry` to skip 4xx errors. Options: `maxAttempts` (3), `baseDelayMs` (100), `maxDelayMs` (3000).

## Queue Tasks

```ts
const taskId = await this.queue("processItem", payload)
this.dequeue(taskId)
this.dequeueAll()
this.dequeueAllByCallback("processItem")
this.getQueues({ key: "type", value: "x" })
```

Callback: `async processItem(payload: unknown, queueItem: QueueItem): Promise<void>`

## Workflows

```ts
class MyWorkflow extends AgentWorkflow {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const data = await step.do('fetch-data', { retries: { limit: 3 } }, () => fetchData())

    const decision = await step.waitForEvent('approval', {
      type: 'user_approval',
      timeout: '15 minutes',
    })

    if (decision.payload.action === 'approve') {
      await step.do('execute', () => doAction(data))
    }
  }
}
```

Agent lifecycle callbacks: `onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError`, `onWorkflowEvent`

Control: `approveWorkflow`, `rejectWorkflow`, `terminateWorkflow`, `pauseWorkflow`, `resumeWorkflow`

## Scheduling

```ts
scheduleEvery(seconds, "methodName", payload)  // recurring, overlap prevention
schedule(when, "methodName", payload)          // one-off (seconds | Date | cron)
getSchedule(id)
cancelSchedule(id)
```

## Client SDK

```tsx
// React hook — auto-reconnect, state sync
import { useAgent } from "agents/react"
const agent = useAgent<MyAgent>({ agent: "MyAgent", name: instanceId })
// agent.state — auto-synced
// agent.stub.doSomething() — type-safe RPC

// Vanilla
import { AgentClient } from "agents/client"
const client = new AgentClient({ agent: "MyAgent", host: "api.example.com", name: instanceId })
```

## Observability

```ts
observability.emit({ type: "custom_event", displayMessage: "Something happened", ...payload })
```

Built-in types: `connect`, `disconnect`, `state:update`, `message`, `error`, `schedule:execute`, `queue:process`

## Readonly Connections

```ts
shouldConnectionBeReadonly(connection: Connection, ctx: ConnectionContext): boolean {
  return connection.metadata?.role === "viewer"
}
setConnectionReadonly(connection, true)
```

## AI Model Integration

```ts
// Workers AI
const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", { prompt })

// AI Gateway (multi-provider, caching)
const result = await env.AI.gateway("my-gateway").run(model, params)
```

## RAG / Vectorize

```ts
const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: query })
const results = await env.VECTOR_DB.query(embeddings, { topK: 5, returnMetadata: true })
```
