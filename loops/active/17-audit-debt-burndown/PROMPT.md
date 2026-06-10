# Loop Iteration Prompt — audit-debt-burndown

You are running one iteration of the `audit-debt-burndown` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/17-audit-debt-burndown/SPEC.md`
2. `loops/active/17-audit-debt-burndown/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/17-audit-debt-burndown/`

## What this loop builds

Weekly Sunday 2AM CT cron. Route `/api/agents/audit-debt` that finds and fixes top 3 debt items: P1 = placeholder values (225-XXX-XXXX phone numbers), P2 = TypeScript errors, P4 = other TODOs. Reverts on oracle failure.

## Implementation units

**Unit A — scan for P1 placeholder debt**
- Run: `grep -rn "225-XXX-XXXX\|YOUR_PHONE\|TODO.*phone\|placeholder" src/ --include="*.ts" --include="*.tsx" | head -20`
- If `225-XXX-XXXX` found in `src/lib/smart-plan-templates.ts`:
  - Read that file
  - Replace `225-XXX-XXXX` with `process.env.CALEB_PHONE ?? "225-XXX-XXXX"` (graceful fallback)
  - Mark change with `// AIRE: loop:audit-debt-burndown`
  - Run oracle — if passes: commit `fix(audit-debt): replace phone placeholder with env var`
  - Record in Setting: `auditdebt.completedItems = "smart-plan-templates:phone-placeholder"`

**Unit B — fix P2 TypeScript errors**
- Run `npx tsc --noEmit 2>&1 | head -50` to see current errors
- Pick the simplest error (undefined access, missing null check, wrong type)
- Apply minimal fix (add `?.`, add `?? defaultValue`, add `as TypeName` where safe)
- Re-run oracle — if passes: commit `fix(audit-debt): fix TypeScript error in {file}`
- If fails: revert (read original file, write back), add to `auditdebt.blockedItems` Setting

**Unit C — audit-debt route (reporting only)**
- Create `src/app/api/agents/audit-debt/route.ts`
- POST handler, validate CRON_SECRET
- Run the scan and report: count TODOs, count TS errors, list top items
- Update Setting: `auditdebt.lastScan = new Date().toISOString()`, `auditdebt.todoCount = count.toString()`
- Create Notification with scan summary
- Add to vercel.json: `{ "path": "/api/agents/audit-debt", "schedule": "0 7 * * 0" }` (7am UTC Sunday = 2am CT)

## AIRE conventions (mandatory)

- `// AIRE: loop:audit-debt-burndown`; `logError()` on errors

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
