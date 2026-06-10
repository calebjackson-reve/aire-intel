# Loop: Calendly Post-Meeting Follow-Up

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 03  
**Score:** 29 / 30

---

## Trigger

Calendly webhook fires at `/api/webhooks/calendly` on `invitee.created` event (meeting booked) and `invitee.canceled` event (cancellation). The existing handler at `src/app/api/webhooks/calendly/route.ts` currently receives these — this loop adds post-meeting follow-up logic on top.

A second trigger: 30 minutes after meeting end time (calculated from `scheduled_event.end_time` + 30m delay). Implemented as a stored `scheduledFor` timestamp in `ActionQueue` — a separate queue-processor cron can scan for `scheduledFor <= now` items.

## Input

- Calendly webhook payload: `scheduled_event.name` (meeting type), `scheduled_event.end_time`, `invitee.name`, `invitee.email`, `invitee.uri`, custom questions answered on booking form
- `Lead` — look up by `email` match to `invitee.email`; fields: `id`, `stage`, `temperature`, `notes`, `lastContactedAt`
- `ContactLog` — last 5 entries for this lead (meeting history context)
- `Task` — any open tasks linked to this lead

## Actions

**On `invitee.created` (meeting booked):**
1. Look up Lead by `invitee.email`; if not found, create new Lead with source = "calendly"
2. Update `Lead.stage` → `"active"` if currently `"new"` or `"cold"`
3. Create `ContactLog` entry: `type = "meeting_scheduled"`, note the meeting type + scheduled time
4. Create `Task`: "Prepare for meeting with [Name]" — `dueDate = scheduledAt - 1h`
5. Enqueue `ActionQueue` item (type = `"send_client_email"`, scheduledFor = now) — confirmation + prep doc draft

**On meeting end (30-minute post-meeting trigger):**
1. Generate post-meeting follow-up draft via `generateDraft()`: personalized recap + next steps based on meeting type
2. Enqueue `ActionQueue` item: `type = "send_client_email"`, `priority = 2`, `scheduledFor = endTime + 30m`
3. Create `ContactLog` entry: `type = "meeting_completed"`
4. If meeting type contains "buyer" or "consultation": enroll in `new_lead` or `buyer_consultation` SmartPlan

## Oracle

**What external source of truth grades the output?**  
Inbound reply from the lead within 24h of the follow-up being sent (`ContactLog` entry, `direction = "inbound"`). Secondary: a second Calendly booking from the same lead within 14 days (meeting-to-meeting conversion).

**Acceptance threshold:**  
≥ 50% of post-meeting follow-ups receive an inbound reply or next meeting booked within 48h.

**Rejection signal:**  
If follow-up is skipped 3 times in a row for the same meeting type, flag for Caleb to review the draft template.

## Memory

- `ContactLog` — records meeting scheduled, meeting completed, follow-up sent
- `ActionQueue` — persists draft with `scheduledFor` for delayed execution
- `Lead` — updated `stage`, `lastContactedAt` on each event
- `Task` — prep task linked to lead

## Surface

- Dashboard `Notification` when meeting is booked (immediate)
- `ActionQueue` item in `/brief` → "You Owe Replies" or standalone draft card
- Post-meeting draft ready notification 30 min after meeting ends

---

## Safety Rails

- **Human chokepoint:** Post-meeting draft lands in `ActionQueue` with `requiresApproval = true`. Confirmation email on booking can optionally be auto-sent (low-risk, toggle via Setting key `"agent.calendly_confirmation.autoExecute"`).
- **Blast radius:** At most 2 ActionQueue items per Calendly event (confirmation + follow-up). If lead lookup fails, creates new Lead rather than dropping the event.
- **Rate limit / cap:** 1 follow-up draft per meeting event. Dedup by Calendly `event_uuid`.
- **Idempotency:** Store Calendly `event_uuid` in `ActionQueue.payload.calendlyEventId`. On webhook re-delivery, check for existing `ActionQueue` item with that event ID before creating a new one.
- **Exit condition:** Lead `stage = "closed_won"` / `"closed_lost"` — skip follow-up generation. Meeting type = "team internal" — skip entirely.

---

## Implementation Notes

- Modify `src/app/api/webhooks/calendly/route.ts` — add post-meeting follow-up logic after existing `invitee.created` handler
- Need a queue-processor endpoint or extend existing cron to scan `ActionQueue` items where `status = "pending"` AND `scheduledFor <= now`
- `src/lib/draft-agent.ts → generateDraft()` — add template type `"post_meeting_followup"` with meeting type + invitee name in context
- Meeting types to handle: Buyer Consultation, Listing Presentation, Property Showing, General Call
- Env vars: `CALENDLY_WEBHOOK_SECRET` (for signature validation — must be set on the Calendly webhook config)
