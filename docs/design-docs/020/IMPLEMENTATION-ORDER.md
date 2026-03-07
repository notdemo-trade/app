# Phase 020 — Implementation Order

Run these commands sequentially. Each must pass verification before moving to the next.

## Sequential

```
/implement 020 M2
```
Scaffold + Workers AI provider. Zero behavior change.

```
/implement 020 M3
```
Refactor TA agent (extract data fetching into AlpacaMarketDataAgent).

```
/implement 020 M4
```
Persona support in LLMAnalysisAgent. Can run in parallel with M3 if M2 is done.

```
/implement 020 M5
```
Orchestration modes (DebateOrchestratorAgent + PipelineOrchestratorAgent). Requires M3 + M4.

```
/implement 020 M6
```
SessionAgent as primary UI entry point + frontend components. Requires M5.

```
/implement 020 M7
```
Deprecate OrchestratorAgent. **BREAKING** — verify M6 in staging 24h+ first.

## Memory & Scoring (after M6, parallel with M7)

```
/implement 020 M8a
```
Outcome tracking in SessionAgent.

```
/implement 020 M8b
```
Persona/pipeline memory tables + scoring.

```
/implement 020 M8c
```
Memory-augmented prompts.

```
/implement 020 M8d
```
Performance UI (score cards, outcome history, dashboard).

## Dependency Graph

```
M2
├── M3  ──────┐
└── M4  ──────┤  (parallel OK)
              M5
              │
              M6
              ├── M7 (BREAKING)
              └── M8a → M8b → M8c → M8d
```

## Verification Between Phases

After each `/implement` command, confirm:
- `pnpm run setup` builds
- `pnpm run lint` clean
- `pnpm run dev:data-service` starts on 8788
- Existing orchestrator API still works (until M7)
