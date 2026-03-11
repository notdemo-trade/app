# Phase 1: Infrastructure + Pure Helper Tests

## Goal
Install vitest, configure it for data-service, and write Round 0 tests for pure helper functions. This proves the test toolchain works before touching any agent code.

## Status: DONE

## Steps

### 1. Install dependencies
```bash
pnpm add -D vitest better-sqlite3 @types/better-sqlite3 --filter data-service
```

### 2. Create `apps/data-service/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@repo/data-ops': path.resolve(__dirname, '../../packages/data-ops/src'),
    },
  },
})
```

### 3. Add scripts to `apps/data-service/package.json`
```json
"test": "vitest run",
"test:watch": "vitest"
```

### 4. Create minimal `test/setup.ts`
For Phase 1, only mock the modules that pure helpers import (if any). Start empty:
```ts
// Global test setup — mocks added in later phases
```

### 5. Create directory structure
```
apps/data-service/test/
├── setup.ts
└── helpers/
    └── session-helpers.test.ts
```

### 6. Write Round 0 tests

**File**: `test/helpers/session-helpers.test.ts`
No agent shell needed — pure function imports only.

| # | Test | Verifies |
|---|------|----------|
| 1 | `rowToConfig converts SQL row to SessionConfig` | JSON parsing, field mapping, dataFeeds default |
| 2 | `rowToProposal converts SQL row to TradeProposal` | All field mappings, null handling, JSON arrays |
| 3 | `rowToThread hydrates thread with messages and proposal` | Composition of sub-objects |
| 4 | `rowToMessage parses sender and metadata JSON` | JSON parsing for sender, metadata |
| 5 | `rowToOutcome/rowToSnapshot map correctly` | Field mapping, type casting |
| 6 | `normalizePositionSizePct converts fractions to whole numbers` | 0.05→5, 5→5, 0→0 |
| 7 | `summarizeEnrichment builds readable summary` | Section assembly, edge cases |

Example tests:
```ts
import { describe, expect, test } from 'vitest';
import { normalizePositionSizePct, rowToConfig } from '@/agents/session-agent-helpers';

describe('normalizePositionSizePct', () => {
  test('converts fractions to whole numbers', () => {
    expect(normalizePositionSizePct(0.05)).toBe(5);
    expect(normalizePositionSizePct(0.1)).toBe(10);
  });
  test('leaves whole numbers unchanged', () => {
    expect(normalizePositionSizePct(5)).toBe(5);
    expect(normalizePositionSizePct(10)).toBe(10);
  });
  test('handles zero', () => {
    expect(normalizePositionSizePct(0)).toBe(0);
  });
});

describe('rowToConfig', () => {
  test('converts SQL row to SessionConfig with JSON parsing', () => {
    const row = {
      orchestration_mode: 'debate', broker_type: 'AlpacaBrokerAgent',
      llm_provider: 'workers-ai', llm_model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      watchlist_symbols: '["AAPL","TSLA"]', analysis_interval_sec: 120,
      min_confidence_threshold: 0.7, position_size_pct: 0.05,
      active_strategy_id: 'moderate', debate_rounds: 2,
      proposal_timeout_sec: 900, data_feeds: null,
    };
    const config = rowToConfig(row);
    expect(config.watchlistSymbols).toEqual(['AAPL', 'TSLA']);
    expect(config.orchestrationMode).toBe('debate');
    expect(config.dataFeeds.technicalAnalysis).toBe(true); // default
  });
});
```

## Key Files
| File | Role |
|---|---|
| `apps/data-service/src/agents/session-agent-helpers.ts` | Pure helper functions under test (359 lines) |
| `packages/data-ops/src/agents/session/types.ts` | Type definitions |
| `packages/data-ops/src/agents/session/defaults.ts` | DEFAULT_SESSION_CONFIG |

## Verification
```bash
pnpm run test --filter data-service
```
All 7 Round 0 tests pass. No mocks needed, no agent shell needed.

## Notes
- If vitest struggles to parse TC39 decorators from transitive imports, add `esbuild: { target: 'es2022' }` to vitest config
- Module alias `@repo/data-ops/*` must resolve — check vitest alias config if imports fail
- The `setup.ts` may need `vi.mock('@cloudflare/ai-chat', ...)` even for helpers if the helper file re-exports from the agent module — investigate at implementation time
