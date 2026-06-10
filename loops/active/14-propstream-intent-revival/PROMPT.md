# Loop Iteration Prompt — propstream-intent-revival

You are running one iteration of the `propstream-intent-revival` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/14-propstream-intent-revival/SPEC.md`
2. `loops/active/14-propstream-intent-revival/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/14-propstream-intent-revival/`

## What this loop builds

Weekly Wednesday 7AM cron. Route `/api/agents/intent-revival` that scores cold leads by Paragon listing activity in their target areas, then generates targeted revival drafts for the top 10 scored leads.

## Implementation units

**Unit A — schema inspection**
- Read `prisma/schema.prisma` — find Lead model
- Note: does Lead have `areas`, `priceMin`, `priceMax`, `status` fields? Does it have a `temperature` or `stage` field that would identify "cold" leads?
- Record findings in NOTES.md

**Unit B — intent-revival route**
- Create `src/app/api/agents/intent-revival/route.ts`
- POST handler, validate CRON_SECRET
- Guard: get current ISO week string (`new Date().toISOString().slice(0, 10).slice(0, 7) + '-W' + getWeekNumber(new Date())`). Check `getSetting("propstream.lastRunWeek", "")` — skip if matches.
- Query cold leads: status in ["cold", "dead"] or temperature < 30 (use actual field name)
- For each cold lead: call `paragon.fetchListings({ areas: lead.areas, limit: 10 })` to get recent activity
- Score: `newListings * 2 + priceDrops * 3` — more activity in their area = higher intent signal
- Sort by score descending, take top 10
- For each of the top 10:
  - Check ContactLog dedup: no outbound contact in last 30 days
  - Check ActionQueue dedup: no draft_message for same leadId in current week
  - Call `generateDraft()` with context: `{ lead, reason: "intent_revival", topListing: listings[0] }`
  - Create ActionQueue: `type: "draft_message"`, `requiresApproval: true`, priority 4
- Update Setting: `propstream.lastRunWeek = currentWeek`
- Mark `// AIRE: loop:propstream-intent-revival`

**Unit C — vercel.json cron entry**
- Add `{ "path": "/api/agents/intent-revival", "schedule": "0 13 * * 3" }` (13:00 UTC Wednesday = 7AM CT)

## AIRE conventions (mandatory)

- `// AIRE: loop:propstream-intent-revival`; `withRetry()` for Paragon calls, `logError()`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
