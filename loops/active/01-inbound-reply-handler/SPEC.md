# Loop: Inbound Reply Handler

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 01  
**Score:** 29 / 30

---

## Trigger

Lofty webhook fires at `/api/lofty/webhook` on `activity.logged` event where `activity.type = "sms_received"` or `"email_received"`. Zapier webhook at `/api/webhooks/zapier` with `event = "activity.logged"` is the fallback if Lofty doesn't send reply payloads directly.

## Input

- `ContactLog` — latest entries for the lead (`leadId`), filtered `direction = "inbound"`, ordered by `createdAt DESC LIMIT 1`
- `Lead` — `id`, `firstName`, `lastName`, `stage`, `temperature`, `lastContactedAt`, `assignedAgent`, `notes`
- `MessageDraft` — any pending drafts for this lead (`leadId`, `status = "pending"`)
- `ContactLog` history — last 5 entries for context window passed to draft agent

## Actions

1. Parse inbound text/email content from webhook payload
2. Classify reply intent: positive interest / objection / question / request to stop / scheduling intent
3. Update `Lead.lastContactedAt` to `now()`; bump `Lead.temperature` up one tier if currently cold/warm
4. Update `Lead.stage` if reply indicates movement (e.g., "yes I want to see it" → move to `active`)
5. Create `ContactLog` entry: `direction = "inbound"`, `channel`, `summary` of content
6. Generate response draft via `draft-agent.ts → generateDraft()` passing intent classification + full thread context
7. Write `MessageDraft` with `status = "pending"`, link to `leadId`
8. Enqueue `ActionQueue` item: `type = "draft_message"`, `priority = 2`, `requiresApproval = true`
9. Create `Notification` for dashboard: "Reply from [Name] — draft ready"

## Oracle

**What external source of truth grades the output?**  
A `ContactLog` entry with `direction = "outbound"` is created within 4 hours of the inbound event — meaning Caleb actually replied (either approved the draft or wrote his own).

**Acceptance threshold:**  
Reply rate ≥ 70% within 4h on inbound leads that receive a drafted response.

**Rejection signal:**  
If the same lead sends 3 inbound messages with no outbound `ContactLog` entry (3 consecutive drafts skipped/no action), escalate with SMS alert: "You have 3 unanswered replies from [Name]."

## Memory

- `ContactLog` — persists each inbound/outbound event; idempotency key = `(leadId, channel, createdAt minute bucket)`
- `MessageDraft` — persists the queued draft; `status` field tracks lifecycle
- `ActionQueue` — persists approval state; `briefDate` = date of inbound event
- `Lead.lastContactedAt` + `Lead.temperature` — updated on each run

## Surface

- Dashboard `Notification` (immediate, SSE stream)
- `ActionQueue` item visible in `/brief` → "Going Cold" section and inline lead card
- If lead stage = `hot` (active listing search), also SMS Caleb's phone immediately

---

## Safety Rails

- **Human chokepoint:** Draft lands in ActionQueue with `requiresApproval = true`. Nothing sends until approved.
- **Blast radius:** One drafted message per inbound event. If draft generation fails, logs to ErrorLog and creates a bare notification ("Reply from [Name] — no draft, review manually").
- **Rate limit / cap:** Max 1 draft per lead per 15-minute window. Duplicate inbound webhooks (Lofty retries) are deduplicated by ContactLog check.
- **Idempotency:** Before generating draft, check `ActionQueue` for existing `pending` item with same `leadId` + `briefDate` — if found, skip.
- **Exit condition:** Lead stage = `closed_won` or `closed_lost` — loop ignores future inbounds from that lead.

---

## Implementation Notes

- Modify `src/app/api/lofty/webhook/route.ts` — add branch for `activity.type = "sms_received"` and `"email_received"`
- Modify `src/app/api/webhooks/zapier/route.ts` — add handler for `activity.logged` events
- `src/lib/draft-agent.ts → generateDraft()` — pass `{ context: "reply_to_inbound", intent, threadHistory }`
- New helper: `src/lib/contact-classifier.ts` — classify intent from raw reply text (4 categories: interested, objection, question, unsubscribe)
- Env vars needed: none new (Lofty webhook secret already present)
