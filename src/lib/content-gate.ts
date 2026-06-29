// Ras Amjad inner-loop gate: generate → score (separate verifier) → retry with
// failure context → surface best-of-N after maxAttempts.
// The promptFn is responsible for injecting escalation context on attempt > 1.

import { scorePost, scoreReelHook, scoreCarouselSlide, QualityResult, QualityFlag } from "./content-quality";
import { getSetting } from "./settings";
import { prisma } from "./prisma";

export interface GateOptions {
  outputType: "post" | "reel_hook" | "carousel_slide" | "caption";
  threshold?: number;
  maxAttempts?: number;
  platform?: string;
}

export interface GateResult {
  content: string;
  quality: QualityResult;
  attempts: number;
  passed: boolean;
}

const DEFAULT_THRESHOLDS: Record<string, number> = {
  post: 70,
  reel_hook: 80,
  carousel_slide: 70,
  caption: 70,
};

async function getThreshold(outputType: string, override?: number): Promise<number> {
  if (override !== undefined) return override;
  const settingKey = outputType === "reel_hook" ? "reel" : outputType === "carousel_slide" ? "carousel" : outputType;
  const val = await getSetting(`content.gate.${settingKey}.minScore`);
  return val ? parseInt(val, 10) : (DEFAULT_THRESHOLDS[outputType] ?? 70);
}

async function getMaxAttempts(override?: number): Promise<number> {
  if (override !== undefined) return override;
  const val = await getSetting("content.gate.maxAttempts");
  return val ? parseInt(val, 10) : 3;
}

function scoreContent(text: string, outputType: GateOptions["outputType"], bannedHashtags?: string[], platform?: string): QualityResult {
  switch (outputType) {
    case "reel_hook":      return scoreReelHook(text);
    case "carousel_slide": return scoreCarouselSlide(text, false);
    default:               return scorePost(text, undefined, bannedHashtags, platform);
  }
}

async function ensureDefaultSettings() {
  const defaults: Record<string, string> = {
    "content.gate.post.minScore":      "70",
    "content.gate.reel.minScore":      "80",
    "content.gate.carousel.minScore":  "70",
    "content.gate.maxAttempts":        "3",
  };
  await Promise.all(
    Object.entries(defaults).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } }).catch(() => null)
    )
  );
}

/**
 * Calls promptFn up to maxAttempts times until the scorer passes.
 * On failure, passes (attempt, lastScore, lastFlags) so the caller can
 * inject escalation context into the next prompt.
 * Returns the best-scoring result, with passed:false if threshold was never met.
 */
export async function generateUntilPasses(
  promptFn: (attempt: number, lastScore?: number, lastFlags?: QualityFlag[]) => Promise<string>,
  opts: GateOptions
): Promise<GateResult> {
  await ensureDefaultSettings();

  const threshold   = await getThreshold(opts.outputType, opts.threshold);
  const maxAttempts = await getMaxAttempts(opts.maxAttempts);

  // Load oracle-banned hashtags from Loop 32 (empty array if not yet populated)
  const bannedRaw = await getSetting("content.hashtags.remove");
  let bannedHashtags: string[] = [];
  try { if (bannedRaw) bannedHashtags = JSON.parse(bannedRaw); } catch { /* ignore */ }

  let best: GateResult | null = null;
  let prevFlagKey = "";
  let stalledRounds = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const content = await promptFn(attempt, best?.quality.score, best?.quality.flags);
    const quality = scoreContent(content, opts.outputType, bannedHashtags, opts.platform);
    const passed  = quality.score >= threshold;
    const result: GateResult = { content, quality, attempts: attempt, passed };

    if (!best || quality.score > best.quality.score) best = result;
    if (passed) return result;

    // Circuit breaker: same flag signature across attempts → model is stuck, stop early
    const flagKey = quality.flags.map(f => f.rule).sort().join(",");
    stalledRounds = (flagKey === prevFlagKey && attempt > 1) ? stalledRounds + 1 : 0;
    prevFlagKey = flagKey;

    if (stalledRounds >= 2 && attempt < maxAttempts) break;
  }

  return { ...best!, passed: false };
}
