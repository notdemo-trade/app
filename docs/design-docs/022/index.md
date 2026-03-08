# Phase 22: Technical Analysis Configuration Profiles — Index

> Allow users to customize all technical indicator periods, signal detection thresholds, and agent analysis settings through a per-user configuration profile stored in Postgres. Replace all hardcoded constants with user-configurable values, and provide preset profiles for common trading styles.

Currently, all indicator periods (SMA, EMA, RSI, Bollinger, ATR, MACD), signal thresholds (RSI oversold/overbought, volume spike), and agent-level settings (min bars, cache freshness, pattern samples) are hardcoded across `calculations.ts`, `signals.ts`, agent files, and frontend display components. This creates a rigid system where every user gets identical analysis parameters regardless of their trading style.

## Current Problem

| Category | File | Hardcoded Values |
|----------|------|-----------------|
| Indicator periods | `calculations.ts` | SMA [20,50,200], EMA [12,26], RSI 14, BB 20/2.0, ATR 14, Vol SMA 20, MACD Signal 9 |
| Signal thresholds | `signals.ts` | RSI <30/>70, Volume >2.0x, BB strength +0.3, SMA cross x10, Vol strength /4 |
| Agent settings | `technical-analysis-agent.ts` | Min bars 50, default fetch 250, cache 60s |
| Agent settings | `debate-orchestrator-agent.ts` | Min pattern samples 5, calibration thresholds 0.5/0.2 |
| Frontend display | `indicator-panels.tsx` | RSI <30/>70, Volume >2x |

## Solution

1. New `technical_analysis_config` table (Postgres) -- one row per user
2. Preset profiles: Default, Day Trader, Swing Trader, Position Trader
3. All calculation/signal functions accept a config parameter
4. Agents fetch user config and pass it through the analysis pipeline
5. Frontend reads thresholds from config for display coloring
6. REST API endpoints for CRUD + preset application

## Sub-docs

| Part | File | Sections |
|------|------|----------|
| 1 | [022-1-spec.md](./022-1-spec.md) | Overview, Goals/Non-Goals, Config Schema, Preset Profiles, Data Flow |
| 2 | [022-2-data.md](./022-2-data.md) | Drizzle Table, Zod Schemas, Preset Definitions, Migration |
| 3 | [022-3-logic.md](./022-3-logic.md) | Parameterized Calculations, Parameterized Signals, Config Resolution |
| 4 | [022-4-api.md](./022-4-api.md) | REST Endpoints, Service Layer, Server Functions |
| 5 | [022-5-ui.md](./022-5-ui.md) | Settings Page, Form Layout, Preset Selector, Live Preview |
| 6 | [022-6-ops.md](./022-6-ops.md) | Migration Steps, Implementation Order, Verification |
