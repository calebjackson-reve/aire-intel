# Implement Loop: Calendly Post-Meeting Follow-Up

**Spec:** `loops/proposed/03-calendly-post-meeting-followup.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:calendly-post-meeting-followup`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on cron routes

## What to Build

### 1. Extend Calendly webhook — `src/app/api/webhooks/calendly/route.ts` (MODIFY)
The route already handles Calendly events. Add logic for `invitee.created`:
- Look up Lead by `payload.invitee.email`; if not found, create new Lead with source = "calendly"
- Update Lead stage to "active" if currently "new" or "cold"
- Create ContactLog entry: type = "meeting_scheduled", channel = "calendly", summary = meeting type + time
- Create Task: "Prepare for meeting with [Name]", dueDate = scheduledAt - 1h
- Create ActionQueue item: type = "send_client_email", priority = 2, requiresApproval = true, scheduledFor = now (confirmation email draft)
- Store the Calendly event UUID in the payload for idempotency: `payload.calendlyEventId = event.uuid`
- Dedup: check ActionQueue for existing item with `payload.calendlyEventId` before creating

### 2. Post-meeting delayed draft — add a scheduled trigger
Create `src/app/api/cron/meeting-followup/route.ts` (NEW):
- Validates CRON_SECRET
- Queries ActionQueue for items with `type = "calendly_followup_pending"` AND `scheduledFor <= new Date()`
- For each: calls `generateDraft()` with template "post_meeting_followup"
- Creates ActionQueue item: type = "send_client_email", priority = 2, requiresApproval = true

When meeting is booked (in webhook handler above), also create an ActionQueue item:
- type = "calendly_followup_pending", scheduledFor = endTime + 30 minutes, status = "pending"
- This acts as a timer — the cron picks it up and converts it to a draft

### 3. Add cron to vercel.json
Add: `{ "path": "/api/cron/meeting-followup", "schedule": "*/15 * * * *" }` (every 15 minutes checks for due follow-ups)
Only add if not already present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```
Both must pass. Max 10 iterations, give up after 3 consecutive failures with no progress.

## Done When
- Calendly webhook handles `invitee.created` with Lead upsert + prep task + confirmation draft
- Meeting follow-up cron route exists
- `vercel.json` has the 15-minute follow-up cron
- TypeScript and build pass
