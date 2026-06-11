# Implementation Prompt — Loop 30

Implement the Skill Optimizer agent at src/app/api/agents/skill-optimizer/route.ts.

This agent runs weekly and improves loop prompts by scoring them against their real
approval-rate data and generating better variants via AI — never auto-applying them.

## Steps

1. Export `export const dynamic = "force-dynamic"` at top of file.

2. Support POST (cron with Authorization header) and GET (manual trigger).

3. Read Setting `skill_optimizer.last_loop_rank` (default "0"), parse to int,
   increment mod 29 (range 1–29), save back via prisma.setting.upsert.

4. Find loop directory: list `loops/active/` directories, find one whose name starts
   with the zero-padded rank (e.g. rank 3 → "03-"). If not found, create Notification
   "Skill Optimizer: no loop found for rank {rank}" and return {ok:false}.

5. Read PROMPT.md: `fs.readFileSync(path.join(process.cwd(), "loops/active", dir, "PROMPT.md"), "utf8")`.
   If file not found, create Notification and return early.

6. Compute approval rate for that loop:
   - Extract slug from dir name: strip leading "XX-" prefix, replace dashes with underscores
     e.g. "03-calendly-post-meeting-followup" → "calendly_post_meeting_followup"
   - Query ActionQueue: last 30 days, agentType = slug
   - approved count: status IN ["approved", "executed"]
   - total count: all rows for that agentType in last 30 days
   - approvalRate = total > 0 ? approved / total : null

7. Idempotency: check Setting `skill_optimizer.{slug}.last_run_week` — if it matches
   ISO week string (e.g. "2026-W24"), skip and return {ok:true, skipped:"already_ran_this_week"}.
   Otherwise proceed and write this key at end.

8. Call Anthropic claude-fable-5 to generate 3 variant prompts:
   - Use fetch to https://api.anthropic.com/v1/messages (same pattern as market-intel)
   - Model: "claude-fable-5", max_tokens: 2000
   - System: You are an expert AI agent prompt engineer. You improve loop prompts for
     an autonomous real estate operations system called AIRE.
   - User message: include current prompt text, approval rate, and ask for 3 variants
     each with: (a) a one-sentence hypothesis for why it will perform better, and
     (b) the full improved prompt text.
   - If ANTHROPIC_API_KEY is missing or call fails: variantsText = "(variants unavailable — check ANTHROPIC_API_KEY)"

9. Write variants: `fs.writeFileSync(path.join(process.cwd(), "loops/active", dir, "PROMPT.variants.md"), variantsText, "utf8")`

10. Create ActionQueue item:
    - type: "skill_review"
    - agentType: "skill-optimizer"
    - requiresApproval: true  ← hardcoded, never false
    - priority: 5
    - payload: { slug, dir, approvalRate, variantsSummary: first 300 chars of variantsText }

11. Create Notification:
    - type: "sync_complete"
    - title: `Skill Optimizer: ${slug} — 3 variants ready`
    - body: `Approval rate: ${approvalRate !== null ? (approvalRate * 100).toFixed(0) + "%" : "no data"}. Review PROMPT.variants.md`
    - href: "/system"

12. Write idempotency key: Setting `skill_optimizer.{slug}.last_run_week` = ISO week string.

13. Return Response.json({ ok: true, slug, approvalRate })

## Imports needed
- `import fs from "fs"` and `import path from "path"`
- `import { prisma } from "@/lib/prisma"`
- `import { logError } from "@/lib/error-memory"`
- `import { getTodayCT } from "@/lib/brief-date"`
- `import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth"`

Do NOT import Anthropic SDK — use raw fetch like market-intel does.
