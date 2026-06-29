// EditRecipe — the portable contract describing HOW a reference video was edited.
//
// Mirror of teardown-studio/src/shared/recipe.ts (the Python teardown engine emits
// this JSON). AIRE consumes it in the recipe→timeline bridge. Keep in sync; this is
// the seam between the teardown engine and the render pipeline.

export type TransitionType = "hard" | "dissolve" | "whip" | "zoom" | "fade";

export interface SourceInfo {
  path: string;
  duration: number; // seconds
  fps: number;
  width: number;
  height: number;
  aspect: string; // e.g. "9:16"
}

export interface Segment {
  index: number;
  start: number; // seconds
  end: number; // seconds
  durationFrames: number;
}

export interface Cut {
  atFrame: number;
  atTime: number; // seconds
  type: TransitionType;
  confidence: number; // 0..1
}

export interface Rhythm {
  tempoBPM: number;
  beatGrid: number[]; // beat timestamps in seconds
  cutsOnBeat: boolean;
  cutsOnBeatRatio: number; // 0..1
  avgShotLen: number; // seconds
}

export interface TextWindow {
  start: number;
  end: number;
  bbox: [number, number, number, number]; // x, y, w, h normalized 0..1
  sampleText: string;
  style: { color?: string; sizeRel?: number; position?: string };
}

export interface SpeechWord {
  word: string;
  start: number;
  end: number;
}

export interface Grade {
  contrast: number;
  saturation: number;
  temperature: number; // negative = cool, positive = warm
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  lutEstimate?: string;
}

export interface SegmentMotion {
  segmentIndex: number;
  pan: number;
  zoom: number;
  shake: number;
  speedRamp: boolean;
}

export interface EditedVerdict {
  verdict: "edited" | "raw" | "uncertain";
  confidence: number;
  signals: { name: string; value: number; weight: number; note: string }[];
}

export interface EditRecipe {
  version: string;
  createdAt: string;
  source: SourceInfo;
  segments: Segment[];
  cuts: Cut[];
  rhythm: Rhythm;
  text: TextWindow[];
  speech?: SpeechWord[];
  grade: Grade;
  motion: SegmentMotion[];
  isEdited: EditedVerdict;
}

// ── Reel command input ────────────────────────────────────────────────────────

/** One piece of Caleb's raw footage, already uploaded to a public URL. */
export interface ClipInput {
  url: string;
  /** Seconds into this clip to start from (default 0). */
  trim?: number;
  /** Source duration if known — lets the bridge avoid over-trimming. */
  durationSec?: number;
}

/** Brand styling applied to every reel (Rêve defaults live in REEL-STYLE.md). */
export interface BrandStyle {
  primaryColor: string; // hex, e.g. "#EFDD84"
  titleStyle: string; // Shotstack title style, e.g. "future"
  titlePosition: string;
}

/** Everything the /reel command needs to render one branded reel. */
export interface ReelInput {
  footage: ClipInput[];
  /** A torn-down reference recipe to copy the cut rhythm from. */
  recipe?: EditRecipe;
  /** Plain-English vibe when no recipe is supplied (synthesize defaults). */
  vibe?: string;
  /** Opening hook text overlaid in the first ~1s. */
  hookText?: string;
  /** Public URL of the music track to lay under the cuts. */
  musicUrl?: string;
  brand?: Partial<BrandStyle>;
  /** Render against the billed, watermark-free endpoint. */
  production?: boolean;
}

export const REVE_BRAND: BrandStyle = {
  primaryColor: "#EFDD84", // --reve-cream
  titleStyle: "future",
  titlePosition: "bottomLeft",
};
