# Implement Loop: PropStream Intent-Based Revival

**Spec:** `loops/proposed/14-propstream-intent-revival.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:propstream-intent-revival`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Intent revival route — `src/app/api/agents/intent-revival/route.ts` (NEW)
Logic:
1. Auth check (CRON_SECRET)
2. Check `Setting["propstream.lastRunWeek"]` ISO week — skip if same week
3. Query cold leads: stage IN ["cold", "new"] OR temperature = "cold", lastContactedAt < 30 days ago, stage NOT IN ["closed_won", "closed_lost"], tags NOT containing "do_not_contact"
4. Take up to 20 leads as candidates
5. For each lead, score intent signals using Paragon:
   - Call `fetchListings()` from `src/lib/paragon.ts` with `areas` filter matching `lead.areas`
   - Count new listings / price drops in lead's areas in last 7 days
   - Intent score: 1pt per listing, 2pt for price drop, 3pt for listing matching lead's prior inquiry
6. Sort by intent score descending; take top 10
7. For each:
   - Check ActionQueue for existing revival draft this week for same leadId — skip if exists
   - Check ContactLog for recent outbound contact (last 30 days) — skip if exists  
   - Build draft context: include top listing from their area as the hook
   - Call `generateDraft()` with template "intent_revival" and listing context
   - Create ActionQueue item: type = "draft_message", priority = 5, requiresApproval = true
8. Set `Setting["propstream.lastRunWeek"]` = current ISO week
9. Write AgentRun record; Create Notification

### 2. Add cron to vercel.json
Add: `{ "path": "/api/agents/intent-revival", "schedule": "0 13 * * 3" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/agents/intent-revival/route.ts` exists
- vercel.json has cron at `0 13 * * 3`
- TypeScript and build pass
