# Loop Iteration Prompt — meta-token-refresh-alert

You are running one iteration of the `meta-token-refresh-alert` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/04-meta-token-refresh-alert/SPEC.md`
2. `loops/active/04-meta-token-refresh-alert/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/04-meta-token-refresh-alert/`

## What this loop builds

Add `checkTokenExpiry()` to `src/lib/meta.ts` that calls Meta's `debug_token` endpoint and returns days-until-expiry. Call it once per day inside market-intel agent. Alert at 14-day and 7-day windows; pause content scheduler on expiry.

## Implementation units

**Unit A — checkTokenExpiry() in meta.ts**
- Read `src/lib/meta.ts` — find the existing access token pattern and `META_ACCESS_TOKEN` env var usage
- Add `checkTokenExpiry(): Promise<{ daysRemaining: number; expiresAt: Date | null }>` at the bottom of the file
- Call Meta's debug_token endpoint: `GET https://graph.facebook.com/debug_token?input_token={TOKEN}&access_token={APP_ID}|{APP_SECRET}`
- Parse `data.expires_at` (Unix timestamp) → compute daysRemaining
- Use `withRetry()` from error-memory.ts
- Mark `// AIRE: loop:meta-token-refresh-alert`

**Unit B — market-intel agent integration**
- Read `src/app/api/agents/market-intel/route.ts`
- At the very start of the handler, after auth check:
  - Check `getSetting("meta.token.lastChecked", "")` — skip if checked in last 23 hours
  - Call `checkTokenExpiry()`
  - Update Setting: `meta.token.lastChecked = new Date().toISOString()`
  - 14-day window: create Notification `type: "warning"`, message: "Meta token expires in X days — refresh soon"
  - 7-day window: create Notification `type: "warning"`, also send SMS via twilio.ts if available
  - 0 days (expired): create Notification `type: "critical"`, set Setting `agent.content_scheduler.paused = "true"`, SMS
- Wrap in try/catch — never let a token check failure crash the agent

**Unit C — error path hardening**
- Verify the `checkTokenExpiry()` gracefully handles: no META_APP_SECRET env var, API rate limit, network error
- Each error path calls `logError()` and returns `{ daysRemaining: 999, expiresAt: null }` (fail-open for the agent)

## AIRE conventions (mandatory)

- Additive only — do not modify existing meta.ts logic
- `// AIRE: loop:meta-token-refresh-alert` on all new code
- `withRetry()` for the debug_token API call, `logError()` on errors
- Import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.

`STATUS: COMPLETE / EXIT_SIGNAL: true` if all Done When conditions met.
