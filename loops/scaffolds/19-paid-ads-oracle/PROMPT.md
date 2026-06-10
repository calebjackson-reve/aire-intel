# Implement Loop: Paid Ads Oracle

**Spec:** `loops/proposed/19-paid-ads-oracle.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:paid-ads-oracle`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Ads oracle route — `src/app/api/agents/ads-oracle/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Check `Setting["ads.lastWeekMetrics"]` — if weekOf = current ISO week, skip
3. Pull Meta Ads campaign data for last 7 days via Meta Graph API:
   ```
   GET https://graph.facebook.com/v18.0/act_{AD_ACCOUNT_ID}/campaigns?fields=id,name,status,insights.date_preset(last_7d){spend,impressions,clicks,actions}&access_token={META_PAGE_ACCESS_TOKEN}
   ```
   Use `withRetry()` and `logError()` on failure.
4. For each campaign with impressions > 0:
   - Calculate: CTR = clicks/impressions×100, CPL = spend/leads (leads from actions where action_type="lead")
   - Compare against thresholds from getSetting("ads.killThreshold.cpl", "25") and getSetting("ads.scaleThreshold.ctr", "3.5")
   - Classify: kill | scale | variant | hold
5. For kill/scale campaigns: create ActionQueue item type="create_lofty_task" with recommendation
6. Update Setting["ads.lastWeekMetrics"] with current week data (JSON)
7. Write to DailyBrief marketMovement section if exists
8. Create Notification with summary

### 2. Add `META_AD_ACCOUNT_ID` to env references
Add a comment in the route: `// Requires: META_AD_ACCOUNT_ID, META_PAGE_ACCESS_TOKEN env vars`
Don't hardcode — read from process.env.

### 3. Add cron to vercel.json
Add: `{ "path": "/api/agents/ads-oracle", "schedule": "0 14 * * 1" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/ads-oracle/route.ts` exists
- vercel.json has cron at `0 14 * * 1`
- TypeScript and build pass
