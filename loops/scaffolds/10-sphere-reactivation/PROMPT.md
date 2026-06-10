# Implement Loop: Sphere Reactivation

**Spec:** `loops/proposed/10-sphere-reactivation.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:sphere-reactivation`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Sphere reactivation route — `src/app/api/agents/sphere-reactivation/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Check `Setting["sphere.lastRunMonth"]` — skip if already ran this month (compare YYYY-MM)
3. Query `Lead` where source = "sphere" OR tags contains "sphere", stage not in ["closed_won", "closed_lost"], tags not containing "do_not_contact"
4. Apply `lastContactedAt < (now - threshold_days)` filter where threshold = getSetting("sphere.reactivationThreshold", "60")
5. Sort priority: leads with birthday or anniversary within 14 days first (requires `Lead.birthday` and `Lead.anniversary` fields — check schema; if absent, skip birthday logic)
6. Take top 10
7. For each:
   - Check ContactLog for recent contact (last 30 days) — skip if exists
   - Check ActionQueue for existing pending draft — skip if exists for same leadId this month
   - Call `generateDraft()` with template type "sphere_checkin"
   - Create ActionQueue item: type = "draft_message", priority = 6, requiresApproval = true
8. Set `Setting["sphere.lastRunMonth"]` = current YYYY-MM
9. Create Notification: "10 sphere check-ins queued"
10. Write AgentRun record

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/sphere-reactivation", "schedule": "0 14 1 * *" }` — only if not present.

### 3. Check Lead model
Before writing queries, read `prisma/schema.prisma` to verify `Lead` has `source`, `tags`, `birthday`, `anniversary` fields. If any are missing, add them as `String? @default("")` (for source/tags) or `DateTime?` (for birthday/anniversary) with a comment `// AIRE: loop:sphere-reactivation`.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```
If schema changes were needed, note: "Migration required: `npx prisma migrate dev`"

## Done When
- `src/app/api/agents/sphere-reactivation/route.ts` exists
- vercel.json has cron at `0 14 1 * *`
- TypeScript and build pass
