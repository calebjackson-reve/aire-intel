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
