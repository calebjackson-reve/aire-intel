# Implement Loop: Meta Token Refresh Alert

**Spec:** `loops/proposed/04-meta-token-refresh-alert.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:meta-token-refresh-alert`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Token check helper in meta.ts — `src/lib/meta.ts` (MODIFY)
Add at the bottom:
```typescript
// AIRE: loop:meta-token-refresh-alert
export async function checkTokenExpiry(): Promise<{ daysRemaining: number; isExpired: boolean; expiresAt: Date | null }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  if (!token || !appToken.includes('|')) return { daysRemaining: -1, isExpired: true, expiresAt: null };
  
  try {
    const res = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appToken}`);
    const data = await res.json();
    if (!data?.data?.expires_at) return { daysRemaining: 999, isExpired: false, expiresAt: null }; // non-expiring system token
    const expiresAt = new Date(data.data.expires_at * 1000);
    const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);
    return { daysRemaining, isExpired: daysRemaining <= 0, expiresAt };
  } catch (err) {
    logError('meta', 'checkTokenExpiry', err as Error);
    return { daysRemaining: -1, isExpired: false, expiresAt: null }; // unknown, don't false-alarm
  }
}
```

### 2. Token alert step inside market-intel agent — `src/app/api/agents/market-intel/route.ts` (MODIFY)
At the start of the route handler (before Paragon/Zillow logic), add:
```typescript
// AIRE: loop:meta-token-refresh-alert
const lastChecked = await getSetting('meta.token.lastChecked', '');
const today = new Date().toISOString().split('T')[0];
if (lastChecked !== today) {
  const { daysRemaining, isExpired } = await checkTokenExpiry();
  // update Setting, create Notification/SMS as per spec
  await prisma.setting.upsert({ where: { key: 'meta.token.lastChecked' }, update: { value: today }, create: { key: 'meta.token.lastChecked', value: today } });
}
```
- 8–14 days remaining → warning Notification + DailyBrief.nonNegotiables entry
- < 7 days → warning Notification (SMS via Twilio if `src/lib/twilio.ts` is available)
- Expired → critical Notification + upsert Setting["agent.content_scheduler.paused"] = "true"

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `checkTokenExpiry()` exported from `src/lib/meta.ts`
- market-intel agent calls it at start
- TypeScript and build pass
