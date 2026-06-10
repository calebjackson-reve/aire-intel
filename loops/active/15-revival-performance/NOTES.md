# Loop: revival-performance — Handoff Notes

## Spec Summary
Bi-weekly Monday 7:30AM cron. Analyzes RevivalCohort records + ContactLog inbound replies. Calculates reply rate, stage advancement, writes performance metrics to Settings. Alerts if reply rate < 8%.

## Definition of Done (from SPEC.md)
- `src/app/api/agents/revival-tracker/route.ts` exists
- Pulls RevivalCohort last 30 days, correlates with ContactLog inbound
- Calculates replyRate and stageAdvancement
- Updates Setting["revival.lastReplyRate"], Setting["revival.bestMessagePattern"]
- SMS alert if replyRate < 8%
- vercel.json has `30 13 * * 1` cron for `/api/agents/revival-tracker`
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma for RevivalCohort model — verify repliedAt, converted, stage fields.

### Iteration 1 — schema inspection + full implementation verified (2026-06-10)

**Schema findings (Unit A):**
- `RevivalCohort` model has: `id`, `name`, `createdAt`, `leadIds` (JSON array), `holdoutIds`, `baselineRate`, `notes`
- No `repliedAt`/`converted`/`messageType` fields — cohort is a frozen snapshot; replies are tracked via `ContactLog.direction="inbound"` join
- `ContactLog.direction` defaults to `"outbound"`, accepts `"inbound"` — confirmed for reply detection
- Route uses `MessageDraft.source="revival"` + `MessageDraft.channel` as the `messageType` proxy for best pattern analysis

**Unit B & C — already implemented:**
- `src/app/api/agents/revival-tracker/route.ts` — full implementation present
- `vercel.json` — cron `30 13 * * 1` for `/api/agents/revival-tracker` confirmed
- `npx tsc --noEmit` → clean
- `npm run build` → clean

**Status:** DONE — all units complete, Oracle passes.

---

## Status
```
route_exists:     true
vercel_cron:      true
tsc_clean:        true
build_clean:      true
loop_status:      COMPLETE
```
