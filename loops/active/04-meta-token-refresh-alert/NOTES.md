# Loop: meta-token-refresh-alert — Handoff Notes

## Spec Summary
Add checkTokenExpiry() to src/lib/meta.ts using Meta's debug_token endpoint. Call it at the start of the market-intel agent. Alert via Notification at 14-day and 7-day warning windows; SMS + pause content scheduler on expiry.

## Definition of Done (from SPEC.md)
- `checkTokenExpiry()` exported from `src/lib/meta.ts`
- market-intel agent calls it once per day (Setting["meta.token.lastChecked"] guard)
- 14-day window → warning Notification
- 7-day window → warning Notification (SMS if twilio available)
- Expired → critical Notification + Setting["agent.content_scheduler.paused"]="true"
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 1 — all units complete (2026-06-09)

**Unit A:** `checkTokenExpiry()` added to `src/lib/meta.ts`. Calls `GET /debug_token` with app token `{APP_ID}|{APP_SECRET}`. Parses `data.expires_at` Unix timestamp → daysRemaining. Uses `withRetry` for the API call; missing env vars path calls `logError` directly. All error paths return `{ daysRemaining: 999, expiresAt: null }` (fail-open).

**Unit B:** `src/app/api/agents/market-intel/route.ts` calls `checkTokenExpiry()` at agent start (step 0), guarded by `meta.token.lastChecked` 23-hour window. Sets `meta.token.status` (`healthy/warning/critical/expired`). Warning notification at ≤14 days; warning + SMS at ≤7 days; critical notification + `agent.content_scheduler.paused="true"` + SMS on expiry.

**Unit C:** Error paths verified: missing `META_APP_ID`/`META_APP_SECRET`/`META_PAGE_ACCESS_TOKEN` → `logError` + fail-open. API/network failures caught by `withRetry` (already logs) → outer catch returns `{ daysRemaining: 999, expiresAt: null }`. Token check block in market-intel wrapped in separate try/catch that pushes to `errors[]` — never crashes the agent.

**Oracle:** `npx tsc --noEmit` ✓ · `npm run build` ✓

**Commit:** `0a88cbf`

### Iteration 0 — scaffolded, nothing started
