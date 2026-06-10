# Loop Iteration Prompt — agent-health-monitor

You are running one iteration of the `agent-health-monitor` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/05-agent-health-monitor/SPEC.md`
2. `loops/active/05-agent-health-monitor/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/05-agent-health-monitor/`

## What this loop builds

New POST route `/api/agents/health-check` that runs at 6:30 AM CT daily. Checks AgentRun records for each of the 6 agent types in the last 24h, computes a health score, alerts on failures, and checks that today's DailyBrief was assembled.

## Implementation units

**Unit A — health-check route**
- Create `src/app/api/agents/health-check/route.ts`
- POST handler, validate `Authorization: Bearer ${process.env.CRON_SECRET}`
- Create AgentRun record for this run: `agentType: "health_monitor"`
- Query AgentRun for these 6 types in last 24h: `"morning_brief" | "new_lead_intake" | "lead_revival" | "transaction_watchdog" | "content_scheduler" | "market_intel"`
- Per agent type: compute `successCount`, `failCount`, `lastRunAt`, `lastStatus`
- Health score formula: `100 - (failCount / Math.max(totalRuns, 1) * 100)` averaged across all 6 types
- Update Setting: `agents.healthScore = score.toString()`, `agents.lastChecked = new Date().toISOString()`
- SMS via twilio.ts if score < 50 (use `getSetting("health.alertThreshold", "50")`)
- Mark all code `// AIRE: loop:agent-health-monitor`

**Unit B — DailyBrief freshness check**
- In the same route, after health score:
  - Query DailyBrief where `date = today's date` (format: "YYYY-MM-DD")
  - If not found or `assembledAt` is null: create Notification `type: "warning"`, message: "DailyBrief not assembled today"
  - If `assembledAt` exists: include in health summary
- Today's date: use `new Date().toISOString().slice(0, 10)` 

**Unit C — vercel.json cron entry**
- Read `vercel.json`
- Add `{ "path": "/api/agents/health-check", "schedule": "30 11 * * *" }` to crons array (11:30 UTC = 6:30 AM CT)
- Additive only

## AIRE conventions (mandatory)

- `// AIRE: loop:agent-health-monitor` on all new code
- `withRetry()` for Twilio SMS call, `logError()` on errors
- Import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
