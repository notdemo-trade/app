---
paths:
  - "apps/data-service/src/workflows/**"
  - "apps/data-service/src/durable-objects/**"
---

# Agent Workflows Rules

## Cloudflare Agents SDK

Use for stateful, long-running processes that need coordination.

### When to Use

- Multi-step workflows with retries and rollback
- Real-time state sync (WebSocket)
- Scheduled/recurring tasks with state
- Human-in-the-loop approval flows

### Agent Class Pattern

```ts
import { Agent } from 'agents-sdk';

export class MyAgent extends Agent<Env, AgentState> {
  initialState: AgentState = { status: 'idle' };

  async onMessage(message: string) {
    const parsed = JSON.parse(message);
    // handle message, update state
    this.setState({ ...this.state, status: 'processing' });
  }
}
```

### Workflow Steps

```ts
async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
  const data = await step.do('fetch-data', async () => {
    return fetchExternalData(event.payload);
  });

  await step.sleep('cooldown', '30 seconds');

  await step.do('process', async () => {
    return processData(data);
  });
}
```

### Key Rules

- Each `step.do()` is retried independently on failure
- Steps must be idempotent — same input → same output
- Use `step.sleep()` between rate-limited operations
- Store intermediate state in step return values, not globals
