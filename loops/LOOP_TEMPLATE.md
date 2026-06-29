# Loop Spec Template

Copy this file to `loops/proposed/NN-<slug>.md` and fill in every section.
The `Approved` checkbox MUST remain unchecked until a human reviews and approves the spec.

---

# Loop: [Name]

**Status:** [ ] Approved  
**Type:** inner | outer  
**Feeds (if outer):** [which inner loop slug, or n/a]  
**Rank:** NN  
**Score:** NN / 30

---

## Trigger

What event or schedule starts this loop?  
_(cron schedule, webhook, DB state change, AgentRun completion, etc.)_

## Input

What data does this loop read?  
_(Prisma models, API calls, file reads — be specific about fields and filters)_

## Actions

What does this loop DO?  
_(ordered steps; keep to one primary output per loop)_

## Oracle

**What external source of truth grades the output?**  
_(tests passing, revenue recorded, reply logged in ContactLog, error count drops, etc.)_  
_(⚠ "model reviews its own output" does NOT count)_

**Acceptance threshold:**  
_(e.g. "reply rate ≥ 12%", "0 new errors of this type in 24h", "CI green")_

**Rejection signal:**  
_(what causes this loop to halt, rollback, or escalate?)_

## Quality Gate

**Output type:** post | reel_hook | carousel_slide | caption | n/a  
**Score threshold:** ≥ NN / 100 (Setting: `content.gate.{type}.minScore`)  
**Max retries:** N (Setting: `content.gate.maxAttempts`)  
**Escalation prompt:** _what gets injected on retry — specific to failed flags_  
**Gate behavior:** surface_best_after_max _(never surface_always)_  
**Verifier:** scorePost() / scoreReelHook() / scoreCarouselSlide() — must NOT be the generating model  

_For non-content loops:_ **Output type:** n/a — oracle is external data, not AI-generated text

## Memory

How does this loop persist state between runs?  
_(Prisma model + fields, Setting key, file, external store)_

## Surface

Where does output appear to the human?  
_(Dashboard notification, DailyBrief section, SMS, ActionQueue item, Slack, etc.)_

---

## Safety Rails

- **Human chokepoint:** [where does a human approve, review, or react — or justify why none needed]
- **Blast radius:** [what breaks if this loop misbehaves]
- **Rate limit / cap:** [max actions per run, per day]
- **Idempotency:** [how does it avoid double-execution]
- **Exit condition:** [when does this loop permanently stop or deactivate]

---

## Implementation Notes

_File paths to modify, new routes needed, env vars required._
