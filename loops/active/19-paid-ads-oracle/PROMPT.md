# Loop Iteration Prompt — paid-ads-oracle

You are running one iteration of the `paid-ads-oracle` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/19-paid-ads-oracle/SPEC.md`
2. `loops/active/19-paid-ads-oracle/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/19-paid-ads-oracle/`

## What this loop builds

Weekly Monday 8AM CT cron. Route `/api/agents/ads-oracle` that pulls Meta Ads campaign performance for last 7 days, classifies campaigns as kill/scale/variant/hold, and creates ActionQueue tasks for kill/scale decisions.

## Implementation units

**Unit A — inspect existing Meta library**
- Read `src/lib/meta.ts` — find the Graph API base URL, access token pattern, and any existing campaign/insights functions
- Note the META_ACCESS_TOKEN, META_PAGE_ID, and META_AD_ACCOUNT_ID env vars (check `.env.example` or actual env usage)
- If ads insights functions already exist: use them. If not, proceed to Unit B.

**Unit B — ads-oracle route**
- Create `src/app/api/agents/ads-oracle/route.ts`
- POST handler, validate CRON_SECRET
- Fetch campaigns: `GET https://graph.facebook.com/v18.0/act_{AD_ACCOUNT_ID}/campaigns?fields=id,name,status,insights{spend,impressions,clicks,actions}&date_preset=last_7d`
- Use `withRetry()` for the fetch
- For each campaign with spend > 0:
  - Compute `CTR = clicks / Math.max(impressions, 1)`
  - Compute `CPL = spend / Math.max(leadActions, 1)` (leadActions = actions where action_type includes "lead")
  - Read thresholds: `getSetting("ads.maxCPL", "50")`, `getSetting("ads.minCTR", "0.01")`
  - Classify: `CPL > maxCPL AND CTR < minCTR` → kill; `CPL < maxCPL * 0.5` → scale; `CTR < minCTR` → variant; else hold
- For kill/scale campaigns: create ActionQueue `type: "create_lofty_task"` (repurposing as an action item), payload: `{campaignId, name, recommendation, spend, ctr, cpl}`, `requiresApproval: true`, priority 3
- Update Setting: `ads.lastWeekMetrics = JSON.stringify(metrics)`
- Mark `// AIRE: loop:paid-ads-oracle`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/ads-oracle", "schedule": "0 14 * * 1" }` (14:00 UTC Monday = 8AM CT)

## AIRE conventions (mandatory)

- `// AIRE: loop:paid-ads-oracle`; `withRetry()` for Meta API, `logError()`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
