# Loop 26 — Gmail Lead Detection

## Trigger
Cron: `*/30 * * * *` (every 30 minutes)
Route: `GET /api/agents/gmail-lead-detect`

## Input
- Gmail unread messages from last 24h
- Lead table (email field for dedup)
- Anthropic API for classification

## Actions
1. Graceful Gmail check (GOOGLE_CLIENT_SECRET required)
2. List unread Gmail threads from last 24h
3. For each thread: read subject + snippet
4. Classify with Anthropic: is this a real estate inquiry? (yes/no + confidence)
5. If new email not found in Lead.email: create Lead (stage=new_lead, source="gmail")
6. Call handleInboundReply from src/lib/inbound-reply.ts for existing leads
7. Create Notification with count of new leads detected

## Oracle
- Real estate inquiry emails → lead created or reply processed
- Duplicate emails (already in DB) → handleInboundReply called
- Non-RE emails → skipped
- No Google → Notification + early return

## Safety Rails
- Graceful: no Google connection → Notification + early return
- Max 20 emails per run
- Classification confidence threshold: skip if < 0.6
- Never create duplicate leads (dedup by email)
- Rate limit: max 5 new leads per run
