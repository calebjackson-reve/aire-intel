# Loop Iteration Prompt — monthly-meta-discovery

You are running one iteration of the `monthly-meta-discovery` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/22-monthly-meta-discovery/SPEC.md`
2. `loops/active/22-monthly-meta-discovery/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/22-monthly-meta-discovery/`

## What this loop builds

Monthly 28th 11PM CT cron. Route `/api/agents/meta-discovery` that reads `loops/REGISTRY.md` for deployed loops, pulls oracle metrics for each, classifies green/yellow/red, and creates a Notification with ROI summary.

## Implementation units

**Unit A — meta-discovery route (shell of it)**
- Create `src/app/api/agents/meta-discovery/route.ts`
- POST handler, validate CRON_SECRET
- Guard: check Setting["loops.lastMetaDiscovery"] — skip if within last 20 days
- The route will read `loops/REGISTRY.md` from the filesystem (in local/dev mode)
- Note: in production on Vercel, the `loops/` directory won't be deployed. The route should gracefully return a 200 with `{ skipped: true, reason: "loops directory not available in production" }` if the read fails.
- For local development / loop runs: read the file, parse the deployed loops table, and continue
- Mark `// AIRE: loop:monthly-meta-discovery`

**Unit B — metrics collection per loop**
- For each deployed loop found in REGISTRY.md (status = "active" or "scaffolded"):
  - Query AgentRun where `agentType = slug` in last 30 days
  - Compute: `totalRuns`, `successRate`, `avgDurationMs`
  - Query ActionQueue items created by this loop's agent type in last 30 days
  - Compute: `actionsQueued`, `approvalRate`
  - Classify: green = successRate >= 0.9 AND actionsQueued > 0; yellow = successRate >= 0.7; red = else
- Build results array: `{ slug, successRate, actionsQueued, approvalRate, status: "green"|"yellow"|"red" }`

**Unit C — persist + notify**
- Update Setting: `loops.deployedRoiMetrics = JSON.stringify(results)`, `loops.lastMetaDiscovery = new Date().toISOString()`
- Create Notification: `"Monthly loop ROI: {greenCount} green, {yellowCount} yellow, {redCount} red. Top performer: {topSlug}."`
- Add to vercel.json: `{ "path": "/api/agents/meta-discovery", "schedule": "0 5 28 * *" }` (5am UTC 28th = 11pm CT 27th)

## AIRE conventions (mandatory)

- `// AIRE: loop:monthly-meta-discovery`; `logError()`, prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
