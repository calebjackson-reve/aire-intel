# Implement Loop: Inbound Reply Handler

**Spec:** `loops/proposed/01-inbound-reply-handler.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only — never delete or rewrite existing logic; only add to it
- Mark every new code block with `// AIRE: loop:inbound-reply-handler`
- Use `getSetting(key, fallback)` for configurable thresholds: `async function getSetting(key: string, fallback = '') { const r = await prisma.setting.findUnique({ where: { key } }); return r?.value ?? fallback; }`
- Wrap external API calls in `withRetry()` from `src/lib/error-memory.ts`
- Log errors with `logError(type, source, err)` from `src/lib/error-memory.ts`
- Import prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on all new cron routes: `if (req.headers.get('authorization') !== \`Bearer ${process.env.CRON_SECRET}\`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })`

## What to Build

### 1. Contact intent classifier — `src/lib/contact-classifier.ts` (NEW)
Export `classifyReplyIntent(text: string): "interested" | "objection" | "question" | "unsubscribe"`
Use keyword matching (no AI call): "yes", "interested", "want to see" → interested; "stop", "unsubscribe", "remove me" → unsubscribe; "?" → question; "not" / "busy" / "don't" → objection.

### 2. Extend Lofty webhook — `src/app/api/lofty/webhook/route.ts` (MODIFY)
After the existing upsert logic, add a branch for `body.activity?.type === "sms_received" || body.activity?.type === "email_received"`:
- Classify intent via `classifyReplyIntent(body.activity.content ?? "")`
- If intent === "unsubscribe": update Lead stage to "closed_lost", add note to ContactLog
- Otherwise: update `Lead.lastContactedAt = new Date()`, bump temperature if cold/warm
- Create ContactLog entry: direction = "inbound"
- Call `generateDraft()` from `src/lib/draft-agent.ts` with context type "reply_to_inbound"
- Check for existing pending ActionQueue item with same leadId + same date before creating (idempotency)
- Create ActionQueue item: type = "draft_message", priority = 2, requiresApproval = true
- Create Notification for dashboard

### 3. Extend Zapier webhook — `src/app/api/webhooks/zapier/route.ts` (MODIFY)
Add handler for `event === "activity.logged"` that delegates to the same inbound reply logic.

## Oracle Gates
After implementing, run in `/Users/caleb/aire-platform`:
```
npx tsc --noEmit
npm run build
```
Both must exit 0. Fix TypeScript errors iteratively (max 10 attempts, give up after 3 consecutive failures with no progress).

## Done When
- `src/lib/contact-classifier.ts` exists with `classifyReplyIntent()` export
- Lofty webhook handles `sms_received` / `email_received` events
- Both typecheck and build pass
