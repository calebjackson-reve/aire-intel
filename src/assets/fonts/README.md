# Render fonts (Satori)

Satori needs **TTF/OTF/WOFF** (not WOFF2) font buffers.

## Present
- `Hauora-SemiBold.ttf` — body / eyebrow / meta text on rendered assets.

## MISSING — brand blocker (Risk #1)
- **Batusa** (display, 400 weight only) is the locked brand HERO font for rendered
  social assets, per `src/lib/reve-system-prompt.ts`. It is **not in the repo**.
  Until the licensed `Batusa-Regular.ttf` (or `.otf`) is dropped here, the render
  engine falls back to Hauora-SemiBold for hero text — assets will NOT be fully
  on-brand. Add the file here and update `HERO_FONT` in `src/lib/render/fonts.ts`.

## TODO (optional polish)
- Convert the other Hauora weights (currently `.woff2` in `public/fonts/`) to TTF
  for richer weight range in rendered assets.

> Note: `public/fonts/*.woff2` are for the browser UI (Fraunces is the product-UI
> display font); these TTFs are only for server-side Satori rendering.
