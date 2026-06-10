# Implement Loop: Content Performance Learning

**Spec:** `loops/proposed/09-content-performance-learning.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:content-performance-learning`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Content learning route — `src/app/api/agents/content-learning/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Skip if `Setting["content.lastLearningRun"]` is within 6 days
3. Call `buildContentAudit()` from `src/lib/meta-insights.ts` — get last 30 days engagement data
4. Group ContentPerformance records by post type (read from linked ScheduledPost.type or caption pattern)
5. Calculate per-type averages: engagementRate, saves/reach ratio
6. Identify top 3 and bottom 2 performing content types
7. Write to Settings:
   - `content.topType`: best-performing type slug
   - `content.bestDayOfWeek`: integer 0-6
   - `content.bestTimeOfDay`: hour integer
   - `content.lastLearningRun`: today's date
8. Create Notification with 2-sentence summary
9. Update ContentPerformance records with latest data from Meta

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/content-learning", "schedule": "0 5 * * 0" }` (Sunday 11PM CT = Monday 5AM UTC) — only if not present.

### 3. Check ScheduledPost model
Read `prisma/schema.prisma` — verify `ScheduledPost` has a `type` field. If not, add `type String? @default("general")` with `// AIRE:` comment.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

Read `src/lib/meta-insights.ts` to understand `buildContentAudit()` return type before writing the analysis logic.

## Done When
- `src/app/api/agents/content-learning/route.ts` exists
- vercel.json has cron at `0 5 * * 0`
- TypeScript and build pass
