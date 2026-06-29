// Shotstack adapter — the first concrete RenderProvider.
//
// Sandbox ("stage") renders are free + watermarked; production ("v1") renders are
// billed + clean. The key + host switch on `opts.production`. Verified working
// against the stage endpoint 2026-06-23 (test render 3e3e81c9 returned a clean MP4).

import type {
  RenderProvider,
  RenderSubmission,
  RenderStatus,
  RenderState,
} from "./types";

// ── Shotstack timeline types (faithful subset of the Edit API) ────────────────
// The recipe→timeline bridge builds these; everything we actually use is typed.

export type ShotstackTransition =
  | "fade"
  | "wipeLeft"
  | "wipeRight"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "carouselLeft"
  | "carouselRight"
  | "zoom"
  | "reveal";

export interface ShotstackVideoAsset {
  type: "video";
  src: string;
  trim?: number; // seconds into the source to start
  volume?: number; // 0..1
}

export interface ShotstackTitleAsset {
  type: "title";
  text: string;
  style?: string; // e.g. "future", "minimal", "blockbuster"
  color?: string;
  size?: "xx-small" | "x-small" | "small" | "medium" | "large" | "x-large" | "xx-large";
  background?: string;
  position?:
    | "top" | "topLeft" | "topRight"
    | "center" | "left" | "right"
    | "bottom" | "bottomLeft" | "bottomRight";
}

export interface ShotstackImageAsset {
  type: "image";
  src: string;
}

export type ShotstackAsset = ShotstackVideoAsset | ShotstackTitleAsset | ShotstackImageAsset;

export interface ShotstackClip {
  asset: ShotstackAsset;
  start: number; // seconds on the timeline
  length: number; // seconds
  transition?: { in?: ShotstackTransition; out?: ShotstackTransition };
  /** Visual effect, e.g. "zoomIn", "slideLeft" — used for ken-burns motion. */
  effect?: string;
  /** Per-clip filter, e.g. "boost", "contrast", "muted" — our grade proxy. */
  filter?: string;
  opacity?: number;
  scale?: number;
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackSoundtrack {
  src: string;
  effect?: "fadeIn" | "fadeOut" | "fadeInFadeOut";
  volume?: number;
}

export interface ShotstackTimeline {
  soundtrack?: ShotstackSoundtrack;
  background?: string; // hex
  tracks: ShotstackTrack[];
}

export interface ShotstackOutput {
  format: "mp4" | "gif" | "jpg" | "png";
  resolution?: "preview" | "mobile" | "sd" | "hd" | "1080";
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5";
  fps?: number;
}

export interface ShotstackEdit {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
  /** Optional callback URL → our /api/webhooks/render-complete. */
  callback?: string;
}

// ── Host + status mapping ─────────────────────────────────────────────────────

const STAGE_HOST = process.env.SHOTSTACK_STAGE_HOST ?? "https://api.shotstack.io/stage";
const PROD_HOST = process.env.SHOTSTACK_PROD_HOST ?? "https://api.shotstack.io/v1";

function hostFor(production: boolean): string {
  return production ? PROD_HOST : STAGE_HOST;
}

function keyFor(production: boolean): string {
  if (production) {
    return (
      process.env.SHOTSTACK_PRODUCTION_KEY ??
      process.env.SHOTSTACK_API_KEY ??
      ""
    );
  }
  return process.env.SHOTSTACK_API_KEY ?? "";
}

/** Shotstack status string → our normalized RenderState. */
function mapState(s: string): RenderState {
  switch (s) {
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "queued":
    case "fetching":
      return "queued";
    default:
      // "rendering", "saving", anything else in-flight
      return "rendering";
  }
}

export const shotstackProvider: RenderProvider = {
  id: "shotstack",

  configured() {
    return Boolean(process.env.SHOTSTACK_API_KEY || process.env.SHOTSTACK_PRODUCTION_KEY);
  },

  async submit(timeline, opts): Promise<RenderSubmission> {
    const production = Boolean(opts?.production);
    const key = keyFor(production);
    if (!key) throw new Error("Shotstack key not configured for this environment");

    const res = await fetch(`${hostFor(production)}/render`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(timeline),
    });

    const json = (await res.json()) as {
      success?: boolean;
      message?: string;
      response?: { id?: string };
      errors?: { detail?: string }[];
    };

    if (!res.ok || !json.success || !json.response?.id) {
      const detail =
        json.errors?.map((e) => e.detail).join("; ") || json.message || `HTTP ${res.status}`;
      throw new Error(`Shotstack submit failed: ${detail}`);
    }

    return { renderId: json.response.id, provider: "shotstack" };
  },

  async poll(renderId, opts): Promise<RenderStatus> {
    const production = Boolean(opts?.production);
    const key = keyFor(production);
    if (!key) throw new Error("Shotstack key not configured for this environment");

    const res = await fetch(`${hostFor(production)}/render/${renderId}`, {
      headers: { "x-api-key": key },
    });

    const json = (await res.json()) as {
      success?: boolean;
      response?: { status?: string; url?: string; error?: string; billable?: number };
    };

    if (!res.ok || !json.response?.status) {
      throw new Error(`Shotstack poll failed: HTTP ${res.status}`);
    }

    const r = json.response;
    return {
      state: mapState(r.status!),
      url: r.url,
      error: r.error || undefined,
      durationSec: r.billable,
    };
  },
};
