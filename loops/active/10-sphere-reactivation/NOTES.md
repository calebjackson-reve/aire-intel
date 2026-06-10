# Loop: sphere-reactivation — Handoff Notes

## Spec Summary
Monthly 1st 8AM cron. Finds sphere contacts with lastContactedAt > 60 days, prioritizes birthdays/anniversaries, generates 10 personalized check-in drafts.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/sphere-reactivation/route.ts` exists
- Queries Lead by source="sphere" or tags contains "sphere", within staleness threshold
- Takes top 10, checks ContactLog + ActionQueue dedup
- Creates ActionQueue items (draft_message, priority 6, requiresApproval true)
- Setting["sphere.lastRunMonth"] guard prevents double-run
- vercel.json has `0 14 1 * *` cron for `/api/agents/sphere-reactivation`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma for Lead model — verify source, tags fields exist.

### Iteration 1 — Units A + B + C complete
**Schema (Unit A):** Lead has `source String?`, `tags String?` (comma-separated), `birthday DateTime?`, `anniversary DateTime?`, `lastContactDate DateTime?`. No migration needed.

**Route (Unit B):** `src/app/api/agents/sphere-reactivation/route.ts` — POST handler with cron-secret auth, `sphere.lastRunMonth` guard, sphere lead query (`source=sphere` OR `tags` contains `sphere`, excludes `closed_won`/`closed_lost`/`do_not_contact`), priority sort (birthday ≤14d → anniversary ≤14d → most stale), top-10 cap, ContactLog + ActionQueue dedup, `generateDraft(source: "sphere_reactivation")`, ActionQueue creation (priority 6, `requiresApproval: true`), Notification, AgentRun.

**Cron (Unit C):** vercel.json already had `0 14 1 * *` entry for `/api/agents/sphere-reactivation`.

**Oracle:** `npx tsc --noEmit` + `npm run build` — both pass clean.

---

## Status

```
units_complete: A B C
oracle: pass
committed: yes
```
