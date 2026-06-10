# Implement Loop: Lofty Sync Health Monitor

**Spec:** `loops/proposed/13-lofty-sync-health.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:lofty-sync-health`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Health check helper — `src/lib/lofty.ts` (MODIFY)
Add at the bottom:
```typescript
// AIRE: loop:lofty-sync-health
export async function checkLoftyHealth(): Promise<{ status: 'healthy' | 'expired' | 'down'; responseMs: number; tokenValid: boolean }> {
  const start = Date.now();
  try {
    const token = await getLoftyAccessToken(); // use existing token function
    const res = await fetch('https://api.lofty.com/api/v1/leads?limit=1', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    });
    const responseMs = Date.now() - start;
    if (res.status === 401) return { status: 'expired', responseMs, tokenValid: false };
    if (!res.ok) return { status: 'down', responseMs, tokenValid: false };
    return { status: 'healthy', responseMs, tokenValid: true };
  } catch (err) {
    logError('lofty', 'checkLoftyHealth', err as Error);
    return { status: 'down', responseMs: Date.now() - start, tokenValid: false };
  }
}
```

### 2. Health check step — add to morning-brief route or create standalone
Add a `checkLoftyHealth()` call at the start of `src/app/api/agents/morning-brief/route.ts`:
```typescript
// AIRE: loop:lofty-sync-health
const today = new Date().toISOString().split('T')[0];
const lastHealthCheck = await getSetting('lofty.lastHealthCheck', '');
if (lastHealthCheck !== today) {
  const health = await checkLoftyHealth();
  await prisma.setting.upsert({ where: { key: 'lofty.tokenStatus' }, update: { value: health.status }, create: { key: 'lofty.tokenStatus', value: health.status } });
  if (health.status === 'expired') {
    // Create critical Notification, SMS Caleb
    logError('lofty', 'morning-brief/health-check', new Error('Lofty auth expired'));
  }
  await prisma.setting.upsert({ where: { key: 'lofty.lastHealthCheck' }, update: { value: today }, create: { key: 'lofty.lastHealthCheck', value: today } });
}
```

## Oracle Gates
```
npx tsc --noEmit
npm run build
```
Read `src/lib/lofty.ts` first to find the existing token function name before writing the health check.

## Done When
- `checkLoftyHealth()` exported from `src/lib/lofty.ts`
- morning-brief route calls it at start
- TypeScript and build pass
