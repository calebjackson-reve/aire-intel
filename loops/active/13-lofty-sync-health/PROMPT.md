# Loop Iteration Prompt — lofty-sync-health

You are running one iteration of the `lofty-sync-health` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/13-lofty-sync-health/SPEC.md`
2. `loops/active/13-lofty-sync-health/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/13-lofty-sync-health/`

## What this loop builds

Add `checkLoftyHealth()` to `src/lib/lofty.ts`. Call it at the start of the morning-brief route once per day. Alert on 401 (auth expired) or Lofty API being unreachable.

## Implementation units

**Unit A — checkLoftyHealth() in lofty.ts**
- Read `src/lib/lofty.ts` — find the auth pattern (`LOFTY_ACCESS_TOKEN`, token refresh, base URL)
- Add `checkLoftyHealth(): Promise<{ status: "ok" | "auth_expired" | "unreachable"; message: string }>` at the bottom
- Make a lightweight read-only API call (e.g., fetch a single contact or call the OAuth token introspect endpoint)
- On 200: return `{ status: "ok", message: "Lofty API reachable" }`
- On 401: return `{ status: "auth_expired", message: "Lofty token expired — re-authenticate" }`
- On network error / timeout: return `{ status: "unreachable", message: error.message }`
- Use `withRetry()` with retries: 1 (health checks should fail fast)
- Mark `// AIRE: loop:lofty-sync-health`

**Unit B — morning-brief route integration**
- Read `src/app/api/agents/morning-brief/route.ts`
- At the very start of the handler, after auth check:
  - Check `getSetting("lofty.lastHealthCheck", "")` — skip if checked in last 23h
  - Call `checkLoftyHealth()`
  - Update Setting: `lofty.tokenStatus = result.status`, `lofty.lastHealthCheck = new Date().toISOString()`
  - On `"auth_expired"`: create Notification `type: "critical"`, message: "Lofty auth expired — AIRE cannot sync leads until you re-authenticate at lofty.com". Also SMS via twilio.
  - On `"unreachable"`: create Notification `type: "warning"`, message: "Lofty API unreachable this morning"
  - Wrap in try/catch — never let a health check crash the brief

## AIRE conventions (mandatory)

- `// AIRE: loop:lofty-sync-health`; `withRetry()`, `logError()`, prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
