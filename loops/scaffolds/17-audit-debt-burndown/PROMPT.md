# Implement Loop: Audit Debt Burndown

**Spec:** `loops/proposed/17-audit-debt-burndown.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:audit-debt-burndown`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Audit debt route — `src/app/api/agents/audit-debt/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Check `Setting["auditdebt.lastRun"]` date — skip if same day or < 6 days ago
3. Run `execSync('npx tsc --noEmit 2>&1', { cwd: cwd })` — collect TypeScript errors (Priority 2)
4. Run `execSync('grep -r "TODO\\|FIXME\\|225-XXX\\|placeholder\\|stub" src/ --include="*.ts" -n', { cwd: cwd })` — collect TODO items (Priority 1 if contains 225-XXX or placeholder, else Priority 4)
5. Parse results into `DebtItem[]` = `{ file, line, type, content, priority }`
6. Filter out items in `Setting["auditdebt.completedItems"]` (JSON array of `file:line:hash` keys)
7. Skip items in `Setting["auditdebt.blockedItems"]`
8. Take top 3 by priority
9. For each item:
   a. Read the file
   b. Apply the fix (null guard, env var replacement for 225-XXX, etc.)
   c. Run oracle: `execSync('npx tsc --noEmit && npm run build', { cwd })`
   d. If pass: add to completedItems, upsert Setting
   e. If fail: revert file (restore original content), add attempt count
10. Write AgentRun, create Notification
11. Update `Setting["auditdebt.lastRun"]` = today

### Priority fix: `225-XXX-XXXX` in `src/lib/smart-plan-templates.ts`
This is a known P1 item. Replace with `process.env.CALEB_PHONE ?? ''`.

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/audit-debt", "schedule": "0 7 * * 0" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/audit-debt/route.ts` exists
- `225-XXX-XXXX` in smart-plan-templates.ts is replaced with env var
- vercel.json has cron at `0 7 * * 0`
- TypeScript and build pass
