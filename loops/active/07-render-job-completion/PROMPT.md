# Loop Iteration Prompt — render-job-completion

You are running one iteration of the `render-job-completion` loop. Do ONE meaningful unit of work.

## Your first action every iteration

Read:
1. `loops/active/07-render-job-completion/SPEC.md`
2. `loops/active/07-render-job-completion/NOTES.md`
3. `CLAUDE.md`

Then: `git log --oneline -10 loops/active/07-render-job-completion/`

## What this loop builds

(1) A polling cron `/api/cron/render-poll` that checks ContentProject records in "rendering" status.
(2) A webhook `/api/webhooks/render-complete` for push-based completion events.
Both update ContentProject status, create an ActionQueue post_content item, and notify Caleb.

## Implementation units

**Unit A — schema check + migration if needed**
- Read `prisma/schema.prisma` — find ContentProject model
- Verify it has: `renderId String?`, `outputUrl String?`, `status String` (or `@default("draft")`)
- If missing fields: add them to the model and note that `npx prisma migrate dev` is needed (write a comment in NOTES.md — do NOT run migration automatically, just add the schema fields and note the command needed)

**Unit B — render-complete webhook**
- Create `src/app/api/webhooks/render-complete/route.ts`
- POST handler — validate a shared secret: `req.headers["x-render-secret"] === process.env.RENDER_WEBHOOK_SECRET`
- Expect body: `{ renderId: string, outputUrl: string, status: "completed" | "failed" }`
- On completed: update ContentProject where `renderId = renderId`, set `outputUrl`, set `status = "ready"`
- Create ActionQueue: `type: "post_content"`, payload: `{contentProjectId, outputUrl}`, `requiresApproval: true`
- Create Notification: "Render complete — ready to post"
- Idempotency: skip if ContentProject.status is already "ready"
- Mark `// AIRE: loop:render-job-completion`

**Unit C — render-poll cron**
- Create `src/app/api/cron/render-poll/route.ts`
- POST handler, validate CRON_SECRET
- Query ContentProject where `status = "rendering"` AND `updatedAt < 30min ago`
- For each (max 10): attempt to call render provider status API if `renderId` set
- On completed status: same logic as webhook handler above
- Add to vercel.json: `{ "path": "/api/cron/render-poll", "schedule": "*/5 * * * *" }`

## AIRE conventions (mandatory)

- `// AIRE: loop:render-job-completion` on all new code
- `withRetry()` for external calls, `logError()` on catches

## Oracle

```bash
npx tsc --noEmit && npm run build
```

## After your unit

Oracle → commit → update NOTES.md → status block.
