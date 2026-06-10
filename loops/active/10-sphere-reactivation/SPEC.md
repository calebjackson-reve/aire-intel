# Loop: Sphere Reactivation

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 10  
**Score:** 24 / 30

---

## Trigger

Monthly cron on the 1st of each month at 8:00 AM CT. Identifies contacts in Caleb's sphere who haven't been contacted in 60+ days and generates personalized check-in drafts.

## Input

- `Lead` — all records where `source = "sphere"` OR `tags` contains "sphere" AND `stage != "closed_won"` AND `stage != "closed_lost"`: `id`, `firstName`, `lastName`, `phone`, `email`, `lastContactedAt`, `notes`, `anniversary`, `birthday`
- `ContactLog` — last entry per lead (to confirm `lastContactedAt` is accurate)
- Current date — to detect upcoming birthdays/anniversaries within 30 days
- `Setting["sphere.reactivationThreshold"]` — days since last contact before flagging (default: 60)

## Actions

1. Query `Lead` table for sphere contacts with `lastContactedAt < now - threshold` (default 60 days)
2. Sort by:
   - Priority 1: Upcoming birthday or anniversary within 14 days (personal touchpoint)
   - Priority 2: Longest time since last contact
   - Priority 3: Past client (stage was previously "closed_won" for a different transaction)
3. Take top 10 per month (cap — sphere reactivation should feel personal, not mass)
4. For each contact, generate personalized draft via `generateDraft()`:
   - If birthday/anniversary within 14 days: "Thinking of you on your [birthday/anniversary] — hope all is well! [1-2 personal sentences from notes]"
   - If past client: Reference their home/transaction + genuine check-in
   - If general sphere: Market stat relevant to their area + genuine question
5. Enqueue `ActionQueue` item per contact: `type = "draft_message"`, `priority = 6`, `requiresApproval = true`
6. Write to `DailyBrief` (next morning's brief after the 1st): add "Sphere Reactivation — 10 drafts ready" to brief
7. Create monthly `Notification`: "10 sphere check-ins queued for your review"

## Oracle

**What external source of truth grades the output?**  
`ContactLog` entries with `direction = "inbound"` from sphere contacts within 30 days of draft being sent — i.e., sphere contacts who respond.

**Acceptance threshold:**  
≥ 20% of sphere check-ins receive a reply within 30 days.

**Rejection signal:**  
If a sphere contact responds with "please remove me from your list" or "unsubscribe" → immediately update `Lead.stage = "closed_lost"`, add tag "do_not_contact", remove from all future sphere runs. This must be caught and handled.

## Memory

- `Lead.lastContactedAt` — updated when draft is sent (after approval + execution)
- `ContactLog` — persists the check-in event when sent
- `Setting["sphere.reactivationThreshold"]` — configurable threshold
- `Setting["sphere.lastRunMonth"]` — month of last run (YYYY-MM format) to prevent double-running in same month

## Surface

- `ActionQueue` items (10 drafts) → visible in `/brief` section and `/contacts` page for each person
- `Notification` on the 1st of each month
- `DailyBrief.goingCold` section — sphere contacts can appear here alongside lead follow-ups

---

## Safety Rails

- **Human chokepoint:** All 10 drafts land in `ActionQueue` with `requiresApproval = true`. Caleb reviews each message before it goes out — sphere messages are high-stakes and personal.
- **Blast radius:** 10 messages maximum per month. Only contacts with `source = "sphere"` or sphere tag — never touches active leads without explicit classification.
- **Rate limit / cap:** Hard cap: 10 per month. Never contacts the same person more than once per 30 days (check `ContactLog`).
- **Idempotency:** `Setting["sphere.lastRunMonth"]` guard. Also check `ActionQueue` for pending sphere drafts from current month before creating new ones.
- **Exit condition:** Contact has tag "do_not_contact" → permanently excluded. `Lead.stage = "closed_lost"` with no sphere tag → excluded.

---

## Implementation Notes

- Create `src/app/api/agents/sphere-reactivation/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/sphere-reactivation", "schedule": "0 14 1 * *" }` (8AM CT on 1st of month = 14:00 UTC)
- `Lead` model — verify `tags` field exists (likely `String?` with comma-separated values or JSON array); may need to add `source` field if not present
- `Lead` model — verify `anniversary` and `birthday` fields exist (DateTime?); add if needed for sphere personalization
- `src/lib/draft-agent.ts → generateDraft()` — add template type `"sphere_checkin"` with contact notes + occasion context
- Birthday/anniversary detection: query `Lead` where `MONTH(birthday) = current_month AND DAY(birthday) within +14 days`
