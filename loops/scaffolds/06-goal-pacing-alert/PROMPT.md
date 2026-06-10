# Implement Loop: Goal Pacing Alert

**Spec:** `loops/proposed/06-goal-pacing-alert.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:goal-pacing-alert`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Goal pacing route — `src/app/api/agents/goal-pacing/route.ts` (NEW)
```typescript
// AIRE: loop:goal-pacing-alert
export async function POST(req: Request) {
  // Auth check
  // Skip if Setting["pacing.lastChecked"] is within 6 days
  
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  
  // Pull targets from Settings (default 0 = not configured)
  const leadsPerWeekTarget = parseInt(await getSetting('goal.leadsPerWeek', '0'));
  const closingsPerMonthTarget = parseInt(await getSetting('goal.closingsPerMonth', '0'));
  
  if (!leadsPerWeekTarget && !closingsPerMonthTarget) {
    // Create info Notification: "Set goals in Settings to enable pacing alerts"
    return;
  }
  
  // Count actual metrics
  const newLeadsThisMonth = await prisma.lead.count({ where: { createdAt: { gte: monthStart } } });
  const outboundThisWeek = await prisma.contactLog.count({ where: { direction: 'outbound', createdAt: { gte: weekStart } } });
  
  // Calculate pacing % for each dimension
  // Build notification based on pacing status
  // Update Setting["pacing.lastChecked"]
}
```

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/goal-pacing", "schedule": "0 13 * * 1" }` (7AM CT Monday = 13:00 UTC) — only if not present.

### 3. Settings page — note for Caleb
Add a comment in the route explaining which Setting keys to configure: `// Requires Setting keys: goal.leadsPerWeek, goal.closingsPerMonth, goal.annualGCI`

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

Verify `ContactLog` model has `direction` field before using it in the query.

## Done When
- `src/app/api/agents/goal-pacing/route.ts` exists
- vercel.json has cron at `0 13 * * 1`
- TypeScript and build pass
