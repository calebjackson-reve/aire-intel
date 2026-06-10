# Loop Iteration Prompt — calendly-post-meeting-followup

You are running one iteration of the `calendly-post-meeting-followup` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/03-calendly-post-meeting-followup/SPEC.md`
2. `loops/active/03-calendly-post-meeting-followup/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/03-calendly-post-meeting-followup/`

## What this loop builds

(1) Extend Calendly webhook: on `invitee.created`, upsert lead, create prep task, queue confirmation draft.
(2) New 15-min cron route that converts `calendly_followup_pending` ActionQueue items past their `scheduledFor` time into follow-up drafts.

## Implementation units

**Unit A — Calendly webhook: invitee.created**
- Read `src/app/api/webhooks/calendly/route.ts` (or find it: `find src -name "*.ts" -path "*calendly*"`)
- Add handler for `event = "invitee.created"` (check payload structure: `payload.invitee.email`, `payload.event.start_time`, `payload.event.uuid`)
- Upsert Lead by email (set source="calendly" if new, else update lastContactedAt)
- Create Task: `title: "Prep for meeting with {name}"`, `dueDate: 2h before meeting`, priority 2
- Create ActionQueue: `type: "draft_message"`, payload: `{leadId, meetingTime, meetingType: payload.event.name, calendlyEventId: payload.event.uuid}`, `requiresApproval: true`, `scheduledFor: meetingTime + 15min`
- Idempotency key: `calendlyEventId` — check ActionQueue before creating
- Mark all code `// AIRE: loop:calendly-post-meeting-followup`

**Unit B — meeting-followup cron route**
- Create `src/app/api/cron/meeting-followup/route.ts`
- POST handler, validate `Authorization: Bearer ${process.env.CRON_SECRET}`
- Query ActionQueue where `type = "calendly_followup_pending"` AND `status = "pending"` AND `scheduledFor <= now`
- For each (cap 10/run), generate a follow-up draft via `generateDraft()` from draft-agent.ts
- Update ActionQueue item type to `"draft_message"`, status stays `"pending"` (human approves)
- Mark code `// AIRE: loop:calendly-post-meeting-followup`

**Unit C — vercel.json cron entry**
- Read `vercel.json`
- Add `{ "path": "/api/cron/meeting-followup", "schedule": "*/15 * * * *" }` to crons array
- This is additive — don't remove existing entries

## AIRE conventions (mandatory)

- Additive only
- `// AIRE: loop:calendly-post-meeting-followup` on all new code
- `withRetry()` for any external calls, `logError()` on catches
- Import prisma from `src/lib/prisma.ts`

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

1. Oracle → commit → update NOTES.md
2. End with status block: `STATUS: COMPLETE / EXIT_SIGNAL: true` if all Done When met, else `IN_PROGRESS / false`.
