# Loop Iteration Prompt — sphere-reactivation

You are running one iteration of the `sphere-reactivation` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/10-sphere-reactivation/SPEC.md`
2. `loops/active/10-sphere-reactivation/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/10-sphere-reactivation/`

## What this loop builds

Monthly 1st 8AM cron. Route `/api/agents/sphere-reactivation` that finds sphere contacts inactive for 60+ days, prioritizes by birthdays/anniversaries, and queues 10 personalized check-in drafts.

## Implementation units

**Unit A — schema inspection**
- Read `prisma/schema.prisma` — find Lead model
- Note: does it have `source`, `tags`, `birthday`, `anniversaryDate`, `lastContactedAt` fields?
- If `lastContactedAt` is missing but ContactLog exists, we'll derive it from ContactLog.createdAt
- Note the actual field names for use in Unit B

**Unit B — sphere-reactivation route**
- Create `src/app/api/agents/sphere-reactivation/route.ts`
- POST handler, validate CRON_SECRET
- Guard: check `getSetting("sphere.lastRunMonth", "")` — skip if matches current month (format: "YYYY-MM")
- Query sphere leads: `source = "sphere"` OR `tags` contains `"sphere"` (use JSON contains or string search based on how tags is stored)
- Filter: `lastContactedAt < 60 days ago` OR `lastContactedAt is null`
- Prioritize: birthday this month → anniversary this month → most stale
- Take top 10
- For each:
  - Check ContactLog dedup (no outbound in last 30 days)
  - Check ActionQueue dedup (no draft_message pending for same leadId)
  - Call `generateDraft()` from draft-agent.ts with context: `{ lead, reason: "sphere_reactivation", staleDays }`
  - Create ActionQueue: `type: "draft_message"`, `requiresApproval: true`, priority 6
- Update Setting: `sphere.lastRunMonth = new Date().toISOString().slice(0, 7)`
- Mark all code `// AIRE: loop:sphere-reactivation`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/sphere-reactivation", "schedule": "0 14 1 * *" }` (14:00 UTC 1st = 8AM CT 1st)

## AIRE conventions (mandatory)

- `// AIRE: loop:sphere-reactivation`; `withRetry()`, `logError()`, prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
