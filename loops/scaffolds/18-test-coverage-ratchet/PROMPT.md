# Implement Loop: Test Coverage Ratchet

**Spec:** `loops/proposed/18-test-coverage-ratchet.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:test-coverage-ratchet`
- getSetting / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Coverage ratchet route — `src/app/api/agents/coverage-ratchet/route.ts` (NEW)
```typescript
export async function POST(req: Request) {
  // 1. Auth check (CRON_SECRET)
  // 2. Check if test runner is configured: read package.json, verify "test" script exists
  // 3. Run: execSync('npm test -- --coverage --passWithNoTests --coverageReporters=json-summary', { cwd: process.cwd() })
  // 4. Read coverage/coverage-summary.json — parse { total: { lines, branches, functions, statements } each with { pct } }
  // 5. Compare against Setting["coverage.baseline"] (JSON string)
  // 6. If any metric decreased: identify lowest-covered modified file, write a smoke test
  // 7. Re-run coverage; if recovered: update baseline
  // 8. Update Setting["coverage.history"] (last 8 weekly snapshots, JSON array)
  // 9. Create Notification with result
}
```

### 2. Smoke test template
If coverage is lacking for an agent route (e.g., `src/app/api/agents/morning-brief/route.ts`), write `src/__tests__/agents/<name>.test.ts`:
```typescript
// AIRE: loop:test-coverage-ratchet
describe('<route>', () => {
  it('returns 401 without CRON_SECRET', async () => {
    const res = await fetch('http://localhost:3000/api/agents/<name>', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
```
This is a minimal smoke test — just verify the auth gate works.

### 3. Add cron to vercel.json
Add: `{ "path": "/api/agents/coverage-ratchet", "schedule": "0 7 * * 6" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/coverage-ratchet/route.ts` exists
- vercel.json has cron at `0 7 * * 6`
- TypeScript and build pass
