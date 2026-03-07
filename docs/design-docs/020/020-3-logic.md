# Phase 20: SRP Multi-Agent Architecture Refactor — Part 3: Business Logic

## Overview

Implementation details for each new/refactored agent. Covers initialization, RPC methods, scheduling, state management, and inter-agent communication.

---

## AlpacaMarketDataAgent

### Class Definition

```ts
import { Agent } from 'agents'
import type { Env } from '../env'
import type { AlpacaMarketDataAgentState, MarketDataFetchParams, MarketDataResult } from '@notdemo-trade/data-ops/agents/market-data/types'
import { AlpacaMarketDataProvider } from '@notdemo-trade/data-ops/providers/alpaca/market-data'

export class AlpacaMarketDataAgent extends Agent<Env, AlpacaMarketDataAgentState> {
  initialState: AlpacaMarketDataAgentState = {
    lastFetchAt: null,
    barCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS bars (...)`
    this.sql`CREATE TABLE IF NOT EXISTS fetch_log (...)`
  }
}
```

### RPC Methods (no `@callable()`)

```ts
// Called by SessionAgent/orchestrators via getAgentByName()
async fetchBars(params: MarketDataFetchParams): Promise<MarketDataResult> {
  // 1. Check cache freshness (fetch_log)
  // 2. If stale, fetch from Alpaca via AlpacaMarketDataProvider
  // 3. Upsert bars into SQLite
  // 4. Update state
  // 5. Return bars
}

async getLatestBars(symbol: string, timeframe: Timeframe, limit: number): Promise<Bar[]> {
  // Read from SQLite cache, no API call
  return this.sql`SELECT * FROM bars WHERE symbol = ${symbol} AND timeframe = ${timeframe} ORDER BY t DESC LIMIT ${limit}`
}

async fetchSnapshot(symbol: string): Promise<Snapshot> {
  // Always live — no cache
  const provider = this.createProvider()
  return provider.getSnapshot(symbol)
}
```

### Provider Construction

```ts
private createProvider(): AlpacaMarketDataProvider {
  // Credentials from instance name: "{userId}:{symbol}"
  // userId used to look up encrypted API keys from env/KV
  // Reuses existing AlpacaMarketDataProvider from data-ops
}
```

---

## AlpacaBrokerAgent

### Class Definition

```ts
import { Agent } from 'agents'
import type { Env } from '../env'
import type { AlpacaBrokerAgentState, BrokerAccount, BrokerPosition, OrderRequest, OrderResult } from '@notdemo-trade/data-ops/agents/broker/types'

export class AlpacaBrokerAgent extends Agent<Env, AlpacaBrokerAgentState> {
  initialState: AlpacaBrokerAgentState = {
    lastSyncAt: null,
    positionCount: 0,
    portfolioValue: null,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS account_cache (...)`
    this.sql`CREATE TABLE IF NOT EXISTS positions_cache (...)`
    this.sql`CREATE TABLE IF NOT EXISTS order_log (...)`
  }
}
```

### RPC Methods (no `@callable()`)

```ts
async getAccount(): Promise<BrokerAccount> {
  // 1. Check cache age (< 30s = use cache)
  // 2. If stale, fetch from Alpaca Trading API
  // 3. Update cache + state
  // 4. Return account
}

async getPositions(): Promise<BrokerPosition[]> {
  // Same cache pattern as getAccount()
}

async placeOrder(order: OrderRequest): Promise<OrderResult> {
  // 1. Validate order via OrderRequestSchema
  // 2. Submit to Alpaca Trading API
  // 3. Log to order_log
  // 4. Update state
  // 5. Return result
}

async cancelOrder(orderId: string): Promise<void> {
  // 1. Cancel via Alpaca API
  // 2. Update order_log status
}

async getPortfolioHistory(params?: HistoryParams): Promise<PortfolioHistory> {
  // Direct pass-through to Alpaca API
}

async getClock(): Promise<MarketClock> {
  // Direct pass-through, short cache (5s)
}
```

---

## TechnicalAnalysisAgent (Refactored — M3)

### Changes from Current

| Before (current) | After (M3) |
|---|---|
| `analyze()` fetches bars internally | `analyze(bars?)` accepts bars as parameter |
| Creates `AlpacaMarketDataProvider` | No provider creation |
| Stores raw bars in own SQLite | Only stores computed indicators |

### Backward-Compatible `analyze()`

```ts
async analyze(timeframe: Timeframe, bars?: Bar[]): Promise<AnalysisResult> {
  const symbol = this.getSymbol() // from instance name

  // Backward-compat: if no bars provided, fetch from market data agent
  if (!bars) {
    const marketData = await getAgentByName<AlpacaMarketDataAgent>(
      this.env.AlpacaMarketDataAgent,
      this.name // same instance key
    )
    const result = await marketData.fetchBars({ symbol, timeframe, limit: 200 })
    bars = result.bars
  }

  // Compute indicators (existing logic unchanged)
  const indicators = this.computeIndicators(bars)
  const signals = this.detectSignals(indicators)

  // Store in SQLite + shared PG (existing behavior)
  this.storeIndicators(indicators)
  this.storeSignals(signals)

  return { symbol, timeframe, indicators, signals, bars }
}
```

---

## LLMAnalysisAgent (Extended — M2 + M4)

### Workers AI Provider Support (M2)

The existing `resolveProviderConfig()` is extended to handle `'workers-ai'`:

```ts
private async resolveProviderConfig(userId: string): Promise<LLMProviderConfig> {
  const cached = this.sql<{ data: string }>`SELECT data FROM provider_config WHERE key = 'main'`;
  if (cached[0]) {
    const config = JSON.parse(cached[0].data) as LLMProviderConfig;

    // Workers AI: no credential lookup, use env.AI binding
    if (config.provider === 'workers-ai') {
      return {
        provider: 'workers-ai',
        model: config.model,
        aiBinding: this.env.AI,
      };
    }

    // Other providers: existing credential lookup
    const cred = await getCredential<LLMCredential>({
      userId,
      provider: config.provider,
      masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY,
    });
    if (cred) {
      return { provider: config.provider, apiKey: cred.apiKey, model: config.model, baseUrl: cred.baseUrl };
    }
  }

  // Fallback: try providers in order, workers-ai last (always available)
  for (const provider of LLM_PROVIDERS) {
    if (provider === 'workers-ai') {
      return { provider: 'workers-ai', model: DEFAULT_MODELS['workers-ai'], aiBinding: this.env.AI };
    }
    const cred = await getCredential<LLMCredential>({ userId, provider, masterKey: this.env.CREDENTIALS_ENCRYPTION_KEY });
    if (cred) {
      const model = DEFAULT_MODELS[provider];
      this.sql`INSERT OR REPLACE INTO provider_config (key, data) VALUES ('main', ${JSON.stringify({ provider, model })})`;
      return { provider, apiKey: cred.apiKey, model, baseUrl: cred.baseUrl };
    }
  }

  // Should never reach here since workers-ai is always available
  throw new Error('No LLM provider available');
}
```

### New RPC Methods (no `@callable()`) — M4

Added alongside existing `@callable() analyze()` which remains unchanged.

```ts
// Called by DebateOrchestratorAgent via getAgentByName()
async analyzeAsPersona(
  persona: PersonaConfig,
  data: { symbol: string; signals: TechnicalSignal[]; indicators: TechnicalIndicators },
  strategy: StrategyTemplate
): Promise<PersonaAnalysis> {
  const messages: CompletionMessage[] = [
    { role: 'system', content: persona.systemPrompt },
    { role: 'user', content: this.buildPersonaPrompt(data, strategy) },
  ]

  const result = await this.callLLM(messages)
  const parsed = this.parsePersonaResponse(result.content)

  this.logUsage('analyzeAsPersona', result.usage)

  return {
    personaId: persona.id,
    action: parsed.action,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    keyPoints: parsed.keyPoints,
  }
}

async runDebateRound(
  session: { analyses: PersonaAnalysis[]; previousRounds: DebateRound[] },
  roundNumber: number,
  personas: PersonaConfig[]
): Promise<DebateRound> {
  const responses = await Promise.all(
    personas.map(persona => this.generateDebateResponse(persona, session, roundNumber))
  )

  return { roundNumber, responses }
}

async synthesizeConsensus(
  analyses: PersonaAnalysis[],
  debateRounds: DebateRound[],
  moderatorPrompt: string
): Promise<ConsensusResult> {
  const messages: CompletionMessage[] = [
    { role: 'system', content: moderatorPrompt },
    { role: 'user', content: this.buildConsensusPrompt(analyses, debateRounds) },
  ]

  const result = await this.callLLM(messages, { response_format: { type: 'json_object' } })
  const parsed = this.parseConsensusResponse(result.content)

  this.logUsage('synthesizeConsensus', result.usage)

  return parsed
}

// Risk validation for pipeline mode
async validateRisk(
  recommendation: TradeRecommendation,
  portfolio: { positions: BrokerPosition[]; account: BrokerAccount }
): Promise<RiskValidation> {
  const messages: CompletionMessage[] = [
    { role: 'system', content: RISK_VALIDATION_PROMPT },
    { role: 'user', content: this.buildRiskPrompt(recommendation, portfolio) },
  ]

  const result = await this.callLLM(messages, { response_format: { type: 'json_object' } })
  this.logUsage('validateRisk', result.usage)

  return this.parseRiskResponse(result.content)
}
```

---

## DebateOrchestratorAgent

### Class Definition

```ts
import { Agent } from 'agents'
import type { Env } from '../env'
import type { DebateOrchestratorState, DebateSession, ConsensusResult } from '@notdemo-trade/data-ops/agents/debate/types'

export class DebateOrchestratorAgent extends Agent<Env, DebateOrchestratorState> {
  initialState: DebateOrchestratorState = {
    activeDebateId: null,
    totalDebates: 0,
    errorCount: 0,
    lastError: null,
  }
}
```

### Core RPC Method

```ts
// Called by SessionAgent via getAgentByName() — no @callable()
async runDebate(params: {
  symbol: string
  signals: TechnicalSignal[]
  indicators: TechnicalIndicators
  strategy: StrategyTemplate
  config: DebateConfig
  onMessage: (msg: DiscussionMessage) => void  // callback to SessionAgent for real-time feed
}): Promise<{ session: DebateSession; consensus: ConsensusResult }> {

  const sessionId = crypto.randomUUID()
  this.setState({ ...this.state, activeDebateId: sessionId })

  // Store debate session
  this.sql`INSERT INTO debate_sessions (id, symbol, status, config, started_at)
           VALUES (${sessionId}, ${params.symbol}, 'analyzing', ${JSON.stringify(params.config)}, ${Date.now()})`

  const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, this.getUserId())
  const data = { symbol: params.symbol, signals: params.signals, indicators: params.indicators }

  // Phase 1: Independent analyses (parallel)
  params.onMessage({ sender: { type: 'system' }, phase: 'analysis', content: `Starting ${params.config.personas.length}-persona analysis for ${params.symbol}...` })

  const analyses = await Promise.all(
    params.config.personas.map(async (persona) => {
      const analysis = await llm.analyzeAsPersona(persona, data, params.strategy)

      params.onMessage({
        sender: { type: 'persona', persona: persona.id },
        phase: 'analysis',
        content: analysis.rationale,
        metadata: { action: analysis.action, confidence: analysis.confidence, keyPoints: analysis.keyPoints },
      })

      this.sql`INSERT INTO persona_analyses (id, session_id, persona_id, action, confidence, rationale, key_points, created_at)
               VALUES (${crypto.randomUUID()}, ${sessionId}, ${persona.id}, ${analysis.action}, ${analysis.confidence}, ${analysis.rationale}, ${JSON.stringify(analysis.keyPoints)}, ${Date.now()})`

      return analysis
    })
  )

  // Phase 2: Debate rounds
  this.sql`UPDATE debate_sessions SET status = 'debating' WHERE id = ${sessionId}`
  const debateRounds: DebateRound[] = []

  for (let round = 1; round <= params.config.rounds; round++) {
    params.onMessage({ sender: { type: 'system' }, phase: 'debate_round', content: `Debate round ${round} of ${params.config.rounds}` })

    const debateRound = await llm.runDebateRound(
      { analyses, previousRounds: debateRounds },
      round,
      params.config.personas
    )

    for (const response of debateRound.responses) {
      params.onMessage({
        sender: { type: 'persona', persona: response.personaId },
        phase: 'debate_round',
        content: response.content,
        metadata: { round, revisedAction: response.revisedAction, revisedConfidence: response.revisedConfidence },
      })
    }

    debateRounds.push(debateRound)
    // Store round in SQLite...
  }

  // Phase 3: Consensus synthesis
  this.sql`UPDATE debate_sessions SET status = 'synthesizing' WHERE id = ${sessionId}`
  params.onMessage({ sender: { type: 'system' }, phase: 'consensus', content: 'Synthesizing consensus...' })

  const consensus = await llm.synthesizeConsensus(analyses, debateRounds, params.config.moderatorPrompt)

  params.onMessage({
    sender: { type: 'moderator' },
    phase: 'consensus',
    content: consensus.rationale,
    metadata: { action: consensus.action, confidence: consensus.confidence, dissent: consensus.dissent },
  })

  // Store consensus + update session
  this.sql`UPDATE debate_sessions SET status = 'completed', completed_at = ${Date.now()} WHERE id = ${sessionId}`
  this.setState({ ...this.state, activeDebateId: null, totalDebates: this.state.totalDebates + 1 })

  return { session: this.getDebateSession(sessionId), consensus }
}
```

---

## PipelineOrchestratorAgent

### Core RPC Method

```ts
// Called by SessionAgent via getAgentByName() — no @callable()
async runPipeline(params: {
  symbol: string
  strategyId: string
  strategy: StrategyTemplate
  onMessage: (msg: DiscussionMessage) => void
}): Promise<{ session: PipelineSession; proposal: TradeProposal | null }> {

  const sessionId = crypto.randomUUID()
  const context: PipelineContext = {
    symbol: params.symbol,
    strategyId: params.strategyId,
    bars: null, indicators: null, signals: null,
    recommendation: null, riskValidation: null, proposal: null,
  }

  const steps: PipelineStepName[] = [
    'fetch_market_data', 'technical_analysis', 'llm_analysis',
    'risk_validation', 'generate_proposal',
  ]

  // Initialize session + steps in SQLite
  // ...

  for (const stepName of steps) {
    params.onMessage({ sender: { type: 'system' }, phase: this.stepToPhase(stepName), content: `Running ${stepName}...` })

    try {
      await this.executeStep(stepName, context, params)
    } catch (error) {
      // Mark step + session as failed, broadcast error
      params.onMessage({ sender: { type: 'system' }, phase: this.stepToPhase(stepName), content: `Step ${stepName} failed: ${error.message}` })
      return { session: this.getPipelineSession(sessionId), proposal: null }
    }
  }

  return { session: this.getPipelineSession(sessionId), proposal: context.proposal }
}

private async executeStep(name: PipelineStepName, ctx: PipelineContext, params: RunPipelineParams): Promise<void> {
  switch (name) {
    case 'fetch_market_data': {
      const marketData = await getAgentByName<AlpacaMarketDataAgent>(this.env.AlpacaMarketDataAgent, `${this.getUserId()}:${params.symbol}`)
      const result = await marketData.fetchBars({ symbol: params.symbol, timeframe: '1Day', limit: 200 })
      ctx.bars = result.bars
      break
    }
    case 'technical_analysis': {
      const ta = await getAgentByName<TechnicalAnalysisAgent>(this.env.TechnicalAnalysisAgent, `${this.getUserId()}:${params.symbol}`)
      const result = await ta.analyze('1Day', ctx.bars!)
      ctx.indicators = result.indicators
      ctx.signals = result.signals
      break
    }
    case 'llm_analysis': {
      const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, this.getUserId())
      const result = await llm.analyze({
        symbol: params.symbol,
        signals: ctx.signals!.map(s => ({ type: s.type, direction: s.direction, strength: s.strength, source: 'technical' })),
        technicals: ctx.indicators!,
        strategy: params.strategy,
      })
      ctx.recommendation = result.recommendation
      break
    }
    case 'risk_validation': {
      const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, this.getUserId())
      const broker = await getAgentByName<AlpacaBrokerAgent>(this.env.AlpacaBrokerAgent, this.getUserId())
      const [positions, account] = await Promise.all([broker.getPositions(), broker.getAccount()])
      ctx.riskValidation = await llm.validateRisk(ctx.recommendation!, { positions, account })
      break
    }
    case 'generate_proposal': {
      if (!ctx.riskValidation?.approved) {
        params.onMessage({ sender: { type: 'system' }, phase: 'proposal', content: 'Risk validation rejected the trade.' })
        return
      }
      ctx.proposal = this.buildProposal(ctx, params)
      break
    }
  }
}
```

---

## SessionAgent

### Class Definition

```ts
import { AIChatAgent } from 'agents/ai-chat-agent'
import { tool } from 'ai'
import type { Env } from '../env'
import type { SessionState, SessionConfig } from '@notdemo-trade/data-ops/agents/session/types'

export class SessionAgent extends AIChatAgent<Env, SessionState> {
  maxPersistedMessages = 500

  initialState: SessionState = {
    enabled: false,
    lastCycleAt: null,
    cycleCount: 0,
    activeThreadId: null,
    pendingProposalCount: 0,
    errorCount: 0,
    lastError: null,
  }

  async onStart() {
    // Create all SQLite tables (session_config, discussion_threads, etc.)
    this.initializeTables()
    // Seed defaults if first run
    this.seedDefaults()
  }
}
```

### LLM Provider Passthrough

SessionAgent reads `llmProvider` and `llmModel` from its session config and passes them to `LLMAnalysisAgent` when updating its provider config. This ensures all LLM calls (debate personas, pipeline analysis, chat) use the user's chosen provider.

```ts
private async syncLLMProviderConfig(): Promise<void> {
  const config = this.getSessionConfig()
  const llm = await getAgentByName<LLMAnalysisAgent>(this.env.LLMAnalysisAgent, this.getUserId())
  await llm.setProviderConfig({ provider: config.llmProvider, model: config.llmModel })
}
```

### `onChatMessage()` — Entry Point

```ts
async onChatMessage(onFinish: StreamTextOnFinishCallback): Promise<Response> {
  const config = this.getSessionConfig()
  const strategy = this.getActiveStrategy()

  return streamText({
    model: this.getModel(config),  // resolves model based on config.llmProvider
    system: this.buildSystemPrompt(config),
    messages: this.messages,
    tools: {
      analyzeSymbol: tool({
        description: 'Run full analysis on a symbol using configured orchestration mode',
        inputSchema: z.object({ symbol: z.string() }),
        execute: async ({ symbol }) => {
          return this.runAnalysisCycle(symbol, config, strategy)
        },
      }),
      executeTrade: tool({
        description: 'Execute a trade based on agent recommendation',
        inputSchema: TradeProposalSchema,
        needsApproval: async () => true,  // always require approval
        execute: async (params) => {
          const broker = await getAgentByName(this.env[config.brokerType], this.getUserId())
          return broker.placeOrder({
            symbol: params.symbol,
            side: params.action,
            type: 'market',
            notional: params.notional ?? undefined,
            qty: params.qty ?? undefined,
            timeInForce: params.timeInForce ?? 'day',
          })
        },
      }),
    },
    onFinish,
    abortSignal: this.abortSignal,
  })
}
```

### Analysis Cycle

```ts
private async runAnalysisCycle(symbol: string, config: SessionConfig, strategy: StrategyTemplate) {
  const threadId = crypto.randomUUID()
  this.setState({ ...this.state, activeThreadId: threadId })

  // Create thread
  this.sql`INSERT INTO discussion_threads (id, orchestration_mode, symbol, status, started_at)
           VALUES (${threadId}, ${config.orchestrationMode}, ${symbol}, 'in_progress', ${Date.now()})`

  const onMessage = (msg: Partial<DiscussionMessage>) => {
    const fullMsg = { id: crypto.randomUUID(), threadId, timestamp: Date.now(), metadata: {}, ...msg }
    this.sql`INSERT INTO discussion_messages (id, thread_id, timestamp, sender, phase, content, metadata)
             VALUES (${fullMsg.id}, ${threadId}, ${fullMsg.timestamp}, ${JSON.stringify(fullMsg.sender)}, ${fullMsg.phase}, ${fullMsg.content}, ${JSON.stringify(fullMsg.metadata)})`
    // Broadcast to connected clients
    this.broadcastThread(threadId)
  }

  // Step 1: Fetch data
  const marketData = await getAgentByName(this.env.AlpacaMarketDataAgent, `${this.getUserId()}:${symbol}`)
  const { bars } = await marketData.fetchBars({ symbol, timeframe: '1Day', limit: 200 })
  onMessage({ sender: { type: 'data_agent', name: 'AlpacaMarketDataAgent' }, phase: 'data_collection', content: `Fetched ${bars.length} bars for ${symbol}` })

  // Step 2: Technical analysis
  const ta = await getAgentByName(this.env.TechnicalAnalysisAgent, `${this.getUserId()}:${symbol}`)
  const analysis = await ta.analyze('1Day', bars)
  onMessage({ sender: { type: 'analysis_agent', name: 'TechnicalAnalysisAgent' }, phase: 'analysis', content: `Computed ${analysis.signals.length} signals` })

  // Step 3: Orchestration (debate or pipeline)
  if (config.orchestrationMode === 'debate') {
    const debateOrch = await getAgentByName(this.env.DebateOrchestratorAgent, this.getUserId())
    const debateConfig = this.getDebateConfig()
    const { consensus } = await debateOrch.runDebate({
      symbol, signals: analysis.signals, indicators: analysis.indicators, strategy, config: debateConfig, onMessage,
    })
    return consensus
  } else {
    const pipelineOrch = await getAgentByName(this.env.PipelineOrchestratorAgent, this.getUserId())
    const { proposal } = await pipelineOrch.runPipeline({ symbol, strategyId: config.activeStrategyId, strategy, onMessage })
    return proposal
  }
}
```

### Scheduled Analysis

```ts
async onStart() {
  // ...table init...
  const config = this.getSessionConfig()
  if (this.state.enabled) {
    this.scheduleEvery('runScheduledCycle', `*/${Math.ceil(config.analysisIntervalSec / 60)} * * * *`)
  }
}

async runScheduledCycle() {
  const config = this.getSessionConfig()
  for (const symbol of config.watchlistSymbols) {
    const strategy = this.getActiveStrategy()
    await this.runAnalysisCycle(symbol, config, strategy)
  }
  this.setState({ ...this.state, lastCycleAt: Date.now(), cycleCount: this.state.cycleCount + 1 })
}
```

### Proposal Expiration

```ts
private scheduleProposalExpiration(proposalId: string, timeoutSec: number) {
  this.schedule('expireProposal', { delay: timeoutSec * 1000, data: { proposalId } })
}

async expireProposal({ proposalId }: { proposalId: string }) {
  this.sql`UPDATE trade_proposals SET status = 'expired', decided_at = ${Date.now()} WHERE id = ${proposalId} AND status = 'pending'`
  this.setState({ ...this.state, pendingProposalCount: Math.max(0, this.state.pendingProposalCount - 1) })
}
```

---

## Inter-Agent Communication Summary

| Caller | Callee | Method | Mechanism |
|--------|--------|--------|-----------|
| SessionAgent | AlpacaMarketDataAgent | `fetchBars()` | DO RPC via `getAgentByName()` |
| SessionAgent | TechnicalAnalysisAgent | `analyze()` | DO RPC via `getAgentByName()` |
| SessionAgent | DebateOrchestratorAgent | `runDebate()` | DO RPC via `getAgentByName()` |
| SessionAgent | PipelineOrchestratorAgent | `runPipeline()` | DO RPC via `getAgentByName()` |
| SessionAgent | AlpacaBrokerAgent | `placeOrder()` | DO RPC via `getAgentByName()` |
| DebateOrchestratorAgent | LLMAnalysisAgent | `analyzeAsPersona()` | DO RPC via `getAgentByName()` |
| DebateOrchestratorAgent | LLMAnalysisAgent | `runDebateRound()` | DO RPC via `getAgentByName()` |
| DebateOrchestratorAgent | LLMAnalysisAgent | `synthesizeConsensus()` | DO RPC via `getAgentByName()` |
| PipelineOrchestratorAgent | AlpacaMarketDataAgent | `fetchBars()` | DO RPC via `getAgentByName()` |
| PipelineOrchestratorAgent | TechnicalAnalysisAgent | `analyze()` | DO RPC via `getAgentByName()` |
| PipelineOrchestratorAgent | LLMAnalysisAgent | `analyze()`, `validateRisk()` | DO RPC via `getAgentByName()` |
| PipelineOrchestratorAgent | AlpacaBrokerAgent | `getPositions()`, `getAccount()` | DO RPC via `getAgentByName()` |
| UI (WebSocket) | SessionAgent | `@callable()` methods | WebSocket via `useAgentChat` |

### `@callable()` Usage (ONLY SessionAgent)

Only methods called from the client via WebSocket get `@callable()`:
- `SessionAgent.start()` / `stop()`
- `SessionAgent.updateConfig()`
- `SessionAgent.getStatus()`
- `SessionAgent.getThreads()`
- `SessionAgent.triggerAnalysis()`

All other inter-agent methods are plain async methods invoked via DO RPC.
