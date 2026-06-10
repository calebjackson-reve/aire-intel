# Loop Iteration Prompt — competitor-monitor

You are running one iteration of the `competitor-monitor` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/21-competitor-monitor/SPEC.md`
2. `loops/active/21-competitor-monitor/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/21-competitor-monitor/`

## What this loop builds

Weekly Friday 7AM CT cron. Route `/api/agents/competitor-monitor` that fetches Paragon listings + status changes in tracked BRR ZIPs for last 7 days. Identifies high-volume agents, fast-moving listings, price reductions. Writes digest to DailyBrief.marketMovement.

## Implementation units

**Unit A — inspect paragon.ts**
- Read `src/lib/paragon.ts` — find `fetchListings()` function signature and return type
- Note: can it filter by ZIP code? Can it return listing agent name? Can it filter by status change date?
- Note actual parameter interface for use in Unit B

**Unit B — competitor-monitor route**
- Create `src/app/api/agents/competitor-monitor/route.ts`
- POST handler, validate CRON_SECRET
- Guard: `getSetting("competitor.lastDigest", "")` — skip if within last 6 days
- Get tracked ZIPs: `getSetting("competitor.trackedZips", "70810,70817,70820,70806,70808")` and split to array
- For each ZIP batch: call `withRetry(() => paragon.fetchListings({ zip, limit: 50, daysBack: 7 }))`
- From the results:
  - Find listings with status change to "Sold" or "Pending" in last 7 days → fast movers
  - Find listings with price reduction → price activity
  - Count listings by listing agent name → identify high-volume agents (top 3)
- Compose digest string: "This week: {soldCount} closings, {pendingCount} went pending. Fast movers: {address1}, {address2}. Top agent: {agentName} with {count} listings."
- Read `DailyBrief` for today → update `marketMovement` field (append, don't overwrite)
- Update Setting: `competitor.lastDigest = new Date().toISOString()`
- Mark `// AIRE: loop:competitor-monitor`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/competitor-monitor", "schedule": "0 13 * * 5" }` (13:00 UTC Friday = 7AM CT)

## AIRE conventions (mandatory)

- Read-only with respect to lead/contact data — no lead mutations
- `// AIRE: loop:competitor-monitor`; `withRetry()` for Paragon calls, `logError()`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
