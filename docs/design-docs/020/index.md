# Phase 20: SRP Multi-Agent Architecture Refactor — Index

> Refactor from 3 monolithic agents to SRP-based 4-category multi-agent system with debate/pipeline orchestration, human-in-the-loop approval, and Workers AI as new LLM provider.

Decomposes existing OrchestratorAgent + TechnicalAnalysisAgent + LLMAnalysisAgent into clean SRP categories: Data Agents, Analysis Agents, Broker Agents, Orchestrator/Session Agents. Adds two orchestration modes (multi-persona debate, sequential pipeline), real-time discussion feed, SDK-native human-in-the-loop approval flow, and Workers AI (`env.AI`) via `workers-ai-provider` as a new zero-cost LLM provider. User chooses LLM provider in UI.

## Current State (Pre-Refactor)

| Agent | Instance | Issues |
|-------|----------|--------|
| OrchestratorAgent | `{userId}` | Monolithic coordinator, no broker abstraction, no discussion model |
| TechnicalAnalysisAgent | `{userId}:{symbol}` | Mixes data fetching + indicator computation |
| LLMAnalysisAgent | `{userId}` | Single analysis mode, no persona support |

## Target State (Post-Refactor)

| Category | Agents | Responsibility |
|----------|--------|---------------|
| Data | AlpacaMarketDataAgent | Fetch + normalize + cache raw data |
| Analysis | TechnicalAnalysisAgent (refactored) | Compute indicators from provided data |
| Broker | AlpacaBrokerAgent | Orders, positions, account, portfolio |
| Session/Orchestrator | SessionAgent, DebateOrchestratorAgent, PipelineOrchestratorAgent | UI entry point, orchestration modes, HITL |

## Migration Phases

| Phase | What | Breaking? |
|-------|------|-----------|
| M1 | Design doc (this) | No |
| M2 | Scaffold new agents + Workers AI provider (zero behavior change) | No |
| M3 | Refactor TA agent (extract data fetching) | No |
| M4 | Persona support in LLM agent | No |
| M5 | Orchestration modes (Debate + Pipeline) | No |
| M6 | SessionAgent as primary UI entry point | No |
| M7 | Deprecate OrchestratorAgent | Yes (controlled) |
| M8 | Agent memory, learning & scoring | No |

### M8 Sub-phases

| Sub-phase | What |
|-----------|------|
| M8a | Outcome tracking infra — `proposal_outcomes`, `outcome_snapshots` tables in SessionAgent, `runOutcomeTrackingCycle()` |
| M8b | Memory tables + scoring — `persona_outcomes`, `persona_scores`, `persona_patterns` in DebateOrchestratorAgent; `pipeline_outcomes`, `pipeline_scores` in PipelineOrchestratorAgent |
| M8c | Memory-augmented prompts — `buildPerformanceContext()`, extend `analyzeAsPersona()` and `synthesizeConsensus()` signatures |
| M8d | UI — Performance dashboard, persona score cards, outcome history |

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [020-1-spec.md](./020-1-spec.md) | Overview, Goals, Agent Taxonomy, Orchestration Modes, Type Definitions |
| 2 | [020-2-data.md](./020-2-data.md) | SQLite schemas per agent, Shared PG changes, Zod schemas |
| 3 | [020-3-logic.md](./020-3-logic.md) | Agent implementations, Debate protocol, Pipeline steps, HITL flow |
| 4 | [020-4-api.md](./020-4-api.md) | WebSocket routing, RPC interfaces, Hono handlers |
| 5 | [020-5-ui.md](./020-5-ui.md) | Discussion feed, Proposal cards, Settings, Hooks |
| 6 | [020-6-ops.md](./020-6-ops.md) | Wrangler config, Migrations, Implementation order, Verification |
| 7 | [020-7-memory.md](./020-7-memory.md) | Agent Memory, Learning & Scoring — Outcome tracking, persona/pipeline scores, memory-augmented prompts |
