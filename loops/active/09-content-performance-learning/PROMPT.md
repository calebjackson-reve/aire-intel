# Loop Iteration Prompt — content-performance-learning

You are running one iteration of the `content-performance-learning` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/09-content-performance-learning/SPEC.md`
2. `loops/active/09-content-performance-learning/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/09-content-performance-learning/`

## What this loop builds

Weekly Sunday 11PM cron. Route `/api/agents/content-learning` that pulls 30-day Meta engagement data, identifies top/bottom performing content types, and writes insights to Settings for the content-scheduler to use next day.

## Implementation units

**Unit A — understand meta-insights.ts**
- Read `src/lib/meta-insights.ts` — find `buildContentAudit()` function
- Note: what does it return? What fields does the return type have? (contentType, engagementRate, reach, likes, etc.)
- If `buildContentAudit()` doesn't exist: create a stub that calls `src/lib/meta.ts` functions to fetch 30-day post data

**Unit B — content-learning route**
- Create `src/app/api/agents/content-learning/route.ts`
- POST handler, validate CRON_SECRET
- Create AgentRun record: `agentType: "content_learning"`
- Call `withRetry(() => buildContentAudit())` from meta-insights.ts
- Group results by contentType, compute average engagementRate per type
- Sort ascending + descending to find top and bottom performers
- Find best day of week and best time of day from the data
- Update Settings:
  - `content.topType = topPerformer.type`
  - `content.bottomType = bottomPerformer.type`
  - `content.bestDayOfWeek = bestDay`
  - `content.bestTimeOfDay = bestHour`
  - `content.lastLearningRun = new Date().toISOString()`
- Create Notification with 2-sentence insight (e.g., "Market updates got 2.3x engagement this week. Best posting day: Tuesday at 9am.")
- Mark `// AIRE: loop:content-performance-learning`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/content-learning", "schedule": "0 5 * * 0" }` (5am UTC Sunday = 11pm CT Saturday)

## AIRE conventions (mandatory)

- Additive only; `// AIRE: loop:content-performance-learning`
- `withRetry()` for Meta API call, `logError()` on catches

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
