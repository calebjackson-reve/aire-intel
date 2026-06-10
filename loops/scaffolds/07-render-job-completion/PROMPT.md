# Implement Loop: Render Job Completion Notifier

**Spec:** `loops/proposed/07-render-job-completion.md`  
**Platform:** `/Users/caleb/aire-platform` — Next.js App Router, Prisma v7, SQLite dev

Read the full spec before writing any code.

## Rules
- Additive only; mark new blocks `// AIRE: loop:render-job-completion`
- getSetting / withRetry / logError from `src/lib/error-memory.ts`
- Prisma from `src/lib/prisma.ts`
- CRON_SECRET auth on route

## What to Build

### 1. Read existing render code first
Read `src/lib/render/` directory to understand the existing render client and ContentProject model integration. Verify: Does ContentProject have `renderId` and `outputUrl` fields?

### 2. Render poll route — `src/app/api/cron/render-poll/route.ts` (NEW)
If `ContentProject` doesn't have `renderId` or `outputUrl`, add them first (with `// AIRE:` comment + migration note).

Logic:
1. Auth check (CRON_SECRET)
2. Query ContentProject where `status = "rendering"` AND `renderId` is not null
3. For each (max 20):
   - Call render service status API (use existing render client from `src/lib/render/`)
   - If completed: update ContentProject.status = "ready", set outputUrl
   - Check ActionQueue for existing post_content item; if none: create one
   - Create Notification "Ready: [title]"
   - If failed: update status = "failed", logError, create warning Notification
   - If age > 30 min and still processing: create warning Notification
4. Write AgentRun record

### 3. Webhook route — `src/app/api/webhooks/render-complete/route.ts` (NEW — lighter path)
Handles POST from render service on completion. Validates a `RENDER_WEBHOOK_SECRET` header. Updates ContentProject + creates ActionQueue item + Notification. Delegates to same logic as poll route.

### 4. Add cron to vercel.json
Add: `{ "path": "/api/cron/render-poll", "schedule": "*/5 * * * *" }` — only if not present.

## Oracle Gates
```
npx tsc --noEmit
npm run build
```

## Done When
- `src/app/api/cron/render-poll/route.ts` exists
- `src/app/api/webhooks/render-complete/route.ts` exists
- vercel.json has the 5-minute cron
- TypeScript and build pass
