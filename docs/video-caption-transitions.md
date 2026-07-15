# Video Edit Plan — Kinetic Captions (Intro) + Slow-Close Outro

Brief for the editing app. This document defines the look, the timeline, the spec format,
and — critically — the **release gate**: what an acceptable output is. The app must not
release a render until every gate check passes.

Reference material (session uploads):
- `CalebSample3.mov` — Caleb's raw listing footage. 720×1280 (9:16), HEVC, 23.976 fps, 18.9s.
- `ScreenRecording_07152026.mp4` — Instagram reel (four.horsemen.media × masonealyssa)
  demonstrating the target caption look.

---

## 1. The look, deconstructed (from the reference reel)

The reference caption style is **kinetic mixed-typography**, not subtitle bars:

1. **Two-voice type pairing per phrase.** A flowing lowercase *script* face for connective
   words ("everyone", "and", "to the") layered with a heavy lowercase *sans* for the
   payoff word ("keeps", "here's", "answer."). The contrast IS the style.
2. **Scene-sampled color fills.** Word colors are pulled from the frame behind them —
   magenta from a mural, green matching painted grass, teal echoing the sky. One word per
   phrase gets a color; the rest stay white/cream. Never more than 2 accent colors on
   screen at once.
3. **Speech-synced word pops.** Words appear on their spoken onset (per word or 2–3 word
   cluster), with a fast scale-in (~0.92→1.0) + opacity ease over ~150–250ms. Nothing
   crawls; nothing lingers past its phrase.
4. **Depth via occlusion.** At least one phrase renders *behind* the subject (masked by a
   person/tree segmentation matte) so the text feels placed in the scene, not stamped on it.
5. **One "special" treatment max.** The reference uses a neon-outline scribble on a single
   word ("loop"). Exactly one such flourish per video — more reads as Canva energy.
6. **Insert cards.** Small UI-style cutaway cards (a map card, a photo card) pop in above
   the subject's head for locations/facts, with a soft drop shadow and rounded corners.
   Optional for us, but the pattern is approved.
7. **Text lives in the upper ⅔.** Captions cluster around chest-to-forehead height, never
   over the platform UI zones (bottom ~250px and top ~140px at 1080×1920).

## 2. Applying it to Caleb's footage

Shot table for `CalebSample3.mov` (scene-detected):

| Shot | Time | Content |
|---|---|---|
| A | 0.0–3.1s | Caleb walking down driveway toward camera, yellow-green ball, oak canopy |
| B | 3.1–4.7s | Same action, closer |
| C | 4.7–6.5s | Closest — ball at chest, direct address |
| D | 6.5–14.8s | House exterior wide (wave), then kitchen interior |
| E | 14.8–17.4s | Kitchen → transition |
| F | 17.4–18.9s | Drone aerial, pulling up and away |

### Intro captions (Shots A–C, 0–6.5s)

- Hook copy runs word-synced across the walk-up. Script face for connectors, heavy sans
  for keywords, exactly per §1.
- **Color mapping:** use Rêve brand tokens as the "scene-sampled" palette — they already
  match this footage: `--reve-cream #EFDD84` (picks up the ball), `--reve-coral #EE8172`
  (picks up the brick), white `#F5F4F2` for everything else. `--reve-blue #728AC5` only if
  sky is in frame. Never introduce colors outside the brand tokens.
- One occlusion moment: a keyword slides behind Caleb during Shot B (person matte).
- The single allowed flourish (outline/neon treatment) goes on the hook's payoff word in
  Shot C, nowhere else.
- Captions clear entirely by the cut into Shot D — the house tour breathes without text
  (or with at most small insert cards for beds/baths/sqft).

### Outro (Shot F → end card)

The ask: *close it out slowly and fade to a black sky, then an all-black screen with the
name, then the address info.*

1. **Slow the close.** Retime Shot F (the aerial pull-away) to ~50–60% speed with
   optical-flow interpolation, extending it from ~1.5s to ~2.5–3s. Audio ducks −12dB
   over the same window.
2. **Fade to black sky.** A 1.5–2.0s luminance fade that darkens sky-first (top-weighted
   gradient fade), so the sky "goes to night" before the ground disappears. No hard cut
   to black — ease-in-out.
3. **Name card (black screen).** Hold pure black `#09090B` ≥0.5s, then fade in:
   - Line 1: **Caleb Jackson** — hero face (Batusa when licensed; Hauora-SemiBold fallback),
     white `#F5F4F2`.
   - Line 2: *Rêve Realtors®* — smaller, cream or coral accent, tracked out.
4. **Address info.** ~1.0s after the name, fade in below it: street address, city/state,
   and price or "Just Listed" tag — one accent color max. Hold the completed card ≥2.5s
   before the video ends so it survives loop-cutoff on IG.
5. Total outro (slowdown start → last frame): 6–8s. End on the full card, not on black.

## 3. Spec format for the editing app

Extend `PostSpec.motionSpec` (`src/lib/render/types.ts`) with a video timeline spec:

```ts
interface VideoEditSpec {
  source: string;                    // input video
  output: { width: 1080; height: 1920; fps: number };  // upscale 720p → 1080p
  captions: CaptionEvent[];
  outro: OutroSpec;
}

interface CaptionEvent {
  text: string;
  role: "script" | "keyword";       // picks typeface
  inMs: number;                     // onset — must sync to VO/beat within ±80ms
  outMs: number;
  color: "white" | "cream" | "coral" | "blue";   // brand tokens ONLY
  anchor: { xPct: number; yPct: number };        // upper-2/3 only (yPct 12–66)
  occlude?: boolean;                // render behind subject matte
  flourish?: "outline-neon";        // max ONE event in the whole spec may set this
  pop: { scaleFrom: number; durMs: number };     // default { 0.92, 200 }
}

interface OutroSpec {
  slowdown: { startMs: number; rate: number };       // 0.5–0.6
  fadeToBlack: { startMs: number; durMs: number; skyFirst: true };
  nameCard: { name: string; brokerage: string; holdMs: number };
  addressCard: { address: string; cityState: string; tag?: string; delayMs: number };
  minEndHoldMs: 2500;
}
```

The generator (create-post Claude call) emits this spec; the renderer executes it; the QC
step below validates the render against the same spec.

## 4. Release gate — what "acceptable" means

**The app must run this checklist against the rendered file and refuse to release
(publish, post, or hand to the user as "done") until every item passes.** Verification is
mechanical where possible: extract frames at every caption `inMs`, `outMs`, and card
onset, then check:

### Hard fails (any one blocks release)
- [ ] **Spelling/content:** every caption string matches the approved copy exactly —
      including the property address and "Caleb Jackson" / "Rêve Realtors®" (with the
      circumflex ê and ®). An address typo is a dead post.
- [ ] **Sync:** each caption onset within ±80ms of its spoken word / beat marker.
- [ ] **Brand colors only:** sampled text pixels match brand tokens (ΔE < 5 against
      #F5F4F2 / #EFDD84 / #EE8172 / #728AC5). No off-palette colors.
- [ ] **Safe zones:** no text within top 140px or bottom 250px (at 1080×1920), nor within
      60px of left/right edges.
- [ ] **Legibility:** contrast ratio ≥ 3:1 between text and the actual background region
      at every onset frame (measure, don't assume). If a frame fails, the fix is moving
      the anchor or adding a ≤20% scrim — not shrinking the text below 42px cap-height.
- [ ] **Occlusion integrity:** on masked phrases, the matte doesn't clip Caleb's face or
      produce halo artifacts at any sampled frame.
- [ ] **Outro structure:** fade completes to true black (max pixel value ≤ #0A0A0C
      full-frame) before the name card fades in; name precedes address; final card holds
      ≥2.5s; video does not end on empty black.
- [ ] **Duration & format:** 9:16, 1080×1920, source fps preserved, H.264 + AAC, total
      runtime 20–30s, no watermark, no frozen/duplicated frames at splice points
      (check the retime boundary specifically).
- [ ] **Audio:** music/VO ducks through the fade; ends at silence by the name card or
      resolves musically — no hard audio cut mid-note. Loudness ≤ −14 LUFS integrated.

### Soft fails (fix if possible; flag to Caleb if not)
- [ ] ≤ 4 words visible at any instant; ≤ 2 accent colors on screen at once.
- [ ] Exactly one flourish treatment in the whole video.
- [ ] Captions fully clear during the house-tour shots (D–E) unless an insert card is
      specified.
- [ ] The slowdown is imperceptible as an effect (no visible optical-flow warping on the
      rooflines — sample 3 frames inside the retimed span).

### Process rule
Render → self-QC (frame extraction + checks above) → **only then** surface the file.
If any hard fail occurs after 2 repair attempts, stop and show Caleb the failing frames
with the specific failed check — never release a "close enough" cut silently.

## 5. Dependencies / open items

1. **Script typeface** — the repo has only Hauora (Batusa pending, see
   `src/lib/render/fonts.ts`). The kinetic look needs a licensed script face (e.g. in the
   Sloop/Shelby/Adelicia genre). Until added, the script role falls back to Hauora italic
   — acceptable for drafts, a soft-fail for release.
2. **Person segmentation matte** for occlusion (rembg/MediaPipe class of tool) — needed
   for the behind-subject phrases; degrade gracefully to non-occluded placement if the
   matte confidence is low.
3. **Word-level timing** — requires VO transcript timestamps (whisper word timings) or,
   for music-only cuts, beat markers.
4. Source is 720×1280 — upscale to 1080×1920 before compositing text so type renders at
   full resolution rather than being scaled with the footage.
