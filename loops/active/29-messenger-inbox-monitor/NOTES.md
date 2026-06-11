# Loop 29 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/messenger-monitor responds 200
- [ ] ActionQueue items pending > 4h are identified
- [ ] Manual replies detected via ContactLog
- [ ] SMS sent via Twilio for unresponded messenger items
- [ ] Idempotency keys written to Setting table
- [ ] Notification created per escalation

## Notes
- "Messenger" items: ActionQueue where payload.channel = "messenger" OR type = "draft_message"
  and agentType contains "inbound_reply" and createdAt < 4h ago
- ContactLog check: find any outbound entry for leadId created after ActionQueue item createdAt
- Setting key pattern: "messenger_escalation.{leadId}.last_sent" = ISO timestamp
- Parse setting value, check if < 4h ago
- SMS body: "AIRE: {leadName} hasn't been replied to on messenger in 4h. Check inbox."
- Limit to 5 escalations per run to avoid SMS spam
