# Loop: render-job-completion — Handoff Notes

## Spec Summary
Poll or webhook for ContentProject records in "rendering" status. On completion, update status, create ActionQueue post_content item, notify Caleb.

## Definition of Done (from SPEC.md)
- `src/app/api/cron/render-poll/route.ts` exists
- `src/app/api/webhooks/render-complete/route.ts` exists
- vercel.json has `*/5 * * * *` cron for `/api/cron/render-poll`
- ContentProject.renderId and ContentProject.outputUrl fields exist in schema
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma — find ContentProject model. Check for renderId, outputUrl, status fields.

### Iteration 1 — all units complete ✓
**Done:**
- Unit A: schema already had `renderId String?` and `outputUrl String?` on ContentProject + full `RenderJob` model
- Unit B: `src/app/api/webhooks/render-complete/route.ts` — validates `x-render-secret`, handles completed/failed, idempotency on ActionQueue
- Unit C: `src/app/api/cron/render-poll/route.ts` — polls RenderJob records in "rendering" >30min, same completion/failure logic; vercel.json has `*/5 * * * *`
- Oracle: `npx tsc --noEmit` clean + `npm run build` passes — both routes appear in build output
- Commit: `7d8ef3e`

**Status: DONE** — all definition-of-done criteria met.
