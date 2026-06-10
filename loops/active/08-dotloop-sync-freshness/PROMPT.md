# Loop Iteration Prompt — dotloop-sync-freshness

You are running one iteration of the `dotloop-sync-freshness` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/08-dotloop-sync-freshness/SPEC.md`
2. `loops/active/08-dotloop-sync-freshness/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/08-dotloop-sync-freshness/`

## What this loop builds

Add `getLoopDetails(loopId)` to `src/lib/dotloop.ts`. Add a sync freshness check to the transaction-watchdog route that polls stale loops and alerts when closing is within 48h and last sync was >12h ago.

## Implementation units

**Unit A — getLoopDetails() in dotloop.ts**
- Read `src/lib/dotloop.ts` — find the auth pattern, base URL, and existing functions
- Add `getLoopDetails(loopId: string): Promise<DotloopLoopDetail | null>` at the bottom
- Calls DotLoop API: `GET /api/v2/me/loop/{loopId}` 
- Returns parsed loop data including: `updatedAt`, `status`, `milestones`
- Use `withRetry()` for the API call
- On 401: update `Setting["dotloop.authStatus"] = "expired"`, throw error
- Mark `// AIRE: loop:dotloop-sync-freshness`

**Unit B — transaction-watchdog sync freshness pass**
- Read `src/app/api/agents/transaction-watchdog/route.ts`
- After the milestone check section, add a sync freshness pass:
  - Query Lead where `closingDate` is within 48h AND `dotloopLoopId` is set (check actual field name in schema)
  - For each: call `getLoopDetails(lead.dotloopLoopId)`
  - If `getLoopDetails` returns data AND `updatedAt` is > 12h ago:
    - Create Notification: `type: "warning"`, message: "{address}: closing in {hours}h but DotLoop last synced {hours}h ago"
    - If `closingDate` is within 24h: also send SMS via twilio
  - Wrap entire pass in try/catch — never let this crash the watchdog

**Unit C — auth status guard**
- In the sync freshness pass, check `getSetting("dotloop.authStatus", "ok")` before starting
- If `"expired"`, create Notification and skip the pass entirely (don't thrash the API with 401s)

## AIRE conventions (mandatory)

- `// AIRE: loop:dotloop-sync-freshness` on all new code
- `withRetry()`, `logError()`, import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
