# Implement Loop: Competitor Monitor

**Spec:** `loops/proposed/21-competitor-monitor.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:competitor-monitor`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Competitor monitor route — `src/app/api/agents/competitor-monitor/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Skip if `Setting["competitor.lastDigest"]` is within 6 days
3. Parse tracked ZIPs from `getSetting('competitor.trackedZips', '["70808","70810","70816","70820"]')`
4. Call `fetchListings()` from `src/lib/paragon.ts` with date filter for last 7 days and ZIP filter
5. Group listings by listingAgent name (field name may vary — check the Paragon response type)
6. Find: agents with >= 5 new listings, listings under contract in < 3 days, price reductions > 5%
7. Build a digest string: "This week in Baton Rouge RE: [3-5 observations]."
   - Use hardcoded summary format (no AI call — just format the data)
   - OR call Claude Haiku via the existing AI route if the AI call pattern is established
8. Write digest to DailyBrief.marketMovement (upsert today's brief record)
9. Create Notification
10. Update Setting["competitor.lastDigest"] = today

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/competitor-monitor", "schedule": "0 13 * * 5" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

Check `src/lib/paragon.ts` for the exact `fetchListings()` signature and return type before writing the call.

## Done When
- `src/app/api/agents/competitor-monitor/route.ts` exists
- vercel.json has cron at `0 13 * * 5`
- TypeScript and build pass
