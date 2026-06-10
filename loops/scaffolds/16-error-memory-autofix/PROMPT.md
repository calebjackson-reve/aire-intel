# Implement Loop: Error Memory Auto-Fix

**Spec:** `loops/proposed/16-error-memory-autofix.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:error-memory-autofix`
- getSetting / withRetry / logError / detectPatterns / getHealthScore from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Error autofix route — `src/app/api/agents/error-autofix/route.ts` (NEW)
```typescript
export async function POST(req: Request) {
  // 1. Auth check (CRON_SECRET)
  // 2. Call getHealthScore() — skip if > 85
  // 3. Call detectPatterns() — get error groups with count >= 3 in last 24h
  // 4. For top 3 patterns (skipping Setting["autofix.skippedPatterns"]):
  //    a. Read source file (parse source field)
  //    b. Classify error type
  //    c. Apply fix (null guard, retry config, etc.)
  //    d. Run oracle: execSync('npx tsc --noEmit && npm run build')
  //    e. If pass: mark errors resolved, write AgentRun
  //    f. If fail: revert file (restore original content)
  // 5. Create Notification with results
}
```

Key implementation details:
- Error source field format is typically "route/component" — map to file path heuristic: "api/lofty/webhook" → "src/app/api/lofty/webhook/route.ts"
- File read/revert pattern: `const original = await fs.readFile(filePath, 'utf-8')` → apply fix → oracle → if fail: `await fs.writeFile(filePath, original)`
- Use Node.js `execSync` from `child_process` for oracle: `execSync('npx tsc --noEmit', { cwd: process.cwd(), stdio: 'pipe' })`
- Error classifications: "Cannot read properties of undefined" → add `?.` null guard before the property access; "ECONNREFUSED" → increase timeout in withRetry; "P2002" (Prisma unique) → add upsert instead of create
- `Setting["autofix.skippedPatterns"]`: JSON array — parse with `JSON.parse(val || '[]')`

### 2. Add cron entry to vercel.json
Add: `{ "path": "/api/agents/error-autofix", "schedule": "0 7 * * *" }` — only if not already present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/error-autofix/route.ts` exists with POST handler
- vercel.json has cron entry at `0 7 * * *`
- TypeScript and build pass
