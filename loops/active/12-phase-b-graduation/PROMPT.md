# Loop Iteration Prompt — phase-b-graduation

You are running one iteration of the `phase-b-graduation` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/12-phase-b-graduation/SPEC.md`
2. `loops/active/12-phase-b-graduation/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/12-phase-b-graduation/`

## What this loop builds

Monthly 15th 9AM cron. Route `/api/agents/phase-b-eval` that analyzes ActionQueue history by action type and reports which types have earned Phase B graduation (auto-execute eligibility). Never automatically changes `requiresApproval` — human decides.

## Implementation units

**Unit A — phase-b-eval route**
- Create `src/app/api/agents/phase-b-eval/route.ts`
- POST handler, validate CRON_SECRET
- Analyze the 5 action types for last 30 days:
  - `draft_message`, `post_content`, `create_lofty_task`, `send_client_email`, `follow_up_text`
- For each type, compute:
  - `totalItems`: count where createdAt > 30 days ago
  - `approvedCount`: status in ["approved", "executed"]
  - `executedCount`: status = "executed"
  - `failedCount`: status = "failed"
  - `approvalRate`: approvedCount / Math.max(totalItems, 1)
  - `successRate`: executedCount / Math.max(approvedCount, 1)
- Graduation criteria (from spec): approvalRate >= 0.90 AND successRate >= 0.95 AND totalItems >= 20
- Build `graduationCandidates: Array<{ type, approvalRate, successRate, totalItems, eligible }>`
- Update Setting: `phaseb.graduationCandidates = JSON.stringify(candidates)`
- Create Notification listing eligible types (or "No types eligible yet" if none)
- Mark `// AIRE: loop:phase-b-graduation`

**Unit B — vercel.json cron entry**
- Add `{ "path": "/api/agents/phase-b-eval", "schedule": "0 15 15 * *" }` (15:00 UTC 15th = 9AM CT 15th)

## AIRE conventions (mandatory)

- `// AIRE: loop:phase-b-graduation`; `logError()`, prisma from `src/lib/prisma.ts`
- NEVER set requiresApproval = false — analysis and reporting only

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
