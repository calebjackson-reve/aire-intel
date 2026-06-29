# Reel Loop — REEL-STYLE (domain cache)

Cached resolved style mappings so the loop doesn't re-derive brand constants every run.
This is the "context = cost" cache from the Karpathy template. Updated when a brand
decision is confirmed by repeated approvals.

## Rêve brand constants
- primaryColor: `#EFDD84`  (--reve-cream — hook text)
- secondary: `#EE8172` (--reve-coral), `#728AC5` (--reve-blue)
- background: `#09090B` (--reve-black)
- titleStyle: `future`
- titlePosition: `bottomLeft`

## Output defaults
- format: mp4 · resolution: hd · aspectRatio: 9:16 · fps: 30

## Pacing defaults (when recipe omits)
- avgShotLen: 1.8s · hookWindow: 0–1.2s · maxAccentTransitions: 1 per 4 cuts

## Transition map (recipe → Shotstack)
| recipe type | shotstack |
|---|---|
| hard | (none) |
| dissolve | fade |
| whip | slideLeft |
| zoom | zoom |
| fade | fade |

## Grade map (recipe.grade → Shotstack filter)
- contrast > 0.15 → `contrast`
- saturation > 0.2 → `boost`
- otherwise → `contrast` (safe restraint default)
