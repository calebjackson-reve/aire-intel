import { readFileSync } from "fs";
import { join } from "path";

/**
 * Font buffers for Satori (needs TTF/OTF/WOFF — NOT woff2).
 *
 * HERO is meant to be Batusa (locked brand display face) — but Batusa is not yet
 * in the repo (see src/assets/fonts/README.md, Risk #1). Until it's added, hero
 * falls back to Hauora-SemiBold so the pipeline works end-to-end. Drop
 * Batusa-Regular.ttf into src/assets/fonts/ and point HERO_FILE at it.
 */
const FONT_DIR = join(process.cwd(), "src/assets/fonts");

function load(file: string): Buffer {
  return readFileSync(join(FONT_DIR, file));
}

const hauora = load("Hauora-SemiBold.ttf");

// When Batusa arrives: const batusa = load("Batusa-Regular.ttf");
const HERO_BUFFER = hauora; // TODO: replace with Batusa when licensed file is added

export const SATORI_FONTS = [
  { name: "Hero", data: HERO_BUFFER, weight: 400 as const, style: "normal" as const },
  { name: "Hauora", data: hauora, weight: 600 as const, style: "normal" as const },
];

export const HERO_FONT = "Hero";
export const BODY_FONT = "Hauora";
