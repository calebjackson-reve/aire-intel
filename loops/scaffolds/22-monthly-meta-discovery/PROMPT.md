# Implement Loop: Monthly Meta-Discovery

**Spec:** `loops/proposed/22-monthly-meta-discovery.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:monthly-meta-discovery`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Meta-discovery route — `src/app/api/agents/meta-discovery/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Skip if `Setting["loops.lastMetaDiscovery"]` is within 25 days
3. **ROI Report** — read `loops/REGISTRY.md` to find deployed loops
   - For each deployed loop, query its oracle metric (based on loop type — ContactLog reply rates, AgentRun status, ContentPerformance engagement)
   - Classify green/yellow/red vs threshold
4. Build ROI summary object
5. Create Notification: "Monthly loop report: [N] green / [N] yellow / [N] red"
6. Update Setting["loops.deployedRoiMetrics"] with JSON summary
7. Update Setting["loops.lastMetaDiscovery"] = today
8. Write AgentRun record
9. Note: Full discovery pass (running discovery-loop.sh) is triggered manually or via a separate mechanism; this route handles the ROI report portion

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/meta-discovery", "schedule": "0 5 28 * *" }` (11PM CT 28th = 5AM UTC next day) — only if not present.

### 3. ROI query helpers
For inner loops with reply-rate oracles: `prisma.contactLog.count({ where: { direction: 'inbound', createdAt: { gte: thirtyDaysAgo } } })`
For agent health loops: query `AgentRun` success rate

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/meta-discovery/route.ts` exists
- vercel.json has cron at `0 5 28 * *`
- TypeScript and build pass
