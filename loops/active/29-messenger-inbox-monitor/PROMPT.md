# Implementation Prompt — Loop 29

Implement messenger inbox monitor at src/app/api/agents/messenger-monitor/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Query ActionQueue: status="pending", type="draft_message", createdAt < 4h ago, limit 20
4. Filter to messenger items: payload.channel = "messenger"
5. For each (max 5 escalations total):
   a. Get leadId from payload or ActionQueue.leadId
   b. Check ContactLog for outbound entry after ActionQueue.createdAt → if found, skip
   c. Check Setting "messenger_escalation.{leadId}.last_sent" → if < 4h ago, skip
   d. Get CALEB_PHONE from env or Setting
   e. Get Twilio config via getTwilioConfig()
   f. If both available: send SMS
   g. Write Setting "messenger_escalation.{leadId}.last_sent" = now
   h. Create Notification: "Messenger escalation: {leadName}"
6. Return {ok:true, checked, escalated}
