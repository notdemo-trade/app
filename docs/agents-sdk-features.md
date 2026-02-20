# Cloudflare Agents SDK — Complete Feature Reference

Trading app reference. Features marked **[USED]** are in Phase 12 design docs. Features marked **[NEW]** are not yet leveraged.

---

## 1. Core Agent Class

| Feature | Status | Description |
|---------|--------|-------------|
| `Agent<Env, State>` | **[USED]** | Base class. TradingAgent extends it |
| `initialState` | **[USED]** | Default state for new instances |
| `onStart(props?)` | **[USED]** | Lifecycle hook on start/wake. Props optional |
| `onRequest(request)` | **[NEW]** | HTTP handler on agent instance |
| `onConnect(conn, ctx)` | **[NEW]** | WS connect lifecycle |
| `onMessage(conn, msg)` | **[NEW]** | WS message handler |
| `onClose(conn, code, reason)` | **[NEW]** | WS disconnect handler |
| `onError(conn, err)` | **[NEW]** | WS error handler |
| `onEmail(email)` | **[NEW]** | Email routing handler (CF Email Workers) |
| `onStateChanged(state, source)` | **[NEW]** | Post-state-change hook. Source: `"server"` or Connection |
| `this.env` | **[USED]** | Worker env bindings |
| `this.ctx` | **[NEW]** | Execution context |
| `this.state` | **[USED]** | Current state (synced, persisted) |
| `this.sql` | **[USED]** | Per-instance SQLite |
| `this.name` | **[USED]** | Instance name (= userId) |

**Design Doc Impact**: `onRequest` useful for Phase 11 Telegram webhook direct-to-agent routing. `onEmail` could enable email-based approvals. `onConnect`/`onClose` useful for Phase 12 UI presence tracking.

---

## 2. State Management

| Feature | Status | Description |
|---------|--------|-------------|
| `setState(state)` | **[USED]** | Update + persist + broadcast to WS clients |
| `onStateChanged(state, source)` | **[NEW]** | Hook after state change. Source = `"server"` or Connection object |
| `validateStateChange(nextState, source)` | **[NEW]** | Synchronous validation. Throw to reject. Runs before persist |
| SQLite persistence | **[USED]** | State survives hibernation |
| WS broadcast | **[USED]** | All connected clients get state updates |
| Bidirectional sync | **[USED]** | Client `setState()` -> server -> other clients |
| `step.updateAgentState()` | **[NEW]** | Workflow step updates agent state |
| `step.mergeAgentState()` | **[NEW]** | Workflow step merges partial state |
| `step.resetAgentState()` | **[NEW]** | Workflow step resets to initialState |

**Design Doc Impact**: `validateStateChange` critical for Phase 12 — reject invalid state from client (e.g., client trying to set `enabled: true` bypassing `enable()` method). Workflow state ops useful for Phase 10 approval workflows.

---

## 3. Callable Methods (WS RPC)

| Feature | Status | Description |
|---------|--------|-------------|
| `@callable()` | **[USED]** | Expose method via WS RPC |
| `@callable({ streaming: true })` | **[USED]** | Streaming response via `StreamingResponse.send()/end()` |
| `agent.stub.method()` | **[USED]** | Client type-safe invocation |
| `agent.call("method", args, opts)` | **[USED]** | Client dynamic invocation with streaming callbacks |
| `onChunk`, `onDone`, `onError` | **[USED]** | Streaming consumption callbacks |

**Design Doc Impact**: Fully used in Phase 12.

---

## 4. Scheduling

| Feature | Status | Description |
|---------|--------|-------------|
| `schedule(delay\|Date\|cron, "method", payload)` | **[USED]** | One-off or cron schedule |
| `scheduleEvery(seconds, "method", payload)` | **[USED]** | Recurring with overlap prevention |
| `getSchedule(id)` | **[NEW]** | Query single schedule |
| `getSchedules(criteria)` | **[USED]** | Query all schedules |
| `cancelSchedule(id)` | **[USED]** | Remove pending schedule |
| `getSchedulePrompt()` | **[NEW]** | Returns system prompt for AI-assisted natural language scheduling |
| `scheduleSchema` | **[NEW]** | Zod schema for schedule validation |

**Design Doc Impact**: `getSchedulePrompt()` + `scheduleSchema` could let users configure agent schedules via natural language in Phase 12 UI. E.g., "run analysis every weekday at market open."

---

## 5. Queue Tasks [NEW]

Async task queue. FIFO, sequential, SQLite-persisted, auto-processed, auto-dequeued on success.

| Feature | Description |
|---------|-------------|
| `queue("callbackMethod", payload)` | Enqueue async task, returns ID |
| `dequeue(id)` | Remove by ID |
| `dequeueAll()` | Clear queue |
| `dequeueAllByCallback("method")` | Remove all tasks for a callback |
| `getQueue(id)` | Get single task |
| `getQueues({ key, value })` | Filter by payload field |
| Retry with exponential backoff | Auto-retry failed tasks |

**Design Doc Impact**: Phase 12 could queue trade executions instead of inline `await executeOrder()`. Benefits: retry on Alpaca API failure, sequential processing prevents race conditions on position sizing, dequeue pending orders on agent disable.

---

## 6. Retry APIs [NEW]

General-purpose retry for any async operation.

| Feature | Description |
|---------|-------------|
| `this.retry(fn, options?)` | Retry wrapper with exponential backoff |
| `maxAttempts` | Default 3 |
| `baseDelayMs` | Default 100ms |
| `maxDelayMs` | Default 3000ms |
| `shouldRetry(err, nextAttempt)` | Predicate to stop early |
| Full jitter | `random(0, min(2^attempt * base, max))` |
| Class-level defaults | `static options = { retry: { maxAttempts: 5 } }` |
| Applies to | `schedule()`, `scheduleEvery()`, `queue()`, `addMcpServer()` |

**Design Doc Impact**: Phase 12 `executeOrder()` and `gatherSignals()` should use `this.retry()` for Alpaca/data API resilience. Phase 16 Telegram notification dispatch should retry on HTTP failure.

---

## 7. Workflows Integration [NEW]

Full workflow orchestration within agent context.

| Feature | Description |
|---------|-------------|
| `runWorkflow(name, params, opts?)` | Start workflow, returns instance ID |
| `getWorkflowStatus(name, id)` | Status monitoring |
| `getWorkflow(id)`, `getWorkflows(criteria?)` | Query with pagination |
| `sendWorkflowEvent(name, id, event)` | Send event to running workflow |
| `terminateWorkflow(id)` | Force stop |
| `pauseWorkflow(id)`, `resumeWorkflow(id)` | Suspend/resume |
| `restartWorkflow(id)` | Re-run from start |
| `approveWorkflow(id)`, `rejectWorkflow(id)` | Approval/rejection |
| `deleteWorkflow(id)`, `deleteWorkflows(criteria?)` | Cleanup |
| `AgentWorkflow` class | Workflow definition |
| `reportProgress()` | Progress reporting to clients |
| `broadcastToClients()` | Push updates to connected WS clients |
| `waitForApproval(step)` | Pause for external approval |
| `step.reportComplete()`, `step.reportError()` | Step lifecycle |
| `step.sendEvent()` | Inter-step events |
| `step.updateAgentState()`, `step.mergeAgentState()`, `step.resetAgentState()` | Mutate agent state from workflow |
| `onWorkflowProgress` | Callback: progress update |
| `onWorkflowComplete` | Callback: workflow done |
| `onWorkflowError` | Callback: workflow failed |
| `onWorkflowEvent` | Callback: custom event |
| `onWorkflowCallback` | Callback: workflow callback |

**Design Doc Impact**: Phase 10/12 trade approval could be a workflow: `analyzeSignal -> proposeOrder -> waitForApproval -> executeOrder`. Replaces current polling-based approval timeout with native `waitForApproval()`. Phase 11 Telegram approval maps directly to `approveWorkflow(id)`/`rejectWorkflow(id)`.

---

## 8. Human-in-the-Loop [NEW — enhanced]

| Feature | Description |
|---------|-------------|
| `waitForApproval()` | Pause workflow for hours/days/weeks |
| `approveWorkflow(id)`, `rejectWorkflow(id)` | External decision API |
| MCP `elicitInput()` | Form-based mid-execution data collection |
| DO state consistency | State persists during review periods |
| Timeout strategy | Scheduled reminders, escalations, auto-decisions |

**Design Doc Impact**: Direct replacement for Phase 10/11 approval timeout mechanism. Current design uses `processExpiredApprovals()` on 60s schedule + SQLite `approval_timeouts` table. Workflow-based HITL is cleaner: `waitForApproval()` with built-in timeout -> auto-reject. Eliminates custom timeout tracking.

---

## 9. MCP Support [NEW]

Model Context Protocol — agent as tool server + tool client.

| Feature | Description |
|---------|-------------|
| MCP Handler | Agent serves as MCP server, exposes tools to LLM clients |
| `addMcpServer(config)` | Connect to external MCP server |
| `removeMcpServer(id)` | Disconnect |
| `getMcpServers()` | List connected servers |
| Tool discovery | Auto-discover tools from connected servers |
| Parameter validation | JSON Schema validation |
| State across invocations | Persistent tool state |

**Design Doc Impact**: Phase 6 LLM could use MCP tools exposed by TradingAgent (getPortfolio, getSignals, submitOrder). Phase 12 agent could connect to external MCP servers for market data, news analysis.

---

## 10. RAG / Vectorize [NEW]

Vector search + embeddings for retrieval-augmented generation.

| Feature | Description |
|---------|-------------|
| `this.env.VECTOR_DB.query({ topK, returnMetadata })` | Vector similarity search |
| `this.env.AI.run("@cf/baai/bge-base-en-v1.5")` | Generate embeddings |
| SQL + vector metadata mapping | Hybrid search |
| Wrangler `vectorize` binding | Config |

**Design Doc Impact**: Phase 6 LLM analysis could use RAG over historical trade outcomes, news articles, research reports. Agent could embed and retrieve relevant past analyses for context.

---

## 11. AI Model Integration [NEW — enhanced]

| Feature | Description |
|---------|-------------|
| `env.AI.run()` | Workers AI native binding with streaming |
| AI Gateway | Model routing + fallback between providers |
| Multi-provider | Workers AI, Vercel AI SDK, OpenAI, Anthropic, Gemini, any OpenAI-compatible |
| SSE + WebSocket streaming | Response streaming |
| State persistence | Store AI responses via `setState()` |

**Design Doc Impact**: Phase 6 already uses Vercel AI SDK multi-provider. Workers AI adds a free/cheap fallback option. AI Gateway could add rate limiting, caching, analytics for LLM calls.

---

## 12. Web Browsing [NEW]

| Feature | Description |
|---------|-------------|
| Browser Rendering API | Headless browser via `@cloudflare/puppeteer` |
| DOM parsing | Content extraction |
| Page interaction | Click, type, navigate |
| AI content analysis | LLM + browser |
| Browserbase | Third-party integration option |

**Design Doc Impact**: Phase 6 LLM could scrape SEC filings, earnings reports, financial news sites for deeper analysis context.

---

## 13. Observability [NEW]

| Feature | Description |
|---------|-------------|
| `observability.emit(event)` | Emit agent events |
| Event types | `connect`, `disconnect`, `state:update`, `message`, `error`, `schedule:execute`, `queue:process` |
| Event structure | `{ id, type, displayMessage, timestamp, ...payload }` |
| Default: `console.log()` | Custom: override with `Observability` interface |
| Disable: set `undefined` | Opt-out |
| External integration | Ship to any logging service |

**Design Doc Impact**: All phases. Agent activity log (Phase 12) could use observability events instead of manual `logActivity()`. Phase 16 notifications could hook into observability events for automated alerting.

---

## 14. Readonly Connections [NEW]

| Feature | Description |
|---------|-------------|
| `shouldConnectionBeReadonly(conn, ctx)` | Hook on connect, return boolean |
| `setConnectionReadonly(conn, readonly)` | Dynamic toggle |
| `isConnectionReadonly(conn)` | Check status |
| `onStateUpdateError(error)` | Client callback on rejection |
| Behavior | Readonly clients receive state but cannot modify it |
| RPC | Can call methods that don't modify state |

**Design Doc Impact**: Phase 12 UI could have admin view (readonly) vs user view (read-write). Shared dashboards where viewers see agent state but can't enable/disable.

---

## 15. Client SDK

| Feature | Status | Description |
|---------|--------|-------------|
| `useAgent(options)` | **[USED]** | React hook, auto-reconnect, state sync |
| `AgentClient` | **[NEW]** | Vanilla JS/TS client (non-React) |
| `agentFetch` | **[NEW]** | HTTP one-off requests (no WS) |
| `setState()` | **[USED]** | Client-side state update |
| `call()`, `stub` | **[USED]** | RPC invocation |
| `send()`, `close()`, `reconnect()` | **[NEW]** | WS lifecycle control |
| `onStateUpdate` | **[USED]** | State change callback |
| `onMcpUpdate` | **[NEW]** | MCP state change callback |
| `onOpen`, `onClose`, `onError`, `onMessage` | **[NEW]** | WS lifecycle callbacks |
| Options: `query`, `queryDeps`, `cacheTtl` | **[NEW]** | Query params, dep-based reconnect, cache |

**Design Doc Impact**: `agentFetch` useful for Phase 11 Telegram webhook — HTTP call to agent without WS. `AgentClient` useful for Phase 16 server-side notification dispatch.

---

## 16. Routing

| Feature | Status | Description |
|---------|--------|-------------|
| `routeAgentRequest(request, env, options?)` | **[USED]** | Auto-route `/agents/{name}/{instance}` |
| `getAgentByName(ns, name, opts?)` | **[USED]** | Server-side RPC |
| `getCurrentAgent()` | **[NEW]** | Runtime agent retrieval (inside agent context) |
| Options: `basePath` | **[NEW]** | Custom route prefix |
| Options: `cors` | **[NEW]** | CORS config |
| Options: `locationHint` | **[NEW]** | DO placement hint (region) |
| Options: `jurisdiction` | **[NEW]** | Data residency (EU) |
| Options: `props` | **[NEW]** | Pass data to `onStart(props)` |
| `onBeforeConnect` | **[NEW]** | Auth hook before WS upgrade |
| `onBeforeRequest` | **[NEW]** | Auth hook before HTTP |

**Design Doc Impact**: `onBeforeConnect` / `onBeforeRequest` critical for Phase 12 — authenticate WS connections before agent access. Currently no auth on WS route. `locationHint` useful for latency optimization (agent near user's broker). `props` could pass initial config on first agent creation.

---

## 17. Configuration

| Feature | Status | Description |
|---------|--------|-------------|
| `compatibility_flags: ["nodejs_compat"]` | **[USED]** | Required |
| `durable_objects.bindings` | **[USED]** | DO binding config |
| `migrations` + `new_sqlite_classes` | **[USED]** | SQLite migration tag |
| `static options = { hibernate: true }` | **[NEW]** | Class-level hibernate config |
| `static options = { retry: {...} }` | **[NEW]** | Class-level retry defaults |
| Multi-environment | **[USED]** | Staging/production wrangler envs |

**Design Doc Impact**: `hibernate: true` should be set for TradingAgent — reduces costs when agent is idle. `retry` defaults eliminate per-call retry config.

---

## Priority Matrix — NEW Features by Phase Impact

| Feature | Phase 12 (Agent) | Phase 10 (Approval) | Phase 11 (Telegram) | Phase 6 (LLM) | Phase 16 (Notif) |
|---------|:-:|:-:|:-:|:-:|:-:|
| Queue Tasks | HIGH | - | - | - | MED |
| Retry APIs | HIGH | - | MED | MED | HIGH |
| Workflows | HIGH | HIGH | HIGH | - | - |
| HITL (waitForApproval) | HIGH | HIGH | HIGH | - | - |
| validateStateChange | HIGH | - | - | - | - |
| onBeforeConnect/Request | HIGH | - | - | - | - |
| Observability | MED | - | - | - | HIGH |
| MCP Support | MED | - | - | HIGH | - |
| Readonly Connections | LOW | - | - | - | - |
| RAG / Vectorize | - | - | - | HIGH | - |
| AI Gateway | - | - | - | MED | - |
| Web Browsing | - | - | - | LOW | - |
| agentFetch | - | - | MED | - | MED |
| getSchedulePrompt | LOW | - | - | - | - |
| onEmail | - | - | LOW | - | LOW |

---

## Top Recommendations

1. **Adopt `this.retry()`** — wrap `executeOrder()`, `gatherSignals()`, Telegram API calls. Zero-effort resilience
2. **Add `onBeforeConnect`** — Phase 12 WS connections currently unauthenticated
3. **Add `validateStateChange`** — prevent client-side state injection
4. **Evaluate Workflows + HITL** — replaces custom approval timeout mechanism (60s polling + SQLite `approval_timeouts`). Cleaner, built-in timeout, native approve/reject API
5. **Queue trade executions** — sequential processing, built-in retry, prevents position sizing races
6. **Set `static options = { hibernate: true }`** — cost savings for idle agents
