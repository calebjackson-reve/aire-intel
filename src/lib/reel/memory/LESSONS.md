# Reel Loop — LESSONS

READ FIRST every render. Learned rules that shape the recipe→timeline translation.
Each lesson carries a confidence tier: HIGH (act silently) · MED (act + flag) · LOW (escalate).
Lessons are promoted/demoted by real approvals in LEDGER.md. Seeds below come from the
teardown-studio grammar study (Kelsie, Four Horsemen) + Caleb's morningside.studio restraint.

## Aesthetic north star
- **Target:** hybrid leaning cinematic-restrained. Cinematic grade + beat-sync energy from
  the agency lane, dialed to morningside.studio restraint; hyperlocal text hooks + story
  captions from the agent lane. Listings minority, audience-building majority.

## Pacing (MED → promotes with approvals)
- Hook lands in the **first ~1s** — text hook OR a cinematic cold-open hero shot. Never a slow intro.
- Default avg shot length **1.4–2.2s** when the recipe doesn't specify; faster reads as agency-lane,
  slower as editorial. Lean slower (restraint) until approvals say otherwise.
- Cut **on the beat** when a music track + beat grid are present (cutsOnBeat).

## Grade (HIGH)
- One cohesive grade on everything → instant recognition. Never mix warm + cool across one reel.
- Restraint over saturation: gentle contrast lift, slightly warm, never crushed. (`filter: "contrast"`
  as the safe default; avoid `boost` unless the reference is explicitly punchy.)

## Transitions (MED)
- Hard cuts are the spine. Reserve whip/zoom for beat hits, max ~1 per 4 cuts.
- Map recipe transitions: hard→(none), dissolve→fade, whip→slide, zoom→zoom, fade→fade.

## Text / hooks (MED)
- Hook overlay uses brand cream (#EFDD84), bottom-left, `future` style. One idea, ≤6 words.
- Keep on-screen text windows from the recipe but rewrite copy to Caleb's voice + hyperlocal.

## Music (LOW → escalate when missing)
- If no `musicUrl` is supplied, escalate — never ship a silent reel or guess a track.

## Ignore-list (cost — skip these inputs)
- Footage clips < 0.5s (too short to read as a shot).
- Recipe text windows with empty sampleText AND no provided hookText.
