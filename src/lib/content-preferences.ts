import { prisma } from "./prisma";

// Minimum sample size (approvals + rejections) before a learned pattern is
// trusted enough to bias generation. Below this, the signal is noise.
const MIN_SAMPLE_SIZE = 2;

// Human-readable labels for each patternType the feedback loop records.
const PATTERN_LABELS: Record<string, string> = {
  hook_style: "Hooks",
  post_type: "Post type",
  hashtag_count: "Hashtags",
  cta_format: "CTA format",
  caption_length: "Caption length",
};

// Order patterns appear in the guidance block.
const PATTERN_ORDER = ["hook_style", "hashtag_count", "cta_format", "caption_length", "post_type"];

/**
 * Reads the learned ContentPreference data and returns a concise natural-language
 * guidance block to inject into the post-generation system/user prompt.
 *
 * For each patternType it surfaces the value with the highest approvalRate that
 * has a meaningful sample size (approvals + rejections >= MIN_SAMPLE_SIZE).
 *
 * Returns "" when there isn't enough signal yet, or on any error — generation
 * must never fail because preferences couldn't load.
 */
export async function getLearnedStyleGuidance(): Promise<string> {
  try {
    const prefs = await prisma.contentPreference.findMany();
    if (!prefs.length) return "";

    // Group by patternType, keep only rows with enough samples, pick the winner.
    const byType = new Map<string, typeof prefs>();
    for (const p of prefs) {
      if (p.approvals + p.rejections < MIN_SAMPLE_SIZE) continue;
      const list = byType.get(p.patternType) ?? [];
      list.push(p);
      byType.set(p.patternType, list);
    }

    const lines: string[] = [];
    for (const patternType of PATTERN_ORDER) {
      const candidates = byType.get(patternType);
      if (!candidates || !candidates.length) continue;
      // Highest approval rate wins; break ties by larger sample size.
      const best = candidates.reduce((a, b) => {
        if (b.approvalRate !== a.approvalRate) return b.approvalRate > a.approvalRate ? b : a;
        return (b.approvals + b.rejections) > (a.approvals + a.rejections) ? b : a;
      });
      // Only bias toward patterns Caleb actually likes (net-positive).
      if (best.approvalRate <= 0.5) continue;
      const label = PATTERN_LABELS[patternType] ?? patternType;
      const pct = Math.round(best.approvalRate * 100);
      lines.push(`- ${label}: prefer ${best.value} (${pct}% approval)`);
    }

    if (!lines.length) return "";

    return "LEARNED PREFERENCES (from Caleb's past approvals — favor these):\n" + lines.join("\n");
  } catch {
    return "";
  }
}

// Hyper-local hashtag guidance injected into post generation prompts.
// Platform-aware: IG gets the full 5-8 tag block. FB/LinkedIn get a minimal note.
// Zachary (6%), Clinton (3.4%), Central (3.3%) are underserved geo clusters.
// IG hashtags also index in Google AI Overviews — dual distribution benefit.
export function getLocalHashtagGuidance(platform = "instagram"): string {
  if (platform === "facebook") {
    return [
      "FACEBOOK HASHTAG RULE:",
      "- Use 0-2 hashtags MAX (FB algorithm penalizes stacking).",
      "- If any tag is used, make it #ReveRealtors for brand, nothing else unless geo-specific.",
    ].join("\n");
  }
  if (platform === "linkedin") {
    return [
      "LINKEDIN HASHTAG RULE:",
      "- Use 1-3 professional hashtags only: #BatonRouge #LouisianaRealEstate #ReveRealtors",
      "- Never mirror the IG hashtag block on LinkedIn.",
    ].join("\n");
  }
  return [
    "HYPER-LOCAL HASHTAG STRATEGY — INSTAGRAM (SEO + reach):",
    "- Include 1-2 hyper-local tags from: #ZacharyLA #ZacharyRealEstate #ZacharyHomes",
    "- For East/West Feliciana content: #ClintonLA #FelicianaParish #StFrancisville",
    "- For Central/Baker area: #CentralLA #CentralLARealEstate",
    "- Always include: #ReveRealtors (brand amplification)",
    "- Caption hashtags index in Google AI Overviews — hyper-local = dual distribution",
    "- Total hashtag count: 5-8 (quality gate enforced — do not exceed 8)",
  ].join("\n");
}
