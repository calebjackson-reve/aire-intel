# Loop 29 — Messenger Inbox Monitor

## Trigger
Cron: `0 */2 * * *` (every 2 hours)
Route: `GET /api/agents/messenger-monitor`

## Input
- ActionQueue items: type=draft_message, status=pending, agentType=inbound_reply_handler (messenger items)
- ContactLog for the same leadId (manual reply detection)
- Setting keys for idempotency per lead

## Actions
1. Query ActionQueue for messenger draft_message items pending > 4 hours
2. For each: check ContactLog for manual outbound reply by Caleb in same window
3. If Caleb already replied (ContactLog.direction="outbound" since item creation): skip
4. Check idempotency: Setting "messenger_escalation.{leadId}.last_sent" < 4h ago → skip
5. Send Twilio SMS to CALEB_PHONE: "AIRE: [Lead Name] hasn't been replied to in 4h — check messenger"
6. Write idempotency Setting key
7. Create Notification: "Escalation SMS sent for [Lead Name]"

## Oracle
- Each unanswered messenger lead gets an SMS escalation
- No duplicate escalations within 4h window per lead
- If Caleb manually replied: no SMS sent

## Safety Rails
- Requires CALEB_PHONE env var — if missing, create Notification only
- Requires Twilio config — graceful fallback to Notification only
- 4h minimum between escalations per lead
- Max 5 escalations per run
