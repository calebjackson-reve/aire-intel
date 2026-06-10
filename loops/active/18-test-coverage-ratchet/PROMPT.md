# Loop Iteration Prompt — test-coverage-ratchet

You are running one iteration of the `test-coverage-ratchet` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/18-test-coverage-ratchet/SPEC.md`
2. `loops/active/18-test-coverage-ratchet/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/18-test-coverage-ratchet/`

## What this loop builds

Weekly Saturday 1AM CT cron. Route `/api/agents/coverage-ratchet` that runs coverage, compares to baseline, and writes minimal smoke tests to recover any dropped metrics.

## Implementation units

**Unit A — inspect test setup**
- Read `package.json` — check if `test` script is configured and if jest/vitest is installed
- Check for `jest.config.*` or `vitest.config.*` files
- If no test framework at all: note in NOTES.md, create the route as a graceful no-op that returns `{ skipped: true, reason: "no test framework configured" }`
- If tests exist: proceed to Unit B

**Unit B — coverage-ratchet route**
- Create `src/app/api/agents/coverage-ratchet/route.ts`
- POST handler, validate CRON_SECRET
- If no test script in package.json: return `{ skipped: true }` early
- Read baseline from `getSetting("coverage.baseline", "{}")` and parse as JSON
- Execute: note that this route cannot actually RUN tests at request time (shell exec in a serverless function is limited) — instead write the coverage comparison logic for use by the local `loop.sh` runner
- Alternative: write a standalone `loops/active/18-test-coverage-ratchet/coverage-check.sh` script that:
  - Runs `npm test -- --coverage --coverageReporters=json 2>/dev/null`
  - Reads `coverage/coverage-summary.json`
  - Compares to baseline stored in `.coverage-baseline.json`
  - If any metric dropped: writes a minimal smoke test file
  - Updates baseline on improvement
- Mark `// AIRE: loop:test-coverage-ratchet`

**Unit C — minimal smoke test template**
- If creating smoke tests is in scope: create `src/__tests__/smoke.test.ts` (or `.spec.ts` based on project convention)
- Test 1: CRON_SECRET auth gate — POST to a cron route without auth header → expect 401
- Test 2: Prisma import sanity — import prisma, call `prisma.$queryRaw\`SELECT 1\`` and expect result
- Mark `// AIRE: loop:test-coverage-ratchet`

## AIRE conventions (mandatory)

- `// AIRE: loop:test-coverage-ratchet`; `logError()`, additive only

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
