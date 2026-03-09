# Phase 27: Pipeline Confidence Threshold & Outcome Confidence Recording -- Index

> Fix two bugs where pipeline mode bypasses the `minConfidenceThreshold` gate and hardcodes confidence to 0 in outcome records, causing inconsistent proposal filtering and meaningless pipeline performance data.

Pipeline mode (`PipelineOrchestratorAgent`) has two defects relative to debate mode (`SessionAgent.runDebateAnalysis`):

1. **Missing confidence gate**: Debate mode checks `consensus.confidence >= config.minConfidenceThreshold` before creating a proposal (session-agent.ts line 517). Pipeline mode's `generate_proposal` step (pipeline-orchestrator-agent.ts lines 379-398) only checks `riskValidation.approved` and `recommendation.action !== 'hold'` -- no confidence check. A pipeline proposal with 0.2 confidence passes through when the same signal in debate mode would be filtered at the configured 0.7 threshold.

2. **Hardcoded zero confidence**: `recordStepOutcome()` (pipeline-orchestrator-agent.ts line 243) inserts `${0}` for the `confidence` column in `pipeline_outcomes`. Every resolved pipeline outcome has `confidence = 0`, making confidence-based performance analysis of pipeline strategies impossible.

## Current State

| Component | Location | Issue |
|-----------|----------|-------|
| Debate confidence gate | `session-agent.ts:517` | Works correctly: `consensus.confidence >= config.minConfidenceThreshold` |
| Pipeline proposal generation | `pipeline-orchestrator-agent.ts:379-398` | No confidence check -- any non-hold, risk-approved recommendation becomes a proposal |
| Pipeline outcome recording | `pipeline-orchestrator-agent.ts:238-245` | `confidence` column always inserted as `0` |
| `RunPipelineParams` interface | `pipeline-orchestrator-agent.ts:24-33` | No `minConfidenceThreshold` field |
| `recordStepOutcome` signature | `pipeline-orchestrator-agent.ts:216-219` | `outcome` object has no `confidence` field |
| `distributeOutcome` in SessionAgent | `session-agent.ts:1057-1095` | `resolvedOutcome` does not include `confidence` |

## Target State

- Pipeline mode enforces the same `minConfidenceThreshold` gate as debate mode
- Pipeline outcome records contain the actual confidence value from the LLM recommendation
- Switching between debate and pipeline modes produces consistent filtering behavior
- Pipeline performance analytics (win rate by confidence band) become meaningful

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [027-1-spec.md](./027-1-spec.md) | Overview, Goals/Non-Goals, Root Cause Analysis, Behavioral Impact |
| 2 | [027-2-data.md](./027-2-data.md) | Schema review (no migration), Data flow before/after |
| 3 | [027-3-logic.md](./027-3-logic.md) | Fix 1: Confidence gate, Fix 2: Outcome confidence, SessionAgent changes |
| 4 | [027-4-api.md](./027-4-api.md) | Interface changes, Type updates, Backward compatibility |
| 5 | [027-5-ui.md](./027-5-ui.md) | No UI changes (confirmation only) |
| 6 | [027-6-ops.md](./027-6-ops.md) | Implementation order, Verification criteria, File change summary |
