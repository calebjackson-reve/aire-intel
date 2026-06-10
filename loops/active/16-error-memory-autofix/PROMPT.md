# Loop Iteration Prompt — error-memory-autofix

You are running one iteration of the `error-memory-autofix` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/16-error-memory-autofix/SPEC.md`
2. `loops/active/16-error-memory-autofix/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/16-error-memory-autofix/`

## What this loop builds

Nightly 2AM CT cron. Route `/api/agents/error-autofix` that reads ErrorLog for recurring patterns (≥3 unresolved), attempts a targeted code fix for the top 3, and marks errors resolved on success or reverts on oracle failure.

## Implementation units

**Unit A — understand error-memory.ts**
- Read `src/lib/error-memory.ts` — find `detectPatterns()`, `getHealthScore()`, `logError()`, and `withRetry()` functions
- Note: what does `detectPatterns()` return? (errorType, message, count, sourceFile, sourceLine, resolved)
- Note: what's the `getHealthScore()` threshold interface?
- Record in NOTES.md — the route depends on these types

**Unit B — error-autofix route**
- Create `src/app/api/agents/error-autofix/route.ts`
- POST handler, validate CRON_SECRET
- Call `getHealthScore()` — if score > 85, update Setting and return early (system healthy)
- Call `detectPatterns()` — get top 3 unresolved patterns by count
- For each pattern (max 3):
  - Check `getSetting("autofix.skippedPatterns", "")` — skip if pattern key in the list (repeatedly failed)
  - Read the source file indicated by `pattern.sourceFile`
  - Attempt a minimal fix: TypeScript null check, missing await, undefined guard (based on error type)
  - Write the fix to the file
  - Run oracle: `npx tsc --noEmit`
  - If oracle passes: mark pattern errors as resolved in ErrorLog, commit
  - If oracle fails: revert the file (read original, write back), add pattern key to skippedPatterns Setting
- Update Setting: `autofix.lastRun = new Date().toISOString()`
- Mark all code `// AIRE: loop:error-memory-autofix`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/error-autofix", "schedule": "0 7 * * *" }` (7:00 UTC = 2AM CT)

## AIRE conventions (mandatory)

- `// AIRE: loop:error-memory-autofix`; `logError()`, prisma from `src/lib/prisma.ts`
- Additive EXCEPT for the intentional fix → revert pattern (that's the whole point)

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
