# Loop 34 — Content Pipeline Watch

**Status:** [x] Approved  
**Type:** outer  
**Feeds:** content-scheduler (triggers it when pipeline is dry)  
**Rank:** 34  
**Score:** 20 / 30

---

## Trigger

Cron: `0 14 * * *` — Daily 9AM CT (2PM UTC)  
Runs after content-scheduler's 4AM CT window so we're checking reality, not interrupting it.

## Input

- `prisma.actionQueue.count()` — pending post_content items
- `prisma.actionQueue.count()` — today's auto-generated items (cap check)
- `getSetting("content.pipeline.consecutiveEmptyDays")` — escalation tracker

## Actions

1. Count pending `post_content` items in ActionQueue
2. Count items auto-generated today by content_scheduler
3. If ≥3 pending → `{ pipelineFull: true }` — done, reset consecutive counter
4. If 1–2 pending and daily cap not hit → trigger `GET /api/agents/content-scheduler`
5. If 0 pending:
   - Increment `consecutiveEmptyDays` counter
   - Trigger scheduler if daily cap not hit
   - Create Notification (priority escalates after 2 consecutive empty days)

## Oracle

**External source:** `ActionQueue.count` — pure DB query  
_(No AI, no Meta, no Lofty — counts rows in our own DB)_

**Acceptance threshold:** ≥3 pending items = pipeline full  
**Rejection signal:** 0 pending for 2+ consecutive days → escalated notification

## Quality Gate

**Output type:** n/a — oracle is a DB row count, not AI-generated content

## Memory

Settings written:
- `content.pipeline.consecutiveEmptyDays` — integer counter, reset when pipeline fills
- `content.pipeline.lastEmptyDate` — date string of last empty day

## Surface

- Info notification when auto-refilling: "Content pipeline low — auto-refilling"
- Warning notification after 2+ consecutive empty days: "⚠ Content pipeline empty N days in a row"

---

## Safety Rails

- **Human chokepoint:** Triggered scheduler output still requires Caleb's approval via ActionQueue
- **Blast radius:** Only triggers the scheduler (which itself is rate-limited to 5/day) and writes Settings
- **Rate limit:** Daily cap of 5 auto-generated items prevents runaway
- **Idempotency:** content-scheduler's own idempotency guard (briefDate check) prevents double-runs
- **Exit condition:** Self-limiting — if pipeline fills, stops triggering

## Implementation Notes

- Route: `src/app/api/agents/content-pipeline-watch/route.ts`
- Uses `NEXT_PUBLIC_APP_URL` env var for internal scheduler trigger URL
- `getTodayCT()` from `src/lib/brief-date.ts` for consistent date key
