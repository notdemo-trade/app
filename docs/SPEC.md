# notdemo.trade — System Specification (v1)

A language-agnostic specification for an AI-powered trading recommendation platform that orchestrates multi-agent analysis cycles, produces transparent reasoning trails, and requires human approval before execution.

## 1. Overview

notdemo.trade is a platform for swing traders who cannot watch markets full-time. It:

- Runs continuous or on-demand analysis cycles against user-provided tickers
- Orchestrates multiple AI agents (debate or pipeline mode) to produce trade recommendations
- Surfaces every step of agent reasoning via discussion threads (audit trail)
- Requires explicit human approval before executing any trade
- Follows a Bring Your Own Keys (BYOK) model — users supply their own broker, data provider, and LLM credentials
- Monetizes via x402 micropayments per agent call

**Core principle:** Simple by default, customizable on demand. A new user should be running analysis cycles within minutes. Deep customization (personas, indicator tuning, risk params) is available but never required.

## 2. Core System Components

### 2.1 Session Agent (Master Orchestrator)

The primary entry point per user. One instance per user, lazily instantiated on first connection.

**Responsibilities:**
- Maintains WebSocket connection(s) with the user's clients (multi-device, same state broadcast)
- Manages scheduled and on-demand analysis cycles
- Routes analysis to the appropriate orchestrator (debate or pipeline)
- Owns the discussion thread lifecycle (create, persist messages, broadcast updates)
- Coordinates human-in-the-loop approval flow
- Delegates trade execution to the broker agent
- Resolves effective configuration from the 3-layer hierarchy

**State:**
- `enabled` — whether scheduled cycles are active
- `activeThreadId` / `activeThread` — current discussion in progress
- `pendingProposalCount` — proposals awaiting user decision
- `cycleCount` — total completed cycles
- `lastError` / `lastSkipReason` — observability

**Callable methods (RPC):**
- `start()` / `stop()` — enable/disable scheduled cycles
- `triggerAnalysis(symbol?)` — on-demand analysis
- `getThreads(limit)` / `getThread(threadId)` — discussion history
- `getProposals(status?)` — list trade proposals
- `approveProposal(id)` / `rejectProposal(id)` — human decision

### 2.2 Debate Orchestrator Agent

Runs multi-persona deliberation for a single symbol. One instance per `userId:symbol`.

**Three-phase process:**

1. **Independent analysis** — Each persona analyzes the symbol in parallel using its own bias (bullish/bearish/neutral), system prompt, and historical performance scores
2. **Debate rounds** — Personas see each other's analyses and revise their position through N structured rounds
3. **Consensus synthesis** — A moderator (user-customizable prompt) produces a final recommendation, applying confidence dampening based on each persona's historical accuracy

**Outputs:** consensus action, confidence score, per-persona rationale

### 2.3 Pipeline Orchestrator Agent

Runs sequential analysis for a single symbol. One instance per `userId:symbol`.

**Six-step serial process:**

1. **Fetch market data** — OHLCV bars from data provider agent
2. **Technical analysis** — Compute indicators, detect signals
3. **Fetch enrichment data** — Fundamentals, earnings, market intelligence
4. **LLM analysis** — Strategy-agnostic reasoning over all collected data
5. **Risk validation** — Check proposal against user's risk parameters + current positions
6. **Generate proposal** — Produce trade recommendation if confidence meets user's threshold

### 2.4 Technical Analysis Agent

Computes indicators and detects signal patterns. One instance per `userId:symbol`.

**Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Volume SMA

**Signals detected:** RSI oversold/overbought, MACD crosses, Bollinger Band touches, volume spikes, trend confirmations

**Parameterized by:** user's technical analysis configuration (periods, thresholds) or preset profiles (Default, Day Trader, Swing Trader, Position Trader)

### 2.5 LLM Analysis Agent

Multi-provider LLM abstraction. One instance per `userId`.

**Capabilities:**
- `analyze()` — general analysis over market + technical data
- `analyzeAsPersona()` — persona-biased analysis for debate mode
- `runDebateRound()` — generate persona response to peer analyses
- `synthesizeConsensus()` — moderator synthesis
- `validateRisk()` — risk assessment of proposed trade
- `classifyEvent()` — event classification
- `generateReport()` — summary generation

**Provider support:** Must be extensible. Each provider implements a common interface. Users select models per task type (research model, analyst model).

**Cost tracking:** Every call records prompt/completion tokens and estimated USD cost per provider pricing table.

### 2.6 Broker Agent

Executes trades against the user's brokerage account. One instance per `userId`.

**Interface (broker-agnostic):**
- `getAccount()` — cash balance, buying power, equity
- `getPositions()` — current holdings
- `placeOrder(params)` — submit order (market, limit, stop)
- `cancelOrder(id)` — cancel pending order
- `getPortfolioHistory(period)` — historical P&L
- `getClock()` — market hours status

**Multi-broker:** The interface must be implemented per broker. Initial implementation: Alpaca. Architecture must support adding brokers without modifying the orchestration layer.

**Paper trading:** Default mode for new users. Live trading requires explicit opt-in via credential configuration.

### 2.7 Data Provider Agents

Fetch market and fundamental data from external APIs. Modular architecture — each data source is a separate agent class.

**Current providers:**
- **Market data agent** — OHLCV bars, quotes (AlphaVantage)
- **Fundamentals agent** — Financial statements, ratios
- **Earnings agent** — Earnings announcements, surprises
- **Market intelligence agent** — Institutional holdings, insider trades

**Data sourcing model:** Users provide their own API keys for data providers. Data freshness depends on the user's subscription tier with each provider.

**Extensibility:** New data agents (news, social sentiment, SEC filings) plug in by implementing a data agent interface and registering with the orchestrator.

### 2.8 Data Scheduler Agent

Coordinates background data collection cycles across all data provider agents.

### 2.9 Notification Service

Delivers trade proposals and status updates to users.

**Channels:**
- **WebSocket** — real-time push to all connected clients (primary for desktop)
- **Telegram** — bot integration with inline approve/reject buttons (primary for mobile)

Both channels fire simultaneously on proposal generation. If user is offline on both, the proposal's timeout clock runs and auto-rejects on expiry.

**Telegram integration:**
- User connects via `/start` command (links chat ID to account)
- Webhook receives callback queries for approve/reject actions
- Proposals rendered with inline keyboard buttons

## 3. Data Model

### 3.1 User & Authentication

- **User** — identity via session-based auth, email/password
- **Invite code** — `NT-XXXX-XXXX` format, required for registration, one-time use. Invite system persists alongside x402 as an access control layer.
- **API token** — bearer tokens for external integrations

### 3.2 Credentials (BYOK)

- One encrypted credential record per user per provider
- **Providers:** broker (Alpaca), data (AlphaVantage, FinancialDatasets), LLM (OpenAI, Anthropic, Google, xAI, DeepSeek), notification (Telegram), platform-managed (Workers AI)
- **Encryption:** AES-256-GCM with HKDF per-user key derivation from a master key. Random salt + IV per credential. Platform operator cannot read keys at rest.
- **Validation:** optional on-save validation with status tracking (`lastValidatedAt`, `validationError`)
- **Paper mode flag:** per broker credential

### 3.3 Trading Configuration

Per-user settings governing analysis and execution behavior.

**Position limits:**
- `maxPositionValue` — max USD value per position
- `maxPositions` — max concurrent positions
- `maxNotionalPerTrade` — max USD per single order

**Risk management:**
- `maxDailyLossPct` — daily loss circuit breaker threshold
- `takeProfitPct` / `stopLossPct` — default exit targets
- `positionSizePctOfCash` — position sizing as % of available cash

**LLM selection:**
- `researchModel` / `analystModel` — `{provider}/{modelId}` format
- `llmTemperature` / `llmMaxTokens` — per-task scaling

**Behavior flags:**
- `tradingHoursOnly` — restrict analysis to market hours
- `extendedHoursAllowed` — allow extended hours trading
- `allowShortSelling` — enable short positions
- `orchestrationMode` — `debate` or `pipeline`

**Ticker control:**
- `tickerBlacklist` — always excluded
- `tickerAllowlist` — if set, only these symbols are analyzed

**Proposal behavior:**
- `proposalTimeoutSec` — time before auto-reject
- `confidenceThreshold` — minimum confidence to generate a proposal

### 3.4 Configuration Hierarchy

Three-layer resolution, highest priority first:

1. **User config (persistent store)** — user's saved settings, highest priority
2. **Session config (agent-local store)** — temporary experiments without changing saved settings
3. **Hardcoded defaults** — sensible starting values, lowest priority

A `resolveEffectiveConfig()` function merges all layers with provenance tracking (which layer each value came from).

### 3.5 Strategy Profiles

Switchable preset bundles that combine:
- Technical analysis indicator parameters
- Risk management parameters
- Persona selection
- Orchestration mode

Built-in presets (Day Trader, Swing Trader, Position Trader) serve as starting points. Users can create custom profiles. Applying a profile overwrites the relevant config fields.

### 3.6 Debate Personas

- **Default set:** bull analyst, bear analyst, risk manager (always-opposed perspectives + risk arbiter)
- Users can add, edit, delete, and reorder personas
- Each persona has: name, role, system prompt, bias (bullish/bearish/neutral), active flag
- **Moderator prompt:** user-customizable instructions for the consensus synthesizer
- **Performance tracking:** win rate, Sharpe ratio, confidence calibration per persona — purely informational, no automatic deactivation
- **Lazy seeding:** defaults created on first access, not on registration

### 3.7 Technical Analysis Configuration

Per-user indicator tuning:
- Indicator periods (SMA, EMA, RSI, Bollinger, ATR, Volume SMA)
- Signal thresholds (RSI oversold/overbought, volume spike multiplier)
- Preset profiles with recommended parameter sets
- Dynamic indicator arrays (not fixed-length)

### 3.8 Discussion Threads (Audit Trail)

**Thread:** top-level record per analysis run
- `orchestrationMode` — debate or pipeline
- `symbol` — analyzed ticker
- `status` — in_progress → completed | failed
- `proposalId` — resulting trade proposal (if any)

**Messages:** ordered reasoning steps within a thread
- `sender` — discriminated union:
  - `system` — lifecycle events
  - `data_agent` — market data, enrichment fetches
  - `analysis_agent` — technical analysis, LLM reasoning, risk validation
  - `persona` — individual persona analyses/debate responses
  - `moderator` — consensus synthesis
  - `broker` — order execution results
  - `user` — approval/rejection decisions
- `phase` — progression: `data_collection → analysis → debate_round → consensus → proposal → human_decision → execution → completed`
- `metadata` — structured data (action, confidence, rationale, signals)

**Persistence:** every message persisted immediately, broadcast to all connected clients in real-time.

**Compliance function:** threads serve as an auditable record proving why each recommendation was made and what data informed it.

### 3.9 Trade Proposals

- Generated when analysis confidence meets user's threshold
- States: `pending → approved | rejected | expired | executed | failed`
- Contains: symbol, action (buy/sell), quantity, price target, confidence, rationale
- Timeout: `proposalTimeoutSec` — auto-rejects if no user response

### 3.10 Market Data

- OHLCV bars per symbol per timeframe
- Cached in agent-local storage, persisted to database
- Freshness depends on user's data provider subscription

### 3.11 LLM Usage Tracking

- Per-call records: provider, model, prompt tokens, completion tokens, estimated cost
- Aggregated per user for spending dashboard

## 4. Operational Behaviors

### 4.1 Analysis Cycle

**Trigger:** scheduled (configurable interval, respects `tradingHoursOnly`) or on-demand via user RPC/chat.

**Pre-analysis guards (checked before any agent work):**
1. Market hours check (if `tradingHoursOnly`)
2. Ticker filter (blacklist/allowlist)
3. Daily loss circuit breaker (`maxDailyLossPct`)
4. Cooldown period (prevent rapid re-analysis of same symbol)

**Execution:**
1. Create discussion thread
2. For each eligible symbol:
   a. Route to debate or pipeline orchestrator
   b. Orchestrator invokes sub-agents, emitting messages via callback
   c. Each message persisted + broadcast in real-time
   d. If confidence ≥ user's threshold → generate trade proposal
3. Notify user via WebSocket + Telegram

**Concurrency:** if a manual trigger arrives while a scheduled cycle is analyzing the same symbol, the request is queued (not dropped, not duplicated).

### 4.2 Trade Approval Flow

1. User receives proposal (WebSocket card or Telegram inline keyboard)
2. User approves or rejects
3. On approval, pre-execution guards enforce:
   - `maxNotionalPerTrade`
   - `maxPositionValue`
   - `maxPositions`
   - `allowShortSelling`
4. Broker agent places order
5. Proposal status updated (executed/failed)
6. Outcome recorded for persona performance tracking
7. Notification sent with execution result

On rejection or timeout: proposal marked accordingly, no execution.

### 4.3 Retry Strategy

- **Agent failure mid-cycle:** retry the entire analysis cycle for that symbol (not partial resume)
- **Broker order failure:** mark proposal as failed, notify user, do not auto-retry
- **Data provider failure:** emit error message to discussion thread, skip enrichment step, continue with available data

### 4.4 Agent Lifecycle

- **Instantiation:** lazy, on first use. No pre-creation on signup.
- **Addressing:** agents identified by name (`userId` or `userId:symbol`)
- **State:** each agent maintains local storage (SQLite) for caching + session state
- **Cleanup:** on account deletion, all agent instances and their local state must be destroyed
- **Multi-device:** all WebSocket connections to the same SessionAgent receive identical state broadcasts

### 4.5 Risk Management

All risk controls are per-user. No platform-level kill switch.

**Pre-analysis guards:** market hours, ticker filters, daily loss circuit breaker, cooldown
**Pre-execution guards:** notional caps, position limits, short-selling block

Guards block execution (not just warn). Every blocked action is logged to the discussion thread.

### 4.6 Platform Guardrails

Configurable directly in the database (not per-user settings):
- Max symbols per user
- Max analysis cycles per day
- Max concurrent agents
- Rate limits per endpoint

These are operational limits, not user-facing features.

## 5. Security Model

### 5.1 Credential Encryption

- **Algorithm:** AES-256-GCM
- **Key derivation:** HKDF (SHA-256) with master key from environment, per-user salt
- **Per-credential:** random 16-byte salt + 12-byte IV
- **Guarantee:** platform operator cannot read credentials at rest, even with database access (requires master key)

### 5.2 Authentication

- Session-based auth (not JWT)
- Invite code required for registration (access control layer, persists alongside x402)

### 5.3 Agent Wallet Security (x402)

- Platform-managed wallets
- Deterministic key derivation from environment seed
- One wallet per agent class instance

### 5.4 Rate Limiting

- Per-IP, fixed time-window
- Configurable per route (window duration, max requests)
- Returns 429 on breach

### 5.5 API Authentication

- Bearer token for service-to-service calls
- Session cookie for user-facing endpoints
- User API tokens for external integrations

## 6. Monetization (x402)

### 6.1 Payment Model

- **Standard:** HTTP 402 (x402) micropayments
- **Granularity:** per agent call (not per cycle or per proposal)
- **Example cost:** a debate cycle with 3 personas × 2 rounds = 6+ LLM agent calls + data agent calls + TA agent calls
- **Platform fee:** applied to every call, including zero-cost LLM providers (Workers AI)

### 6.2 Agent Wallets

- Each agent instance has its own wallet
- User pays directly to the agent wallet on invocation
- Wallets are platform-managed with deterministic key derivation from an environment seed

### 6.3 User Experience

- **Fire-and-forget:** no upfront approval per call
- **Spending dashboard:** cumulative cost tracking (tokens, USD) per provider, per agent, per time window
- **Free tier preserved:** Workers AI calls still have $0 LLM cost, but platform fee applies

## 7. Frontend

### 7.1 Pages

- **Landing** — product pitch, feature cards, FAQ
- **Session** — real-time chat + discussion thread feed (primary interface)
- **Settings** — trading config, TA indicator tuning, persona editor, notification preferences
- **Performance** — score dashboard, P&L windows
- **Analysis** — historical analysis browser
- **Account** — profile, credentials management

### 7.2 Session Interface

The primary user interaction surface:
- Chat input for on-demand commands ("analyze AAPL")
- Real-time discussion thread showing agent reasoning as it happens
- Proposal cards with approve/reject actions
- Pending proposal counter

### 7.3 State Management

- WebSocket connection to SessionAgent (reconnects on disconnect)
- Server-side state broadcast on every change
- No client-side state derivation — server is source of truth

## 8. Deployment Architecture

### 8.1 Platform Choice

Cloudflare Workers is a deliberate architectural choice:
- **Edge compute:** low-latency globally
- **Durable Objects:** stateful agents with co-located storage (SQLite) without managing infrastructure
- **Queues:** analysis cycle deduplication and ordering
- **Workers AI:** zero-cost LLM inference at the edge
- **Deployment:** independent per-service, zero-downtime

### 8.2 Service Topology

Two independently deployed workers:
- **Frontend worker** — SSR application, serves HTML + handles auth routes
- **API worker** — REST API + Durable Object agents + queue consumers + scheduled triggers

Each worker has its own subdomain. Custom domains with auto-provisioned SSL.

### 8.3 Data Stores

- **Postgres (serverless)** — persistent state: users, credentials, config, threads, proposals, market data
- **Durable Object SQLite** — agent-local state: session config, cached data, persona scores, message history
- **In-memory** — rate limiter state, active thread references

### 8.4 Environment Separation

- `dev` — local development (`.dev.vars` for secrets)
- `staging` — pre-production on Cloudflare
- `production` — live

Secrets managed via platform secret store, synced by script.

## 9. Internationalization

- English only
- All user-facing strings externalized to message files (extensible to additional locales)

## 10. Observability

- Cloudflare Analytics for monitoring and alerting
- Structured error logging with request ID correlation
- Discussion threads as built-in audit trail for every analysis decision
- LLM usage tracking (tokens, cost) per call

## 11. Data Lifecycle

- **User-deletable:** users can delete their discussion threads, analysis history, and account data
- **Credential cleanup:** account deletion destroys all encrypted credentials and agent instances
- **Market data:** cached at agent level, persisted to database, no automatic expiry

## 12. Extension Points

The architecture is designed for modular extension at these boundaries:

| Extension | Interface | Example |
|-----------|-----------|---------|
| New broker | Broker agent interface | Interactive Brokers, Tradier |
| New data provider | Data agent interface | News API, social sentiment |
| New LLM provider | LLM provider factory | New model releases |
| New notification channel | Notification service interface | Email, push notifications |
| New orchestration mode | Orchestrator agent interface | Ensemble voting, tournament |
| New persona type | Persona schema | Sector specialist, macro analyst |
| New asset class | Symbol + broker support | Options, futures |

## 13. Invariants

These properties must hold across all implementations:

1. **No trade executes without explicit human approval** (approve via WebSocket or Telegram)
2. **Every recommendation has a complete audit trail** (discussion thread with all agent reasoning)
3. **User credentials are unreadable at rest** (AES-256-GCM, operator cannot decrypt without master key)
4. **Risk guards block execution, never just warn** (pre-analysis + pre-execution enforcement)
5. **Agent failure never produces a silent state** (errors surface in discussion thread + notifications)
6. **Configuration changes never require restart** (effective config resolved per cycle from live hierarchy)
7. **Paper trading is the default** (live trading requires explicit credential configuration)
8. **Platform fee applies to every agent call** (including zero-cost LLM providers)
9. **Proposals auto-reject on timeout** (no indefinitely pending proposals)
10. **All connected clients receive identical state** (multi-device consistency)
