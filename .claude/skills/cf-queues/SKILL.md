---
name: cf-queues
description: Cloudflare Queues producer/consumer patterns and Workflows with durable steps. Use when publishing messages to queues, consuming batches, or building multi-step durable workflows in apps/data-service.
---

# Cloudflare Queues & Workflows

## Queue Producer

```ts
interface UserCreatedMessage {
  type: 'user.created'
  userId: string
  timestamp: number
}

await env.MY_QUEUE.send({
  type: 'user.created',
  userId: user.id,
  timestamp: Date.now(),
} satisfies UserCreatedMessage)
```

## Queue Consumer

```ts
export default {
  async queue(batch: MessageBatch<UserCreatedMessage>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processMessage(msg.body, env)
        msg.ack()
      } catch (err) {
        msg.retry() // auto-retries, 4-day retention
      }
    }
  },
}
```

Config in `wrangler.jsonc`: `max_batch_size` (default 10), `max_batch_timeout` (default 5s).

## Workflows

```ts
import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers'

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const user = await step.do('fetch-user', async () => fetchUser(event.payload.userId))

    await step.do('send-email', { retries: { limit: 3, delay: '5 seconds' } }, async () => {
      return sendWelcomeEmail(user.email)
    })
  }
}
```

## Step Design Rule

Ask: "If this fails, should everything re-run?"
- No → separate `step.do()`
- External API call → own step
- DB write → own step
- Pure computation → can combine

`step.sleep(name, duration)` — pause between rate-limited ops
`step.waitForEvent(name, opts)` — pause for external trigger
