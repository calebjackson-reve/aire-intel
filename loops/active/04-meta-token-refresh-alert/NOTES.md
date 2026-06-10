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

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/meta.ts. Add checkTokenExpiry() function at the bottom.
