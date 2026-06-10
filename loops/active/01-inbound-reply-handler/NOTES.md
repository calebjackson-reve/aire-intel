# Loop: inbound-reply-handler — Handoff Notes

## Spec Summary
Extend Lofty webhook + Zapier webhook to detect inbound SMS/email replies, classify intent, update lead state, generate a reply draft, and queue it in ActionQueue.

## Definition of Done (from SPEC.md)
- `src/lib/contact-classifier.ts` exists with `classifyReplyIntent()` export
- Lofty webhook (`src/app/api/lofty/webhook/route.ts`) handles `sms_received` / `email_received` activity types
- Zapier webhook handles `activity.logged` events with same reply logic
- ActionQueue item created per inbound with `requiresApproval = true`
- Dashboard Notification created per inbound
- Oracle: `npx tsc --noEmit` exits 0 AND `npm run build` exits 0

## Iteration Log

### Iteration 0 — scaffolded, nothing started
`src/lib/contact-classifier.ts` was partially created by a prior aborted run with regex-based classifyReplyIntent(). Verify it exists and passes typecheck before extending webhook.

**Next:** Read the lofty webhook route. Add the `sms_received`/`email_received` handler branch. Then run oracle.
