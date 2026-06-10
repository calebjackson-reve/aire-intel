# Loop Iteration Prompt — revival-performance

You are running one iteration of the `revival-performance` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/15-revival-performance/SPEC.md`
2. `loops/active/15-revival-performance/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/15-revival-performance/`

## What this loop builds

Bi-weekly Monday 7:30AM cron. Route `/api/agents/revival-tracker` that analyzes RevivalCohort records, correlates with ContactLog inbound replies, calculates reply rate and stage advancement, and alerts if reply rate < 8%.

## Implementation units

**Unit A — schema inspection**
- Read `prisma/schema.prisma` — find RevivalCohort model (or equivalent)
- Note fields: repliedAt, converted, stage, leadId, createdAt, messageType/pattern used
- Also check ContactLog for direction="inbound" field
- Record in NOTES.md

**Unit B — revival-tracker route**
- Create `src/app/api/agents/revival-tracker/route.ts`
- POST handler, validate CRON_SECRET
- Pull RevivalCohort records from last 30 days
- For each cohort: check if a ContactLog with `direction = "inbound"` exists for same leadId within 7 days of cohort.createdAt
- Compute:
  - `replyRate = repliedCohorts / Math.max(totalCohorts, 1)`
  - `stageAdvancement = advancedToWarmerStage / Math.max(repliedCohorts, 1)`
- Find best performing messageType/pattern from replied cohorts
- Update Settings: `revival.lastReplyRate = replyRate.toString()`, `revival.bestMessagePattern = topPattern`
- If `replyRate < parseFloat(getSetting("revival.alertThreshold", "0.08"))`: SMS via twilio
- Create Notification with reply rate summary
- Mark `// AIRE: loop:revival-performance`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/revival-tracker", "schedule": "30 13 * * 1" }` (13:30 UTC Monday = 7:30AM CT)
- Note: bi-weekly scheduling not native in Vercel crons — it runs every Monday, but the Setting guard `revival.lastRunWeek` will skip if run was recent

## AIRE conventions (mandatory)

- `// AIRE: loop:revival-performance`; `logError()`, prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
