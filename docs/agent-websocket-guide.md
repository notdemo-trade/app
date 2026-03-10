# Agent WebSocket RPC Guide

Connect to any agent via WebSocket and invoke `@callable()` methods using the RPC protocol.

## Connection

```
ws://localhost:8788/agents/<agent-kebab-name>/<instance-name>
wss://api.notdemo.trade/agents/<agent-kebab-name>/<instance-name>
```

### Instance naming conventions

| Pattern | Used by | Example |
|---------|---------|---------|
| `{userId}` | SessionAgent, AlpacaBrokerAgent, DataSchedulerAgent | `tkowalczyk` |
| `{userId}:{symbol}` | TechnicalAnalysisAgent, AlpacaMarketDataAgent, LLMAnalysisAgent, DebateOrchestratorAgent, PipelineOrchestratorAgent, AlphaVantageDataAgent | `tkowalczyk:AAPL` |
| `global` | EarningsAgent, FundamentalsAgent, MarketIntelligenceAgent | `global` |

### Quick connect (wscat)

```bash
npm i -g wscat
wscat -c ws://localhost:8788/agents/session-agent/tkowalczyk
```

## RPC Protocol

Send JSON messages over the WebSocket to call `@callable()` methods:

```json
{
  "type": "cf_agent_rpc",
  "id": "unique-request-id",
  "method": "methodName",
  "args": [arg1, arg2]
}
```

Response:

```json
{
  "type": "cf_agent_rpc",
  "id": "unique-request-id",
  "result": { ... },
  "success": true
}
```

State updates are pushed automatically:

```json
{
  "type": "cf_agent_state",
  "state": { ... }
}
```

## Authentication

**Current status: Agent WebSocket connections are unauthenticated.**

`routeAgentRequest()` in `index.ts` has no `onBeforeConnect` hook — anyone who knows the instance name can connect. The HTTP REST API uses Bearer token auth (`Authorization: Bearer <token>`) via `apiTokenMiddleware`, but this does not apply to WebSocket agent routes.

For testing this is fine. For production, the `onBeforeConnect` hook should validate the API token from a query parameter or header.

---

## Agents Reference

### SessionAgent

```
ws://localhost:8788/agents/session-agent/{userId}
```

Base: `AIChatAgent` — supports both RPC and chat messages.

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `start` | — | `SessionState` |
| `stop` | — | `SessionState` |
| `updateConfig` | `partial: Partial<SessionConfig>` | `SessionConfig` |
| `getConfig` | — | `SessionConfig` |
| `getStatus` | — | `SessionState` |
| `triggerAnalysis` | — | `{ threadIds: string[]; skipReason?: string }` |
| `getThreads` | `limit?: number` | `DiscussionThread[]` |
| `getThread` | `threadId: string` | `DiscussionThread \| null` |
| `getProposals` | `status?: string` | `TradeProposal[]` |
| `approveProposal` | `proposalId: string` | `{ status: string; message: string }` |
| `rejectProposal` | `proposalId: string` | `{ status: string; message: string }` |
| `retryProposal` | `proposalId: string` | `{ status: string; message: string }` |
| `resetData` | — | `ResetResult` (must be stopped first) |
| `getOutcomes` | `status?: string` | `ProposalOutcome[]` |
| `getOutcomeSnapshots` | `outcomeId: string` | `OutcomeSnapshot[]` |

#### Chat messages

SessionAgent also accepts chat via the AIChatAgent protocol:

```json
{ "type": "cf_agent_chat", "message": "What's the latest analysis on AAPL?" }
```

#### Examples

```json
// Get current status
{"type":"cf_agent_rpc","id":"1","method":"getStatus","args":[]}

// Start autonomous analysis
{"type":"cf_agent_rpc","id":"2","method":"start","args":[]}

// Get pending proposals
{"type":"cf_agent_rpc","id":"3","method":"getProposals","args":["pending"]}

// Approve a trade
{"type":"cf_agent_rpc","id":"4","method":"approveProposal","args":["proposal-uuid-here"]}

// Update config
{"type":"cf_agent_rpc","id":"5","method":"updateConfig","args":[{"analysisIntervalSec":300}]}

// Get discussion threads
{"type":"cf_agent_rpc","id":"6","method":"getThreads","args":[5]}
```

#### State shape

```ts
{
  enabled: boolean
  lastCycleAt: number | null
  cycleCount: number
  analysisIntervalSec: number
  activeThreadId: string | null
  activeThread: DiscussionThread | null
  pendingProposalCount: number
  errorCount: number
  lastError: string | null
  lastSkipReason: string | null
}
```

---

### TechnicalAnalysisAgent

```
ws://localhost:8788/agents/technical-analysis-agent/{userId}:{symbol}
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `analyze` | `timeframe?: Timeframe, bars?: Bar[], configOverride?: TechnicalAnalysisConfig` | `AnalysisResult` |
| `getSignals` | `since?: string` | `TechnicalSignal[]` |
| `getIndicators` | — | `TechnicalIndicators \| null` |

#### Examples

```json
// Run technical analysis
{"type":"cf_agent_rpc","id":"1","method":"analyze","args":["1Day"]}

// Get latest signals
{"type":"cf_agent_rpc","id":"2","method":"getSignals","args":[]}

// Get computed indicators
{"type":"cf_agent_rpc","id":"3","method":"getIndicators","args":[]}
```

#### State shape

```ts
{
  lastComputeAt: string | null
  symbol: string
  latestPrice: number | null
  signalCount: number
  errorCount: number
  lastError: string | null
}
```

---

### LLMAnalysisAgent

```
ws://localhost:8788/agents/llm-analysis-agent/{userId}:{symbol}
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `analyze` | `request: AnalysisRequest, llmPrefs?, portfolioContext?` | `LLMAnalysisResult` |
| `classifyEvent` | `rawContent: string, llmPrefs?` | `ClassifyEventResult` |
| `generateReport` | `symbol: string, context: Record<string, unknown>, llmPrefs?` | `GenerateReportResult` |
| `getUsage` | `days?: number` | `UsageSummaryResult` |
| `analyzeAsPersona` | `persona, data, strategy, performanceContext?, llmPrefs?` | `PersonaAnalysis` |
| `runDebateRound` | `session, roundNumber, personas, llmPrefs?` | `DebateRound` |
| `synthesizeConsensus` | `analyses, debateRounds, moderatorPrompt, ...` | `ConsensusResult` |
| `validateRisk` | `symbol, recommendation, portfolio, llmPrefs?, portfolioContext?` | `RiskValidation` |
| `setProviderConfig` | `{ provider: LLMProviderName, model: string }` | `void` |

#### Examples

```json
// Get token usage
{"type":"cf_agent_rpc","id":"1","method":"getUsage","args":[7]}

// Set LLM provider
{"type":"cf_agent_rpc","id":"2","method":"setProviderConfig","args":[{"provider":"anthropic","model":"claude-sonnet-4-20250514"}]}
```

#### State shape

```ts
{
  totalAnalyses: number
  totalTokens: number
  totalCostUsd: number
  lastAnalysisAt: string | null
  errorCount: number
  lastError: string | null
}
```

---

### DebateOrchestratorAgent

```
ws://localhost:8788/agents/debate-orchestrator-agent/{userId}:{symbol}
```

`runDebate()` is a public method (not callable via RPC — invoked internally by PipelineOrchestratorAgent).

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `recordPersonaOutcome` | `proposalId, debateSessionId, outcome` | `void` |
| `getPersonaScores` | `windowDays: ScoreWindow` | `PersonaScore[]` |
| `getPersonaPatterns` | `personaId: string, symbol?: string` | `PersonaPattern[]` |

#### Examples

```json
// Get persona performance (30-day window)
{"type":"cf_agent_rpc","id":"1","method":"getPersonaScores","args":[30]}

// Get patterns for a persona
{"type":"cf_agent_rpc","id":"2","method":"getPersonaPatterns","args":["conservative-fundamentalist"]}
```

#### State shape

```ts
{
  activeDebateId: string | null
  totalDebates: number
  errorCount: number
  lastError: string | null
}
```

---

### PipelineOrchestratorAgent

```
ws://localhost:8788/agents/pipeline-orchestrator-agent/{userId}:{symbol}
```

`runPipeline()` is a public method (not callable via RPC — invoked internally by SessionAgent).

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `recordStepOutcome` | `proposalId, pipelineSessionId, outcome` | `void` |
| `getPipelineScores` | `windowDays: ScoreWindow` | `PipelineScore[]` |

#### Examples

```json
// Get strategy scores (90-day window)
{"type":"cf_agent_rpc","id":"1","method":"getPipelineScores","args":[90]}
```

#### State shape

```ts
{
  activePipelineId: string | null
  totalPipelines: number
  errorCount: number
  lastError: string | null
}
```

---

### DataSchedulerAgent

```
ws://localhost:8788/agents/data-scheduler-agent/{userId}
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `startScheduling` | — | `{ status: string }` |
| `stopScheduling` | — | `{ status: string }` |
| `fetchEnrichmentNow` | `symbol: string` | `{ fundamentals, insiderTrades, institutionalHoldings, earnings }` |

#### Examples

```json
// Start the scheduler
{"type":"cf_agent_rpc","id":"1","method":"startScheduling","args":[]}

// Manually fetch enrichment data
{"type":"cf_agent_rpc","id":"2","method":"fetchEnrichmentNow","args":["AAPL"]}
```

#### State shape

```ts
{
  isRunning: boolean
  lastScheduleAt: number | null
  totalCyclesRun: number
  errorCount: number
  lastError: string | null
}
```

---

### AlphaVantageDataAgent

```
ws://localhost:8788/agents/alpha-vantage-data-agent/{userId}:{symbol}
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `fetchAndStoreBars` | `symbol: string, timeframe: string` | `{ symbol, timeframe, barsStored }` |

#### Examples

```json
{"type":"cf_agent_rpc","id":"1","method":"fetchAndStoreBars","args":["AAPL","1Day"]}
```

#### State shape

```ts
{
  totalFetches: number
  totalBarsStored: number
  lastFetchAt: number | null
  errorCount: number
  lastError: string | null
}
```

---

### EarningsAgent

```
ws://localhost:8788/agents/earnings-agent/global
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `fetchEarnings` | `symbol: string` | `{ count: number }` |

#### Examples

```json
{"type":"cf_agent_rpc","id":"1","method":"fetchEarnings","args":["AAPL"]}
```

---

### FundamentalsAgent

```
ws://localhost:8788/agents/fundamentals-agent/global
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `fetchStatements` | `symbol: string` | `{ income, balanceSheet, cashFlow }` |

#### Examples

```json
{"type":"cf_agent_rpc","id":"1","method":"fetchStatements","args":["TSLA"]}
```

---

### MarketIntelligenceAgent

```
ws://localhost:8788/agents/market-intelligence-agent/global
```

#### Callable methods

| Method | Args | Returns |
|--------|------|---------|
| `fetchInsiderTrades` | `symbol: string` | `{ count: number }` |
| `fetchInstitutionalHoldings` | `symbol: string` | `{ count: number }` |

#### Examples

```json
{"type":"cf_agent_rpc","id":"1","method":"fetchInsiderTrades","args":["AAPL"]}
{"type":"cf_agent_rpc","id":"2","method":"fetchInstitutionalHoldings","args":["AAPL"]}
```

---

### AlpacaBrokerAgent

```
ws://localhost:8788/agents/alpaca-broker-agent/{userId}
```

**No `@callable()` methods** — all methods are public but not RPC-exposed. This agent is invoked internally by other agents (SessionAgent, PipelineOrchestratorAgent) via `getAgentByName()`.

Methods available only via internal agent-to-agent calls: `getAccount()`, `getPositions()`, `placeOrder()`, `cancelOrder()`, `getPortfolioHistory()`, `getClock()`, `getOrderHistory()`.

---

### AlpacaMarketDataAgent

```
ws://localhost:8788/agents/alpaca-market-data-agent/{userId}:{symbol}
```

**No `@callable()` methods** — invoked internally by other agents. Methods: `fetchBars()`, `getLatestBars()`.

---

## Agent URL Quick Reference

| Agent | URL | RPC Methods |
|-------|-----|-------------|
| SessionAgent | `/agents/session-agent/{userId}` | 15 methods + chat |
| TechnicalAnalysisAgent | `/agents/technical-analysis-agent/{userId}:{symbol}` | 3 methods |
| LLMAnalysisAgent | `/agents/llm-analysis-agent/{userId}:{symbol}` | 9 methods |
| DebateOrchestratorAgent | `/agents/debate-orchestrator-agent/{userId}:{symbol}` | 3 methods |
| PipelineOrchestratorAgent | `/agents/pipeline-orchestrator-agent/{userId}:{symbol}` | 2 methods |
| DataSchedulerAgent | `/agents/data-scheduler-agent/{userId}` | 3 methods |
| AlphaVantageDataAgent | `/agents/alpha-vantage-data-agent/{userId}:{symbol}` | 1 method |
| EarningsAgent | `/agents/earnings-agent/global` | 1 method |
| FundamentalsAgent | `/agents/fundamentals-agent/global` | 1 method |
| MarketIntelligenceAgent | `/agents/market-intelligence-agent/global` | 2 methods |
| AlpacaBrokerAgent | `/agents/alpaca-broker-agent/{userId}` | internal only |
| AlpacaMarketDataAgent | `/agents/alpaca-market-data-agent/{userId}:{symbol}` | internal only |
