# Phase 21: Fix Configuration Inconsistencies — Index

> Establish a single source of truth for user configuration by resolving conflicts between `user_trading_config` (Postgres), session config (DO SQLite), and strategy profiles.

Position sizing, LLM model selection, and strategy profiles currently have conflicting defaults scattered across three layers. This design introduces a deterministic config resolution function that merges all sources with a clear priority hierarchy.

## Problem Summary

| Setting | `user_trading_config` (PG) | Session Config (DO SQLite) | Strategy Profile | Conflict |
|---------|---------------------------|---------------------------|-----------------|----------|
| Position size % | 10% (`0.1`) | 5% (`0.05`) | Conservative 3%, Moderate 5%, Aggressive 10% | 3 different defaults, never reconciled |
| LLM model (analyst) | `openai/gpt-4o` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | N/A | Completely different providers |
| LLM model (research) | `openai/gpt-4o-mini` | N/A | N/A | Not used by session agent |
| Strategy position size | N/A | N/A | Hardcoded per profile | Ignores user's trading config |

## Resolution Hierarchy

```
user_trading_config (PG)     <- user's explicit preferences (highest priority)
  | fallback
session_config (DO SQLite)   <- session-specific overrides
  | fallback
strategy_profile             <- preset values (applied, but user can override)
  | fallback
code defaults                <- hardcoded fallback (lowest priority)
```

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [021-1-spec.md](./021-1-spec.md) | Overview, Goals/Non-Goals, Conflict Inventory, Resolution Design, Implementation Plan |
