# Implement Loop: Agent Health Monitor

**Spec:** `loops/proposed/05-agent-health-monitor.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:agent-health-monitor`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Health check route — `src/app/api/agents/health-check/route.ts` (NEW)
```typescript
// AIRE: loop:agent-health-monitor
const AGENT_TYPES = ['morning_brief','new_lead_intake','lead_revival','transaction_watchdog','content_scheduler','market_intel'];
const EXPECTED_WINDOW_HOURS: Record<string, number> = {
  morning_brief: 6, market_intel: 4, content_scheduler: 5, transaction_watchdog: 7, lead_revival: 20, new_lead_intake: 24
};
```
Logic:
1. Auth check (CRON_SECRET)
2. Check `Setting["agents.lastChecked"]` — skip if same day
3. For each AGENT_TYPE: query AgentRun for most recent record in last 24h
4. Classify: `ok` (status=completed, within window), `partial` (status=partial), `failed` (status=failed), `missing` (no record)
5. Compute health score: (ok×2 + partial) / (AGENT_TYPES.length × 2) × 100
6. For failed/missing agents: create Notification type "critical" per agent
7. If health score < 50: send SMS via Twilio
8. Check DailyBrief for today — if no assembledAt: SMS "Morning brief not assembled"
9. Update Setting["agents.healthScore"] and Setting["agents.lastChecked"]
10. Write AgentRun for this health check run

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/health-check", "schedule": "30 11 * * *" }` (6:30 AM CT = 11:30 UTC) — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/health-check/route.ts` exists
- vercel.json has cron at `30 11 * * *`
- TypeScript and build pass
