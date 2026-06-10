# Loop Iteration Prompt — goal-pacing-alert

You are running one iteration of the `goal-pacing-alert` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/06-goal-pacing-alert/SPEC.md`
2. `loops/active/06-goal-pacing-alert/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/06-goal-pacing-alert/`

## What this loop builds

Weekly Monday 7AM cron. POST route `/api/agents/goal-pacing` that compares leads + contacts + closings against Setting targets. Sends a pacing notification.

## Implementation units

**Unit A — inspect schema**
- Read `prisma/schema.prisma` — verify ContactLog has a `direction` field (or equivalent to identify outbound contacts). Verify Lead has a `status` field for closed/active leads.
- Note the actual field names; use them in Unit B.

**Unit B — goal-pacing route**
- Create `src/app/api/agents/goal-pacing/route.ts`
- POST handler, validate `Authorization: Bearer ${process.env.CRON_SECRET}`
- Read goals from Settings (skip silently if not set):
  - `getSetting("goal.leadsPerWeek", "0")` — target new leads/week
  - `getSetting("goal.closingsPerMonth", "0")` — target closings/month
  - `getSetting("goal.outboundContactsPerWeek", "0")` — target outbound messages/week
- Count actual values from last 7 days:
  - New leads: Lead.createdAt > 7 days ago
  - Outbound contacts: ContactLog.direction = "outbound" AND createdAt > 7 days ago
  - Closings this month: Lead where status indicates closed AND updatedAt in current calendar month
- Compute pacing %: `(actual / Math.max(target, 1)) * 100`
- Status: green = ≥85%, yellow = 60-84%, red = <60%
- Create Notification with pacing summary (include emoji-free status string)
- Update Setting: `goal.lastPacingCheck = new Date().toISOString()`
- Mark `// AIRE: loop:goal-pacing-alert`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/goal-pacing", "schedule": "0 13 * * 1" }` (13:00 UTC = 7 AM CT, Monday)

## AIRE conventions (mandatory)

- Additive only; `// AIRE: loop:goal-pacing-alert`
- `logError()` on catches, import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
