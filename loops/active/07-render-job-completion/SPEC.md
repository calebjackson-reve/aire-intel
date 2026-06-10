# Loop: Render Job Completion Notifier

**Status:** [x] Approved  _(2026-06-09)_
**Type:** inner  
**Feeds (if outer):** n/a  
**Rank:** 07  
**Score:** 26 / 30

---

## Trigger

Polling cron every 5 minutes for any `ContentProject` with `status = "rendering"` (or equivalent in-progress state). Alternatively, a webhook from the render service (Remotion / custom render API) can POST to `/api/webhooks/render-complete` — prefer webhook if render service supports it.

## Input

- `ContentProject` — all records with `status = "rendering"` or `"processing"`: `id`, `title`, `type`, `renderId` (external job ID), `createdAt`, `leadId`
- Render service API: `GET /api/render/status/{renderId}` → `{ status, progress, outputUrl, error }`
- `ActionQueue` — check if a `post_content` item already exists for this project

## Actions

1. For each `ContentProject` in `status = "rendering"`:
   - Call render service status endpoint with `renderId`
2. **If status = "completed":**
   - Update `ContentProject.status = "ready"`, `ContentProject.outputUrl = outputUrl`
   - If no `ActionQueue` item exists for this project: create one (`type = "post_content"`, `priority = 4`, `requiresApproval = true`)
   - Create `Notification`: "[Project title] is ready — tap to review and schedule"
   - If project is linked to a lead (`leadId`): add note to lead's `ContactLog`
3. **If status = "failed":**
   - Update `ContentProject.status = "failed"`
   - Log to `ErrorLog` with render error details
   - Create `Notification` (warning): "[Project title] render failed — [error]"
4. **If status = "processing" and age > 30 minutes:** Log a warning notification — render is taking longer than expected.

## Oracle

**What external source of truth grades the output?**  
Render service API returns `status = "completed"` with a valid `outputUrl`. The rendered file is accessible at that URL (HTTP 200 on a HEAD request).

**Acceptance threshold:**  
`ContentProject.outputUrl` resolves to a valid media file within 15 minutes of starting render.

**Rejection signal:**  
Render service returns `status = "failed"` or `outputUrl` returns non-200. Or render exceeds 30 minutes without completing.

## Memory

- `ContentProject.status` + `.outputUrl` — updated on completion/failure
- `ContentProject.renderId` — external job ID for polling
- `ActionQueue` — post_content item created on completion (check before creating to avoid duplicates)

## Surface

- Dashboard `Notification` (immediate) on completion or failure
- `ActionQueue` item → appears in `/brief` content section and `/social` page
- `/create-post` page — project status badge should update from "rendering" → "ready"

---

## Safety Rails

- **Human chokepoint:** `ActionQueue` item created with `requiresApproval = true` — Caleb reviews the rendered output before it's scheduled or posted.
- **Blast radius:** DB writes only (ContentProject update, ActionQueue create, Notification create). Never auto-posts.
- **Rate limit / cap:** Poll at most once per 5 minutes per project. Stop polling after `status = "completed"` or `"failed"`. Max 20 active render jobs in flight simultaneously.
- **Idempotency:** Check `ContentProject.status !== "rendering"` before polling — if already completed/failed, skip. Check for existing `ActionQueue` item before creating.
- **Exit condition:** `ContentProject.status = "ready"`, `"failed"`, or `"archived"` — stop polling.

---

## Implementation Notes

- Currently the AIRE platform has a render system referenced in `src/lib/render/` — verify the render job model and `renderId` field exist on `ContentProject`
- If no webhook support: create `src/app/api/cron/render-poll/route.ts` + add to `vercel.json`: `{ "path": "/api/cron/render-poll", "schedule": "*/5 * * * *" }` (every 5 min)
- If webhook supported: create `src/app/api/webhooks/render-complete/route.ts`
- `ContentProject` model may need `renderId String?` and `outputUrl String?` fields — check schema first
- Verify `src/lib/render/` directory for existing render client code before writing new wrapper
