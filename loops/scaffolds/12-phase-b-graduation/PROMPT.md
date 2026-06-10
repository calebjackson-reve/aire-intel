# Implement Loop: Phase B Graduation Evaluator

**Spec:** `loops/proposed/12-phase-b-graduation.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:phase-b-graduation`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Phase B evaluator route — `src/app/api/agents/phase-b-eval/route.ts` (NEW)
```typescript
const ACTION_TYPES = ['draft_message', 'follow_up_text', 'send_client_email', 'post_content', 'create_lofty_task'];
const GRADUATION_CRITERIA: Record<string, { minItems: number; minApprovalRate: number; minSuccessRate: number }> = {
  create_lofty_task: { minItems: 20, minApprovalRate: 90, minSuccessRate: 100 },
  follow_up_text: { minItems: 15, minApprovalRate: 85, minSuccessRate: 100 },
  draft_message: { minItems: 30, minApprovalRate: 80, minSuccessRate: 95 },
  post_content: { minItems: 8, minApprovalRate: 75, minSuccessRate: 90 },
  send_client_email: { minItems: Infinity, minApprovalRate: Infinity, minSuccessRate: Infinity } // never graduates
};
```
Logic:
1. Auth check (CRON_SECRET)
2. Skip if `Setting["phaseb.lastEvaluation"]` is within 20 days
3. For each action type: query ActionQueue last 30 days, calculate approval rate + success rate
4. Compare against GRADUATION_CRITERIA
5. Collect graduation candidates (types that meet all criteria)
6. Collect reversal candidates (graduated types with recent high skip/fail rate)
7. Update `Setting["phaseb.graduationCandidates"]` with JSON list
8. Create Notification: "[N] action types eligible for Phase B — review in Settings"
9. Update `Setting["phaseb.lastEvaluation"]` = today

Note: this loop NEVER flips `requiresApproval`. It only reports candidates.

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/phase-b-eval", "schedule": "0 15 15 * *" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/phase-b-eval/route.ts` exists
- vercel.json has cron at `0 15 15 * *`
- TypeScript and build pass
