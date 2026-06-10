# Loop: Audit Debt Burndown

**Status:** [x] Approved  _(2026-06-09)_
**Type:** outer  
**Feeds (if outer):** All agents — resolves TODO/FIXME items that block agent reliability  
**Rank:** 17  
**Score:** 22 / 30

---

## Trigger

Weekly cron every Sunday at 2:00 AM CT. Scans CLAUDE.md, AGENTS.md, and all `src/` files for TODO comments, FIXME markers, placeholder values, and documented debt items. Works through the top 3 by priority.

## Input

- `CLAUDE.md` + `AGENTS.md` — documented integration gaps and TODOs
- `grep -r "TODO\|FIXME\|XXX\|PLACEHOLDER\|stub\|225-XXX" src/ --include="*.ts"` — inline debt in source
- `npx tsc --noEmit` output — TypeScript errors = implicit debt
- Current `ErrorLog` patterns — errors that keep recurring = likely unfixed debt
- `Setting["auditdebt.lastRun"]` + `Setting["auditdebt.completedItems"]` — what's been fixed already

## Actions

1. Scan for debt items using grep + CLAUDE.md parse. Assign priority:
   - Priority 1: Placeholder values in active code paths (phone numbers, API keys as string literals, `225-XXX-XXXX`)
   - Priority 2: TypeScript errors from `npx tsc --noEmit`
   - Priority 3: TODO comments in files that ErrorLog is flagging
   - Priority 4: TODO comments in other files
2. Filter out items already in `Setting["auditdebt.completedItems"]`
3. Take top 3 by priority
4. For each item:
   a. Read the file, understand the full context
   b. Implement the missing piece or replace the placeholder (using env vars, not hardcoded values)
   c. Run oracle: `npx tsc --noEmit && npm run build`
   d. If oracle passes: add to `Setting["auditdebt.completedItems"]`
   e. If oracle fails: revert and skip to next item
5. Write `AgentRun` record: `agentType = "audit_debt_burndown"`, `itemsProcessed = items fixed`
6. Create `Notification`: "Debt burndown: [N] items resolved this week — [brief list]"

## Oracle

**What external source of truth grades the output?**  
`npx tsc --noEmit` exits 0 AND `npm run build` exits 0 after each fix. For placeholder replacements: the placeholder string no longer appears in the file after the fix.

**Acceptance threshold:**  
TypeScript + build pass. No regression in existing functionality (build is the primary gate).

**Rejection signal:**  
Fix breaks typecheck or build → revert file. Same item appearing in 3 consecutive weekly scans without being fixable → add to `Setting["auditdebt.blockedItems"]` and flag for human: "Debt item in [file] requires manual resolution."

## Memory

- `Setting["auditdebt.completedItems"]` — JSON array of `file:line:signature` hashes of fixed items
- `Setting["auditdebt.blockedItems"]` — items that failed 3+ times
- `Setting["auditdebt.lastRun"]` — dedup guard
- `AgentRun` — execution history

## Surface

- Dashboard `Notification` (weekly Sunday): debt resolved summary
- `/system` page — show completed debt items count trend (reducing over time = healthy)

---

## Safety Rails

- **Human chokepoint:** Only fixes items where oracle (build + typecheck) passes. Reverts on failure. Never touches `.env` files or authentication configuration.
- **Blast radius:** Max 3 items per week. Reverts on oracle failure. Does not fix items in `prisma/schema.prisma` (migration required) or `vercel.json` (config file) — skip these and flag for human.
- **Rate limit / cap:** 3 items per weekly run. Never modifies `.env`, `*.md` documentation files, or test files.
- **Idempotency:** `Setting["auditdebt.completedItems"]` hash check prevents refixing.
- **Exit condition:** All TODO/FIXME items resolved (zero results from grep scan). `Setting["auditdebt.disabled"] = "true"` to pause.

---

## Implementation Notes

- Create `src/app/api/agents/audit-debt/route.ts`
- Add cron to `vercel.json`: `{ "path": "/api/agents/audit-debt", "schedule": "0 7 * * 0" }` (2AM CT Sunday = 7AM UTC)
- The `225-XXX-XXXX` placeholder in `src/lib/smart-plan-templates.ts` is Priority 1 — replace with `process.env.CALEB_PHONE ?? ''`
- TypeScript errors should be fixed by reading `npx tsc --noEmit` output, parsing the file/line/error, and applying a targeted fix
- Use `execSync('npx tsc --noEmit', { cwd: '/Users/caleb/aire-platform' })` for oracle gate check
