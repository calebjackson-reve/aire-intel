# Loop Iteration Prompt — inbound-reply-handler

You are running one iteration of the `inbound-reply-handler` loop. This is a relay race — do ONE meaningful unit of work, then hand off.

## Your first action every iteration

Read these three files before doing anything else:
1. `loops/active/01-inbound-reply-handler/SPEC.md` — the full spec and Done When conditions
2. `loops/active/01-inbound-reply-handler/NOTES.md` — the handoff log from prior iterations
3. `CLAUDE.md` (project root) — AIRE coding conventions you must follow

Then run: `git log --oneline -10 loops/active/01-inbound-reply-handler/` to see what was committed.

## What this loop builds

Extend the Lofty and Zapier webhooks to detect inbound SMS/email replies, classify intent via `classifyReplyIntent()`, update lead state, generate a reply draft, and create an ActionQueue item for human approval.

## Implementation units (pick the next incomplete one from NOTES.md)

**Unit A — contact-classifier.ts**
- Check if `src/lib/contact-classifier.ts` exists. If it does, verify it exports `classifyReplyIntent()` and `ReplyIntent` type. If not, create it.
- Must export: `ReplyIntent = "interested" | "objection" | "question" | "unsubscribe"`
- Use regex patterns. Mark with `// AIRE: loop:inbound-reply-handler`

**Unit B — Lofty webhook: sms_received / email_received**
- Read `src/app/api/lofty/webhook/route.ts`
- Add a handler branch for `activity_type === "sms_received"` and `activity_type === "email_received"`
- Call `classifyReplyIntent(body.text ?? body.subject)` 
- Update Lead.status based on intent (interested → "active", unsubscribe → "do_not_contact")
- Create ActionQueue item: `type: "draft_message"`, payload with leadId + intent + originalText, `requiresApproval: true`
- Create Notification: `type: "inbound_reply"`, message summarizing the intent
- Use `getSetting()` for any thresholds. Use `withRetry()` for any external calls.
- Mark all new code with `// AIRE: loop:inbound-reply-handler`

**Unit C — Zapier webhook: activity.logged**
- Read `src/app/api/webhooks/zapier/route.ts` (or wherever the Zapier webhook lives — `find src -name "*.ts" -path "*/zapier*"`)
- Add handler for event type `activity.logged` with the same reply classification logic as Unit B

**Unit D — integration smoke test**
- Verify typecheck + build pass
- Check that the inbound reply path is idempotent (dedup on ActivityLog/ContactLog if available)

## AIRE conventions (mandatory)

- Additive only — do not remove or modify existing logic
- Every new function or handler: `// AIRE: loop:inbound-reply-handler`
- Use `getSetting(key, default)` from `src/lib/settings.ts` for any configurable thresholds
- Use `withRetry(fn, retries)` from `src/lib/error-memory.ts` for external API calls
- Use `logError(error, context)` from `src/lib/error-memory.ts` for error handling
- Import prisma from `src/lib/prisma.ts`

## Oracle (must pass before committing)

```bash
npx tsc --noEmit && npm run build
```

Both must exit 0. If either fails: fix the errors first, then verify again. Never commit red.

## After your unit of work

1. Run the oracle. Fix any failures before committing.
2. `git add -p` the specific files you changed.
3. Commit: `git commit -m "loops(inbound-reply-handler): <what you did>"`
4. Update `loops/active/01-inbound-reply-handler/NOTES.md` — append an iteration entry: what you did, what's next.
5. End your response with EXACTLY this block (no extra text after it):

```
STATUS: COMPLETE
EXIT_SIGNAL: true
```

if ALL Done When conditions in SPEC.md are met. Otherwise:

```
STATUS: IN_PROGRESS
EXIT_SIGNAL: false
```

or if you cannot proceed:

```
STATUS: BLOCKED
EXIT_SIGNAL: false
```

with a one-line explanation of the blocker in NOTES.md.
