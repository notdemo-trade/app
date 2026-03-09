# Phase 030: Schedule Lifecycle Management -- Part 3: Logic

## New Helper: `cancelAllSchedules()`

### Purpose

Centralize schedule cancellation into a single method used by `start()`, `stop()`, and `onStart()`. This prevents future bugs when new schedule types are added -- all cancellation goes through one path.

### Implementation

```ts
private async cancelAllSchedules(): Promise<void> {
    const existing = this.getSchedules();
    for (const s of existing) {
        await this.cancelSchedule(s.id);
    }
}
```

**Key design choices:**

1. **No filter on callback name**: Cancels every schedule, regardless of callback. This is intentional -- there should be no schedule that survives a `stop()` or needs to persist across a `start()` restart.
2. **Sequential cancellation**: Schedules are canceled one at a time in a loop. Parallel cancellation with `Promise.all()` would be faster but adds complexity for a list that will never exceed 2-3 items in practice.
3. **No error handling**: If `cancelSchedule()` throws, the error propagates to the caller. This is correct because a failed cancellation means a leaked schedule, which is the exact bug we are fixing. The caller should handle or surface the error.

### Placement

Add as a private method on `SessionAgent`, grouped with the existing `rescheduleAnalysisCycle()` helper in the "Scheduling helpers" section (after line 170).

---

## Fix 1: `stop()` -- Cancel ALL Schedules

### Current Code (session-agent.ts, lines 184-194)

```ts
@callable()
async stop(): Promise<SessionState> {
    this.setState({ ...this.state, enabled: false });
    // Cancel analysis schedule
    const existing = this.getSchedules();
    for (const s of existing) {
        if (s.callback === 'runScheduledCycle') {
            await this.cancelSchedule(s.id);
        }
    }
    return this.state;
}
```

### Fixed Code

```ts
@callable()
async stop(): Promise<SessionState> {
    this.setState({ ...this.state, enabled: false });
    await this.cancelAllSchedules();
    return this.state;
}
```

### Changes

- Removed the `getSchedules()` + filter loop
- Replaced with `cancelAllSchedules()` which cancels all schedules unconditionally
- The `// Cancel analysis schedule` comment is removed because the new helper is self-documenting

### Behavior Change

| Before | After |
|--------|-------|
| Only `runScheduledCycle` schedules canceled | All schedules canceled |
| `runOutcomeTrackingCycle` continues firing | `runOutcomeTrackingCycle` stops |
| `getSchedules()` returns 1+ items after stop | `getSchedules()` returns 0 items after stop |

---

## Fix 2: `start()` -- Prevent Schedule Accumulation

### Current Code (session-agent.ts, lines 175-181)

```ts
@callable()
async start(): Promise<SessionState> {
    const config = this.loadConfig();
    this.setState({ ...this.state, enabled: true });
    await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
    await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
    return this.state;
}
```

### Fixed Code

```ts
@callable()
async start(): Promise<SessionState> {
    const config = this.loadConfig();
    this.setState({ ...this.state, enabled: true });
    await this.cancelAllSchedules();
    await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
    await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
    return this.state;
}
```

### Changes

- Added `await this.cancelAllSchedules()` before creating new schedules
- `rescheduleAnalysisCycle()` still runs (it has its own internal cancel logic for analysis schedules, which is now redundant but harmless -- it will find zero `runScheduledCycle` schedules to cancel since `cancelAllSchedules()` already removed them)

### Behavior Change

| Before | After |
|--------|-------|
| Each `start()` adds a new `runOutcomeTrackingCycle` | Each `start()` starts fresh with exactly 1 |
| N starts = N outcome tracking schedules | N starts = always 1 outcome tracking schedule |
| `rescheduleAnalysisCycle()` is the only cleanup | `cancelAllSchedules()` cleans everything first |

### Note on `rescheduleAnalysisCycle()` Redundancy

After adding `cancelAllSchedules()` to `start()`, the internal cancellation in `rescheduleAnalysisCycle()` becomes redundant (there are no `runScheduledCycle` schedules left to cancel). However, `rescheduleAnalysisCycle()` is also called from `updateConfig()` when the interval changes, where `cancelAllSchedules()` would be inappropriate (we only want to reschedule analysis, not outcome tracking). Therefore, `rescheduleAnalysisCycle()` retains its internal cancellation logic.

---

## Fix 3: `onStart()` -- Clean Slate on DO Restart

### Current Code (session-agent.ts, lines 77-94)

```ts
async onStart() {
    initDatabase({
        host: this.env.DATABASE_HOST,
        username: this.env.DATABASE_USERNAME,
        password: this.env.DATABASE_PASSWORD,
    });

    this.initTables();
    this.seedDefaults();

    const config = this.loadConfig();
    this.setState({ ...this.state, analysisIntervalSec: config.analysisIntervalSec });

    if (this.state.enabled) {
        await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
        await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
    }
}
```

### Fixed Code

```ts
async onStart() {
    initDatabase({
        host: this.env.DATABASE_HOST,
        username: this.env.DATABASE_USERNAME,
        password: this.env.DATABASE_PASSWORD,
    });

    this.initTables();
    this.seedDefaults();

    const config = this.loadConfig();
    this.setState({ ...this.state, analysisIntervalSec: config.analysisIntervalSec });

    // Clean slate: cancel any orphaned schedules from a previous DO instance
    await this.cancelAllSchedules();

    if (this.state.enabled) {
        await this.rescheduleAnalysisCycle(config.analysisIntervalSec);
        await this.scheduleEvery(300, 'runOutcomeTrackingCycle');
    }
}
```

### Changes

- Added `await this.cancelAllSchedules()` **before** the `if (enabled)` check
- This handles the edge case where `enabled` is false but orphaned schedules exist from a previous instance (e.g., `stop()` failed mid-cancellation, then the DO was evicted and restarted)

### Behavior Change

| Before | After |
|--------|-------|
| DO restart with `enabled: true` adds schedules on top of any surviving ones | DO restart always starts with a clean slate |
| DO restart with `enabled: false` leaves orphaned schedules untouched | DO restart with `enabled: false` cleans up orphans |

---

## Fix 4: `runOutcomeTrackingCycle()` -- Safety Guard

### Current Code (session-agent.ts, lines 965-1016)

```ts
async runOutcomeTrackingCycle(): Promise<void> {
    try {
        const userId = this.name;
        const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
            this.env.AlpacaBrokerAgent,
            userId,
        );
        // ... broker API calls ...
    } catch (err) {
        // ... error handling ...
    }
}
```

### Fixed Code

```ts
async runOutcomeTrackingCycle(): Promise<void> {
    if (!this.state.enabled) return;

    try {
        const userId = this.name;
        const broker = await getAgentByName<Env, AlpacaBrokerAgent>(
            this.env.AlpacaBrokerAgent,
            userId,
        );
        // ... broker API calls (unchanged) ...
    } catch (err) {
        // ... error handling (unchanged) ...
    }
}
```

### Changes

- Added `if (!this.state.enabled) return;` at the top of the method

### Why This Is a Safety Net, Not the Primary Fix

This guard is defense-in-depth. The primary fix is in `stop()` and `start()`. The guard handles edge cases:

1. **Race condition**: `stop()` is called while `runOutcomeTrackingCycle()` is about to execute. The schedule fires before `cancelSchedule()` processes it.
2. **Failed cancellation**: `cancelAllSchedules()` throws partway through, leaving one schedule uncanceled.
3. **Future bugs**: If a new code path accidentally creates a schedule without proper cleanup, the guard prevents it from doing real work when the session is stopped.

The guard adds minimal overhead (a single boolean check) and prevents all downstream broker API calls.

---

## Method Call Flow (After Fix)

### `start()` Flow

```
start()
  |-- setState({ enabled: true })
  |-- cancelAllSchedules()          // Remove ALL existing schedules
  |     |-- getSchedules()          // Returns 0..N schedules
  |     |-- cancelSchedule(id)      // For each schedule
  |
  |-- rescheduleAnalysisCycle(sec)  // Cancel runScheduledCycle (redundant, finds 0)
  |     |-- schedule(nextAt, 'runScheduledCycle')  // Create one-shot
  |
  |-- scheduleEvery(300, 'runOutcomeTrackingCycle')  // Create recurring
  |
  |-- return state                  // 2 schedules active
```

### `stop()` Flow

```
stop()
  |-- setState({ enabled: false })
  |-- cancelAllSchedules()          // Remove ALL schedules
  |     |-- getSchedules()          // Returns 2 schedules (normally)
  |     |-- cancelSchedule(id)      // Cancel runScheduledCycle
  |     |-- cancelSchedule(id)      // Cancel runOutcomeTrackingCycle
  |
  |-- return state                  // 0 schedules active
```

### `onStart()` Flow (enabled: true)

```
onStart()
  |-- initDatabase(...)
  |-- initTables()
  |-- seedDefaults()
  |-- loadConfig()
  |-- setState({ analysisIntervalSec })
  |
  |-- cancelAllSchedules()          // Clean orphans from previous instance
  |
  |-- [enabled: true]
  |     |-- rescheduleAnalysisCycle(sec)
  |     |-- scheduleEvery(300, 'runOutcomeTrackingCycle')
  |
  |-- // 2 schedules active
```

### `onStart()` Flow (enabled: false)

```
onStart()
  |-- initDatabase(...)
  |-- initTables()
  |-- seedDefaults()
  |-- loadConfig()
  |-- setState({ analysisIntervalSec })
  |
  |-- cancelAllSchedules()          // Clean orphans from previous instance
  |
  |-- [enabled: false]              // Skip schedule creation
  |
  |-- // 0 schedules active
```

### `runOutcomeTrackingCycle()` Flow (After Fix)

```
runOutcomeTrackingCycle()
  |-- [enabled: false?] -> return   // Safety guard
  |
  |-- [enabled: true]
  |     |-- getAgentByName(broker)
  |     |-- broker.getClock()
  |     |-- [market closed?] -> return
  |     |-- query tracking outcomes
  |     |-- broker.getPositions()
  |     |-- for each tracking outcome:
  |     |     |-- resolve or snapshot
  |     |     |-- check exit conditions
```

---

## Error Handling

### `cancelAllSchedules()` Failure

If `cancelSchedule()` throws for a specific schedule ID:

- The error propagates to the caller (`start()`, `stop()`, or `onStart()`)
- In `start()`: The session may end up with leaked schedules + new schedules. The `enabled` check in `runOutcomeTrackingCycle()` is the safety net.
- In `stop()`: `enabled` is already set to `false` before `cancelAllSchedules()` runs, so the `runOutcomeTrackingCycle()` guard will prevent execution even if cancellation fails.
- In `onStart()`: `cancelAllSchedules()` runs before schedule creation. If it fails, the existing schedules remain, but the `if (enabled)` block will not add new ones (it runs after). On the next DO restart, `onStart()` will try again.

### Design Choice: `setState` Before `cancelAllSchedules` in `stop()`

The order in `stop()` is intentional:

```ts
this.setState({ ...this.state, enabled: false });  // 1. Set state first
await this.cancelAllSchedules();                     // 2. Cancel schedules second
```

If cancellation fails, `enabled: false` is already set, so the `runOutcomeTrackingCycle()` guard prevents execution. This is defense-in-depth: the state change is the primary "off switch" and the schedule cancellation is the cleanup.

---

## Impact on `updateConfig()`

The existing `updateConfig()` method (line 197-216) calls `rescheduleAnalysisCycle()` when the analysis interval changes. This method is NOT modified because:

1. `updateConfig()` should only reschedule the analysis cycle, not cancel outcome tracking
2. `rescheduleAnalysisCycle()` correctly handles its own cleanup (cancel existing `runScheduledCycle` + create new one)
3. There is no scenario where `updateConfig()` causes schedule accumulation

```ts
@callable()
async updateConfig(partial: Partial<SessionConfig>): Promise<SessionConfig> {
    // ...
    if (partial.analysisIntervalSec) {
        this.setState({ ...this.state, analysisIntervalSec: updated.analysisIntervalSec });
        if (this.state.enabled) {
            await this.rescheduleAnalysisCycle(updated.analysisIntervalSec);
            // Note: outcome tracking schedule is NOT touched here (correct)
        }
    }
    return updated;
}
```
