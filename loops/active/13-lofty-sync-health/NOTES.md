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

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/lib/lofty.ts — find the getLoftyAccessToken() or equivalent function name.
