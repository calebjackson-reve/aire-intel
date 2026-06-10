# Implement Loop: Revival Performance Tracker

**Spec:** `loops/proposed/15-revival-performance.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:revival-performance`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Revival tracker route — `src/app/api/agents/revival-tracker/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Skip if `Setting["revival.lastEvaluation"]` is within 12 days
3. Check if `RevivalCohort` count is >= 10; if not, create info Notification and return
4. Pull RevivalCohort records from last 30 days
5. For each cohort member, check ContactLog for inbound replies after cohort date
6. Calculate: replyRate = repliedCount / totalContacted × 100
7. Calculate: stageAdvancement = advanced / totalContacted × 100
8. Identify top 3 performing message patterns (by reply rate) — group by rough message length bucket or draft type stored in cohort
9. Write to Settings:
   - `revival.lastReplyRate`: percentage string
   - `revival.bestMessagePattern`: short description
   - `revival.lastEvaluation`: today's date
10. If replyRate < 8%: create critical Notification + SMS alert
11. Create standard Notification with 2-sentence summary
12. Write AgentRun record

### 2. Add to vercel.json
Add: `{ "path": "/api/agents/revival-tracker", "schedule": "30 13 * * 1" }` (every Monday 7:30AM CT = 13:30 UTC) — only if not present.

### 3. Verify RevivalCohort model
Read `prisma/schema.prisma` — verify `RevivalCohort` has `leadId`, `cohortDate`, `repliedAt`, `converted`, `stage` fields. If any are missing, add them with `// AIRE:` comment and note migration needed.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/revival-tracker/route.ts` exists
- vercel.json has cron at `30 13 * * 1`
- TypeScript and build pass
