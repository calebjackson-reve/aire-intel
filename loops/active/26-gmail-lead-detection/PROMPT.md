# Implementation Prompt — Loop 26

Implement Gmail lead detection at src/app/api/agents/gmail-lead-detect/route.ts.

1. Export dynamic = "force-dynamic"
2. Support GET and POST (cron auth)
3. Check GOOGLE_CLIENT_SECRET — if missing, create Notification and return early
4. Get Google access token from Setting table (same pattern as google-calendar.ts)
5. Call Gmail API: list unread messages from last 24h (max 20)
6. For each: fetch subject + snippet + from header
7. Call Anthropic claude-haiku-4-5 to classify: is this a real estate inquiry?
8. If yes and confidence >= 0.6:
   a. Extract sender email
   b. Check if lead exists (prisma.lead.findFirst where email = sender)
   c. If new: create Lead {name: sender name or email, email, stage:"new_lead", source:"gmail"}
   d. If existing: call handleInboundReply
9. Create Notification with {newLeads, repliesProcessed}
10. Return {ok:true, emailsScanned, newLeads, repliesProcessed}
