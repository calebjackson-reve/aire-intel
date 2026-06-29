// Recipe → Shotstack timeline bridge.
//
// Takes a torn-down EditRecipe (the reference's cut rhythm, transitions, grade, text
// windows) + Caleb's raw footage + a ResolvedStyle (what the learning loop decided),
// and produces a Shotstack edit that REPRODUCES the reference's edit with Caleb's clips.
// "Copy the cuts, change the song, make it his own."
//
// This module is mechanical: it expresses decisions, it doesn't make them. The learning
// loop (learning.ts) owns the choices + confidence; here we just build faithful JSON.

import type {
  EditRecipe,
  ClipInput,
  BrandStyle,
  TransitionType,
  Segment,
} from "./recipe";
import type {
  ShotstackEdit,
  ShotstackClip,
  ShotstackTransition,
  ShotstackTitleAsset,
} from "../render/providers/shotstack";

/** What the learning loop resolves and hands to the bridge. */
export interface ResolvedStyle {
  /** Fallback avg shot length (seconds) when the recipe has no segments. */
  avgShotLen: number;
  /** Snap segment boundaries to the recipe's beat grid when present. */
  snapToBeat: boolean;
  /** recipe transition type → Shotstack transition (or "none" for a hard cut). */
  transitionMap: Record<TransitionType, ShotstackTransition | "none">;
  /** Shotstack per-clip filter standing in for the reference's color grade. */
  gradeFilter: string;
  /** Max accent transitions (whip/zoom) per 4 cuts; extras downgrade to hard. */
  maxAccentTransitions: number;
  brand: BrandStyle;
}

export interface BridgeInput {
  recipe: EditRecipe;
  footage: ClipInput[];
  style: ResolvedStyle;
  hookText?: string;
  musicUrl?: string;
}

const ACCENT: ReadonlySet<ShotstackTransition> = new Set(["zoom", "slideLeft", "slideRight"]);
const MIN_SHOT = 0.5; // ignore-list: shots under 0.5s don't read

/** Snap a timestamp to the nearest beat within tolerance, else return it unchanged. */
function snap(t: number, beats: number[], tolerance = 0.15): number {
  let best = t;
  let bestDist = tolerance;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

/**
 * Build the shot plan: an ordered list of {durationSec, transitionIn} derived from the
 * recipe's segments (preferred) or synthesized from avgShotLen across the source duration.
 */
function planShots(
  recipe: EditRecipe,
  style: ResolvedStyle
): { durationSec: number; transitionIn: TransitionType }[] {
  const beats = style.snapToBeat ? recipe.rhythm?.beatGrid ?? [] : [];

  let segments: Segment[] = recipe.segments ?? [];
  if (segments.length === 0) {
    // No segments torn down — synthesize an even grid at avgShotLen over the source.
    const total = recipe.source?.duration ?? style.avgShotLen * 6;
    const len = recipe.rhythm?.avgShotLen || style.avgShotLen;
    const n = Math.max(2, Math.round(total / len));
    segments = Array.from({ length: n }, (_, i) => ({
      index: i,
      start: i * len,
      end: (i + 1) * len,
      durationFrames: 0,
    }));
  }

  // Transition for a segment = the cut type at/just before its start.
  const cutTypeAt = (t: number): TransitionType => {
    const cut = recipe.cuts?.find((c) => Math.abs(c.atTime - t) < 0.25);
    return cut?.type ?? "hard";
  };

  return segments.map((seg) => {
    const start = beats.length ? snap(seg.start, beats) : seg.start;
    const end = beats.length ? snap(seg.end, beats) : seg.end;
    const durationSec = Math.max(MIN_SHOT, end - start);
    return { durationSec, transitionIn: cutTypeAt(seg.start) };
  });
}

/** Map a recipe transition to a Shotstack one, throttling accent transitions. */
function resolveTransition(
  type: TransitionType,
  style: ResolvedStyle,
  accentBudget: { used: number; window: number }
): ShotstackTransition | undefined {
  const mapped = style.transitionMap[type];
  if (!mapped || mapped === "none") return undefined;

  if (ACCENT.has(mapped)) {
    // Throttle: max N accents per 4 cuts → otherwise downgrade to a hard cut.
    if (accentBudget.used >= style.maxAccentTransitions) return undefined;
    accentBudget.used += 1;
  }
  return mapped;
}

/** Title clips: hook in the first window (brand styled), recipe text in the rest. */
function buildTitleClips(input: BridgeInput): ShotstackClip[] {
  const { recipe, hookText, style } = input;
  const windows = recipe.text ?? [];
  const clips: ShotstackClip[] = [];

  // Always guarantee a hook in the first ~1s if hookText is supplied.
  if (hookText) {
    const first = windows[0];
    const asset: ShotstackTitleAsset = {
      type: "title",
      text: hookText,
      style: style.brand.titleStyle,
      color: style.brand.primaryColor,
      size: "medium",
      background: "none",
      position: (first?.style.position as ShotstackTitleAsset["position"]) ?? (style.brand.titlePosition as ShotstackTitleAsset["position"]),
    };
    clips.push({
      asset,
      start: first?.start ?? 0,
      length: Math.max(1, (first ? first.end - first.start : 1.2)),
      transition: { in: "fade", out: "fade" },
    });
  }

  // Remaining recipe text windows (skip the first if we already used it; skip empties).
  windows.slice(hookText ? 1 : 0).forEach((w) => {
    if (!w.sampleText?.trim()) return; // ignore-list: empty text windows
    const asset: ShotstackTitleAsset = {
      type: "title",
      text: w.sampleText,
      style: style.brand.titleStyle,
      color: w.style.color ?? style.brand.primaryColor,
      size: "small",
      background: "none",
      position: (w.style.position as ShotstackTitleAsset["position"]) ?? "center",
    };
    clips.push({
      asset,
      start: w.start,
      length: Math.max(0.8, w.end - w.start),
      transition: { in: "fade", out: "fade" },
    });
  });

  return clips;
}

/**
 * Translate a recipe + footage + resolved style into a Shotstack edit.
 * The video track reproduces the reference's shot rhythm using Caleb's clips
 * (cycled if there are fewer clips than shots); a title track carries the hook +
 * on-screen text; the soundtrack is Caleb's chosen track.
 */
export function recipeToTimeline(input: BridgeInput): ShotstackEdit {
  const { recipe, footage, style, musicUrl } = input;
  if (footage.length === 0) throw new Error("recipeToTimeline: no footage clips supplied");

  const shots = planShots(recipe, style);
  const accentBudget = { used: 0, window: 0 };

  const videoClips: ShotstackClip[] = [];
  let cursor = 0;

  shots.forEach((shot, i) => {
    // Reset accent budget every 4 cuts.
    if (i > 0 && i % 4 === 0) accentBudget.used = 0;

    const clip = footage[i % footage.length];
    const available = clip.durationSec != null
      ? Math.max(MIN_SHOT, clip.durationSec - (clip.trim ?? 0))
      : shot.durationSec;
    const length = Math.min(shot.durationSec, available);

    const transitionIn = resolveTransition(shot.transitionIn, style, accentBudget);

    // Motion: borrow the reference segment's zoom intent for a subtle ken-burns push.
    const motion = recipe.motion?.[i];
    const effect = motion && motion.zoom > 0.02 ? "zoomIn" : undefined;

    videoClips.push({
      asset: { type: "video", src: clip.url, trim: clip.trim ?? 0, volume: 0 },
      start: Number(cursor.toFixed(3)),
      length: Number(length.toFixed(3)),
      ...(transitionIn ? { transition: { in: transitionIn } } : {}),
      ...(effect ? { effect } : {}),
      filter: style.gradeFilter,
    });
    cursor += length;
  });

  const tracks = [{ clips: videoClips }];
  const titleClips = buildTitleClips(input);
  if (titleClips.length) tracks.unshift({ clips: titleClips }); // title track on top

  return {
    timeline: {
      background: "#09090B",
      ...(musicUrl ? { soundtrack: { src: musicUrl, effect: "fadeOut" as const } } : {}),
      tracks,
    },
    output: { format: "mp4", resolution: "hd", aspectRatio: "9:16", fps: 30 },
  };
}

/** Total reel duration implied by a built edit (seconds). */
export function timelineDuration(edit: ShotstackEdit): number {
  const videoTrack = edit.timeline.tracks[edit.timeline.tracks.length - 1];
  return videoTrack.clips.reduce((max, c) => Math.max(max, c.start + c.length), 0);
}
