# Loop 30 — Skill Optimizer

## Trigger
Cron: `0 7 * * 0` (every Sunday 2AM CT = 7AM UTC)
Route: `POST /api/agents/skill-optimizer`

## Purpose
Auto-improves loop prompts over time. Picks 1 loop per week (round-robin), scores it by
approval rate in ActionQueue, generates 3 improved variants via claude-fable-5, then gates
all changes behind human review. Never auto-applies variants.

## Input
- Setting key `skill_optimizer.last_loop_rank` — integer 0–28, tracks which loop ran last
- `loops/active/{dir}/PROMPT.md` — the current prompt for the selected loop
- ActionQueue: approval rate for the loop's agentType over last 30 days
  - approved: status IN (approved, executed)
  - total: all statuses for that agentType in last 30 days

## Actions
1. Read `skill_optimizer.last_loop_rank` (default 0), increment mod 29, save back
2. Find the loop directory whose name starts with the zero-padded rank (e.g. "01-...", "02-...")
3. Read that loop's PROMPT.md
4. Query ActionQueue for approval rate: last 30 days, agentType = loop slug
5. Call claude-fable-5 to generate 3 improved variant prompts with per-variant hypothesis
6. Write variants to `loops/active/{dir}/PROMPT.variants.md`
7. Create ActionQueue item: type=skill_review, agentType=skill-optimizer, requiresApproval=true,
   payload includes {slug, approvalRate, variantsSummary}
8. Create Notification: "Skill Optimizer: {slug} — 3 variants ready"
9. Return {ok:true, slug, approvalRate}

## Oracle / Definition of Done
- [ ] Route at /api/agents/skill-optimizer responds 200
- [ ] Round-robin advances 1 step per run and wraps at 29
- [ ] PROMPT.md is read from the correct loop directory
- [ ] Approval rate is computed over last 30 days
- [ ] 3 variants are generated and written to PROMPT.variants.md
- [ ] ActionQueue skill_review item created with requiresApproval=true
- [ ] Notification created
- [ ] Variants are NEVER auto-applied — human reviews first

## Safety Rails
- If ANTHROPIC_API_KEY is missing: skip variant generation, still create ActionQueue item noting no variants
- If loop directory not found for rank: log error, advance rank, skip
- Max 1 skill_review item per loop per week (idempotency via Setting key)
- requiresApproval=true is hardcoded — no code path bypasses it
