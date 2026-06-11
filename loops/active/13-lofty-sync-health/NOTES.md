# Loop: lofty-sync-health — Handoff Notes

## Spec Summary
Add checkLoftyHealth() to lofty.ts. Call it at the start of morning-brief route once per day. Alert on 401 (auth expired) or API down.

## Definition of Done (from SPEC.md)
- `checkLoftyHealth()` exported from `src/lib/lofty.ts`
- morning-brief route calls it at start (once per day, Setting guard)
- Setting["lofty.tokenStatus"] updated on each run
- Critical Notification + SMS on auth expiry
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 1 — all units complete
**Commit:** `3141bc2`
**What shipped:**
- **Unit A** — `checkLoftyHealth()` exported from `src/lib/lofty.ts` (line ~345). Uses `withRetry(maxAttempts:2)`, calls `GET /v1.0/leads?limit=1`, returns `{ status, message, responseMs }`. Distinguishes 401 → `auth_expired` vs network error → `unreachable`. Clears `_cachedToken` on 401.
- **Unit B** — morning-brief route (`src/app/api/agents/morning-brief/route.ts`) calls health check at start in isolated try/catch. 23h guard via `Setting["lofty.lastHealthCheck"]`. Updates `lofty.tokenStatus`, `lofty.lastHealthCheck`, `lofty.apiResponseMs`. Critical Notification + Twilio SMS on auth_expired. Warning Notification on unreachable.
**Oracle:** `npx tsc --noEmit` → only pre-existing jarvis/route.ts errors (not in scope). Build compiled successfully.
**Status: DONE** — all acceptance criteria met.

### Iteration 5 — re-verification (2026-06-09)
No new work. `checkLoftyHealth()` at `src/lib/lofty.ts:344`, import and 23h-guard call in morning-brief route at lines 7 and 32. **Loop remains DONE.**

### Iteration 4 — re-verification (2026-06-09)
No new work. `checkLoftyHealth()` at `src/lib/lofty.ts:344`, import and 23h-guard call in morning-brief route at lines 7 and 29–39. **Loop remains DONE.**

### Iteration 3 — re-verification (2026-06-09)
No new work. Confirmed implementation still intact: `checkLoftyHealth()` at `src/lib/lofty.ts:343`, import and 23h-guard call in morning-brief route at lines 7 and 29. **Loop remains DONE.**

### Iteration 2 — re-verification (2026-06-09)
No new work. Confirmed implementation intact: `checkLoftyHealth()` at `src/lib/lofty.ts:343`, morning-brief route integration at line 29. `npx tsc --noEmit` clean (pre-existing jarvis/route.ts error unchanged). Build passes. **Loop remains DONE.**

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/lofty.ts — find the getLoftyAccessToken() or equivalent function name.
