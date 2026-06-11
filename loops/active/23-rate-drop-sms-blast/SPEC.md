# Loop 23 — Rate Drop SMS Blast

## Trigger
Cron: `0 12 * * *` (daily at noon UTC)
Route: `GET /api/agents/rate-drop-blast`

## Input
- FRED MORTGAGE30US series (free, no key required via CSV endpoint)
- Leads with stage IN [active, new_lead] AND phone IS NOT NULL AND lastContactDate < 14 days ago (limit 50)
- Setting: `rate_alert.last_blast_date` for idempotency

## Actions
1. Fetch current and prior week 30-yr fixed mortgage rate from FRED
2. Compute delta = current - prior
3. If delta <= -0.125: build an ActionQueue item per qualified lead
4. ActionQueue type: `follow_up_text`, requiresApproval: true, priority: 1
5. Payload includes: to (phone), body (personalized SMS), leadId, leadName
6. Write `rate_alert.last_blast_date` = today (idempotency gate)
7. Create Notification summarizing total leads queued

## Oracle (definition of success)
- Rate drop detected → ActionQueue rows created for qualified leads
- No duplicate blast same day (idempotency key checked)
- No blast if delta > -0.125 (not enough movement)

## Safety Rails
- Max 50 leads per blast to avoid spam
- requiresApproval: true — Caleb approves before send
- Skip leads contacted within 14 days
- Idempotency: one blast per calendar day max
- Never blast closed_won or closed_lost leads
