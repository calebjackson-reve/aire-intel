# Loop: agent-health-monitor — Handoff Notes

## Spec Summary
New POST route /api/agents/health-check that runs at 6:30 AM CT. Checks AgentRun records for each of the 6 agent types, scores overall health, alerts on failures.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/health-check/route.ts` exists with POST handler + CRON_SECRET auth
- Checks all 6 agent types in last 24h window
- Computes health score; SMS if < 50
- Checks DailyBrief.assembledAt for today; SMS if missing
- Updates Setting["agents.healthScore"] and Setting["agents.lastChecked"]
- vercel.json has `30 11 * * *` cron for `/api/agents/health-check`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Create src/app/api/agents/health-check/route.ts with POST handler.

### Iteration 1 — Units A+B+C complete
**Commit:** 3cfadf5

**Unit A:** `src/app/api/agents/health-check/route.ts` — POST handler with `verifyCronSecret` auth. Creates `AgentRun` for `health_monitor` type directly via prisma (bypasses `startRun` which only accepts the 6 inner AgentTypes). Queries last 24h runs for all 6 agent types; computes per-type score as `100 - (failCount / max(totalRuns,1)) * 100`; averages to overall health score. Creates `Notification type:"critical"` for each failed/missing agent. Updates `Setting["agents.healthScore"]` and `Setting["agents.lastChecked"]`. SMS via Twilio if `healthScore < threshold` (from `getSetting("health.alertThreshold")`, default 50).

**Unit B:** After health score, queries `DailyBrief` for today's date. If missing or no `assembledAt`, creates `Notification type:"warning"`. `briefStatus` included in JSON response.

**Unit C:** `vercel.json` — added `{ "path": "/api/agents/health-check", "schedule": "30 11 * * *" }` (6:30 AM CT = 11:30 UTC).

**Oracle:** `npx tsc --noEmit` ✅  `npm run build` ✅

**Status:** DONE — all definition-of-done criteria met.
