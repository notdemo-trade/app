# Phase 6: LLM Analysis Agent — Index

> LLMAnalysisAgent: per-user Cloudflare Agent for multi-provider LLM reasoning

Standalone agent wrapping Vercel AI SDK providers. Strategy-agnostic — receives `StrategyTemplate` from orchestrator per-request. On-demand only (no scheduled runs). Writes analysis results to shared PG.

## Agent Topology

| Agent | Instance | Scope | Data Source |
|-------|----------|-------|-------------|
| LLMAnalysisAgent | `{userId}` | per-user | OpenAI / Anthropic / Google (via Vercel AI SDK) |

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [006-1-spec.md](./006-1-spec.md) | Overview, Goals, Agent Definition, Type Definitions |
| 2 | [006-2-data.md](./006-2-data.md) | Agent SQLite State, Shared PG Schema, Zod Schemas |
| 3 | [006-3-logic.md](./006-3-logic.md) | LLMAnalysisAgent impl, Provider Factory, Prompts, Analysis Service |
| 4 | [006-4-api.md](./006-4-api.md) | Hono handlers (proxy to agent RPC), Server Functions |
| 5 | [006-5-ui.md](./006-5-ui.md) | Analysis views, Research reports, useAgent hook |
| 6 | [006-6-ops.md](./006-6-ops.md) | Wrangler config (1 DO), Implementation order, Verification |
