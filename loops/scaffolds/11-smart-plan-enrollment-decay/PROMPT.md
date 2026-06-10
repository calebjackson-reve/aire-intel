# Implement Loop: SmartPlan Enrollment Decay Monitor

**Spec:** `loops/proposed/11-smart-plan-enrollment-decay.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:smart-plan-enrollment-decay`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. First: read the schema
Read `prisma/schema.prisma` carefully. Find the SmartPlan enrollment model — it may be `SmartPlanEnrollment`, or enrollment state may be inline in `SmartPlan`. Note the exact model name and field names.

### 2. Add enrollment decay check to transaction-watchdog — `src/app/api/agents/transaction-watchdog/route.ts` (MODIFY)
After the existing milestone/dotloop logic, add:
```typescript
// AIRE: loop:smart-plan-enrollment-decay
// SmartPlan enrollment stall check
const STALL_THRESHOLD_H = 48; // hours
// Query active enrollments — use the actual model name from schema
// For each enrollment where nextStepAt < now - STALL_THRESHOLD_H:
//   - Check if lead stage has changed (if active/closing: flag for graduation)
//   - Check if lead temperature is cold (flag for review)
//   - Create ActionQueue task item if stalled
//   - Dedup: skip if existing pending task for same leadId + planId
```

Calculate stall percentage; if > 30%: logError and alert (likely system issue).
Update `Setting["smartplan.stalledCount"]` with current count.

### 3. Create Notification for stalled enrollments
If any stalled: "N SmartPlan enrollments stalled — review in /smart-plans"

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

The schema read is critical here — if the enrollment model fields differ from the spec's assumptions, adapt the query to match actual schema. Never guess field names.

## Done When
- Enrollment decay check added to transaction-watchdog route
- TypeScript and build pass
