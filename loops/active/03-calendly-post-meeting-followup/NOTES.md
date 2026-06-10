# Loop: calendly-post-meeting-followup — Handoff Notes

## Spec Summary
Extend Calendly webhook to upsert leads, create prep tasks, and queue confirmation drafts on booking. Add a 15-minute cron that scans for scheduled ActionQueue items (type=calendly_followup_pending) past their scheduledFor time and converts them to follow-up drafts.

## Definition of Done (from SPEC.md)
- Calendly webhook handles `invitee.created` with Lead upsert + prep task + confirmation draft ActionQueue item
- `src/app/api/cron/meeting-followup/route.ts` exists and scans for pending follow-ups
- vercel.json has `*/15 * * * *` cron for `/api/cron/meeting-followup`
- Calendly event UUID used as idempotency key
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read src/app/api/webhooks/calendly/route.ts. Add invitee.created handler.

### Iteration 1 — all three units complete
- **Unit A** (`src/app/api/webhooks/calendly/route.ts`): `invitee.created` handler fully implemented — Lead upsert (email/phone/name), stage upgrade (new_lead/cold → active), idempotency via `calendlyEventId`, prep Task (due 2h before), confirmation draft ActionQueue (scheduledFor = start+15m), post-meeting follow-up ActionQueue (type=`calendly_followup_pending`, scheduledFor = end+30m), Notification.
- **Unit B** (`src/app/api/cron/meeting-followup/route.ts`): POST route validates `CRON_SECRET`, scans `calendly_followup_pending` items past `scheduledFor` (cap 10), calls `generateDraft()` via `withRetry()`, promotes each item to `draft_message` with draft body/subject embedded in payload.
- **Unit C** (`vercel.json`): `*/15 * * * *` cron entry for `/api/cron/meeting-followup` added.
- Oracle: `npx tsc --noEmit` clean, `npm run build` passed all routes.
**Status:** DONE — all Definition of Done items met.
