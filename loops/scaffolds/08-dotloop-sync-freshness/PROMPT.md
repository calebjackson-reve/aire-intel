# Implement Loop: Dotloop Sync Freshness Monitor

**Spec:** `loops/proposed/08-dotloop-sync-freshness.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:dotloop-sync-freshness`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Extend dotloop.ts — `src/lib/dotloop.ts` (MODIFY)
Add at the bottom:
```typescript
// AIRE: loop:dotloop-sync-freshness
export async function getLoopDetails(loopId: string): Promise<{ status: string; lastActivity: string | null } | null> {
  // Call Dotloop API GET /api/me/loops/{loopId}
  // Return null on error (log via logError)
  // Use withRetry for the API call
}
```

### 2. Add sync freshness step to transaction-watchdog — `src/app/api/agents/transaction-watchdog/route.ts` (MODIFY)
After the existing milestone logic, add:
```typescript
// AIRE: loop:dotloop-sync-freshness
// Sync freshness check
const activeLoops = await prisma.dotloopLoop.findMany({ where: { status: { not: 'closed' } } });
for (const loop of activeLoops) {
  const staleness = Date.now() - new Date(loop.updatedAt).getTime();
  const staleHours = staleness / 3600000;
  const isClosingSoon = loop.closingDate && (new Date(loop.closingDate).getTime() - Date.now()) < 172800000; // 48h
  
  if ((isClosingSoon && staleHours > 12) || staleHours > 24) {
    const details = await getLoopDetails(loop.loopId);
    if (details) {
      await prisma.dotloopLoop.update({ where: { id: loop.id }, data: { updatedAt: new Date() } });
    }
    if (isClosingSoon && staleHours > 12) {
      // SMS urgent alert
    }
  }
}
```
Calculate staleness score; if > 25% loops stale: create warning Notification + write to DailyBrief.nonNegotiables.
Handle 401 from Dotloop API: update Setting["dotloop.authStatus"] = "expired", SMS alert.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```
First, read `prisma/schema.prisma` to verify `DotloopLoop` model has `loopId`, `status`, `closingDate`, `updatedAt`. Add missing fields if needed with `// AIRE:` comment noting migration required.

## Done When
- `getLoopDetails()` added to `src/lib/dotloop.ts`
- Freshness check added to transaction-watchdog route
- TypeScript and build pass
