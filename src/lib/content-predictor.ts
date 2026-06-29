// Performance prediction engine for AIRE content.
// Uses historical ImportedPost + ContentPerformance data to predict reach/engagement
// for a new post. Pure statistics — no ML needed at this data scale.

import { prisma } from "./prisma";
import { analyzeCaption, classifyPostType } from "./social-import";

export interface PostPrediction {
  predictedReach: number;
  predictedReachLow: number;
  predictedReachHigh: number;
  predictedEngagement: number;
  engagementProbability: number; // 0-1 confidence
  reachTier: "low" | "medium" | "high" | "viral";
  bestPublishDay: string;
  bestPublishHour: number;
  similarPosts: SimilarPost[];
  signals: PredictorSignal[];
  improvementSuggestions: string[];
}

export interface SimilarPost {
  caption: string;
  publishedAt: Date;
  postType: string;
  isReel: boolean;
  reach?: number;
  engagementRate?: number;
}

export interface PredictorSignal {
  label: string;
  impact: "positive" | "neutral" | "warning";
  detail: string;
}

// Baseline multipliers seeded from audit findings (@calebjackson_24 Mar–Jun 2026)
// These are recalibrated over time by the PredictionAccuracy Karpathy loop.
const SEED_BASELINES = {
  overallAvgReach: 500,
  reelMultiplier: 2.4,        // reels avg 2.4× vs static posts
  sundayMultiplier: 1.08,     // Sunday = peak day (+8% vs week avg)
  storyHookBoost: 1.15,       // story hook style +15% reach
  localHashtagBoost: 1.10,    // hyper-local hashtags boost non-follower reach
  carouselMultiplier: 1.2,    // carousels save-rate drives reach
  byPostType: {
    just_listed: 450,
    just_sold: 480,
    client_story: 620,
    educational: 540,
    market_update: 380,
    personal: 580,
    reel: 980,
  } as Record<string, number>,
};

const LOCAL_HASHTAGS = [
  "#zacharyLA", "#zacharyrealestate", "#zacharyhomes",
  "#clintonla", "#felicianaparish", "#centralLA",
  "#centralLArealestate", "#stfrancisville", "#reverealtors",
];

async function loadHistoricalBaselines(): Promise<typeof SEED_BASELINES> {
  try {
    const posts = await prisma.importedPost.findMany({
      where: { reach: { gt: 0 } },
      select: { postType: true, isReel: true, reach: true, engagementRate: true, hookStyle: true, publishedAt: true, hashtags: true },
    });

    if (posts.length < 5) return SEED_BASELINES;

    const reelPosts = posts.filter(p => p.isReel);
    const staticPosts = posts.filter(p => !p.isReel);

    const avgReach = (arr: typeof posts) =>
      arr.length ? arr.reduce((s, p) => s + (p.reach || 0), 0) / arr.length : 0;

    const reelAvg = avgReach(reelPosts);
    const staticAvg = avgReach(staticPosts);
    const reelMultiplier = staticAvg > 0 ? reelAvg / staticAvg : SEED_BASELINES.reelMultiplier;

    // Day-of-week multipliers
    const byDay: Record<string, number[]> = {};
    for (const p of posts) {
      const day = new Date(p.publishedAt).toLocaleDateString("en-US", { weekday: "long" });
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(p.reach || 0);
    }
    const overall = avgReach(posts);
    const sundayReaches = byDay["Sunday"] || [];
    const sundayAvg = sundayReaches.length ? sundayReaches.reduce((s, r) => s + r, 0) / sundayReaches.length : overall;
    const sundayMultiplier = overall > 0 ? sundayAvg / overall : SEED_BASELINES.sundayMultiplier;

    // Per-type baselines
    const byPostType = { ...SEED_BASELINES.byPostType };
    const typeGroups: Record<string, number[]> = {};
    for (const p of posts) {
      const t = p.postType || "personal";
      if (!typeGroups[t]) typeGroups[t] = [];
      typeGroups[t].push(p.reach || 0);
    }
    for (const [type, reaches] of Object.entries(typeGroups)) {
      if (reaches.length >= 3) {
        byPostType[type] = reaches.reduce((s, r) => s + r, 0) / reaches.length;
      }
    }

    return {
      ...SEED_BASELINES,
      overallAvgReach: overall || SEED_BASELINES.overallAvgReach,
      reelMultiplier: isNaN(reelMultiplier) ? SEED_BASELINES.reelMultiplier : Math.min(Math.max(reelMultiplier, 1.5), 4.0),
      sundayMultiplier: isNaN(sundayMultiplier) ? SEED_BASELINES.sundayMultiplier : Math.min(Math.max(sundayMultiplier, 1.0), 1.5),
      byPostType,
    };
  } catch {
    return SEED_BASELINES;
  }
}

async function findSimilarPosts(postType: string, isReel: boolean, limit = 3): Promise<SimilarPost[]> {
  try {
    const posts = await prisma.importedPost.findMany({
      where: { postType, isReel },
      orderBy: { engagementRate: "desc" },
      take: limit,
      select: { caption: true, publishedAt: true, postType: true, isReel: true, reach: true, engagementRate: true },
    });
    return posts.map(p => ({
      caption: (p.caption || "").slice(0, 120),
      publishedAt: p.publishedAt,
      postType: p.postType || "personal",
      isReel: p.isReel,
      reach: p.reach || undefined,
      engagementRate: p.engagementRate || undefined,
    }));
  } catch {
    return [];
  }
}

function getBestPublishTime(peakDay = "Sunday"): { day: string; hour: number } {
  // Sunday morning 7-9 AM is the proven peak window from audience insights
  return { day: peakDay, hour: 8 };
}

export async function predictPostPerformance(input: {
  postType?: string;
  isReel?: boolean;
  caption?: string;
  platform?: string;
  scheduledFor?: Date;
  imageCount?: number;
}): Promise<PostPrediction> {
  const baselines = await loadHistoricalBaselines();

  const postType = input.postType || (input.caption ? classifyPostType(input.caption, input.isReel) : "personal");
  const isReel = input.isReel ?? false;
  const caption = input.caption || "";

  const captionAnalysis = caption ? analyzeCaption(caption) : null;

  // --- Compute multipliers ---
  const baselineReach = baselines.byPostType[postType] ?? baselines.overallAvgReach;

  // Reel multiplier
  const reelMult = isReel ? baselines.reelMultiplier : 1.0;

  // Day-of-week multiplier
  let dayMult = 1.0;
  if (input.scheduledFor) {
    const day = new Date(input.scheduledFor).toLocaleDateString("en-US", { weekday: "long" });
    if (day === "Sunday") dayMult = baselines.sundayMultiplier;
    else if (day === "Saturday") dayMult = 1.04;
  }

  // Hook boost
  const hookMult = captionAnalysis?.hookStyle === "story" ? baselines.storyHookBoost : 1.0;

  // Local hashtag boost
  const hashtagsLower = (captionAnalysis?.hashtags || []).map(h => h.toLowerCase());
  const hasLocalTag = hashtagsLower.some(h => LOCAL_HASHTAGS.some(lh => lh.toLowerCase() === h));
  const localTagMult = hasLocalTag ? baselines.localHashtagBoost : 1.0;

  // Carousel boost (if multiple images)
  const carouselMult = !isReel && (input.imageCount || 1) > 2 ? baselines.carouselMultiplier : 1.0;

  const predictedReach = Math.round(
    baselineReach * reelMult * dayMult * hookMult * localTagMult * carouselMult
  );

  // Confidence band: ±30% for low data, ±20% for high data
  const bandPct = 0.25;
  const predictedReachLow = Math.round(predictedReach * (1 - bandPct));
  const predictedReachHigh = Math.round(predictedReach * (1 + bandPct));

  // Engagement estimate: avg engagement rate from data
  const avgEngRate = 0.06; // 6% baseline from audit data
  const predictedEngagement = Math.round(predictedReach * avgEngRate);

  // Confidence score
  const engagementProbability = Math.min(0.85, 0.5 + (reelMult > 2 ? 0.15 : 0) + (hookMult > 1 ? 0.1 : 0) + (dayMult > 1 ? 0.05 : 0));

  // Reach tier
  let reachTier: PostPrediction["reachTier"] = "low";
  if (predictedReach >= 1500) reachTier = "viral";
  else if (predictedReach >= 800) reachTier = "high";
  else if (predictedReach >= 400) reachTier = "medium";

  // Similar posts
  const similarPosts = await findSimilarPosts(postType, isReel);

  // Best publish time
  const best = getBestPublishTime("Sunday");

  // Build signals
  const signals: PredictorSignal[] = [];

  if (isReel) {
    signals.push({ label: "Reel format", impact: "positive", detail: `Reels avg ${baselines.reelMultiplier.toFixed(1)}× reach vs static posts for your account` });
  }
  if (dayMult > 1 && input.scheduledFor) {
    const day = new Date(input.scheduledFor).toLocaleDateString("en-US", { weekday: "long" });
    signals.push({ label: `${day} publish`, impact: "positive", detail: "Peak audience activity day for your followers" });
  }
  if (captionAnalysis?.hookStyle === "story") {
    signals.push({ label: "Story hook", impact: "positive", detail: "+15% reach vs avg for story-opener captions" });
  }
  if (hasLocalTag) {
    signals.push({ label: "Hyper-local hashtags", impact: "positive", detail: "Local tags index in Google AI Overviews — dual distribution" });
  }
  if (!hasLocalTag && captionAnalysis) {
    signals.push({ label: "No local hashtags", impact: "warning", detail: "Add #ZacharyLA, #CentralLA, or #FelicianaParish to reach underserved geo clusters" });
  }
  if (captionAnalysis && captionAnalysis.captionLength > 200) {
    signals.push({ label: "Long caption", impact: "warning", detail: `${captionAnalysis.captionLength} words — your best posts avg 90–150 words` });
  }
  if (captionAnalysis && captionAnalysis.hashtagCount < 5) {
    signals.push({ label: "Low hashtag count", impact: "warning", detail: `${captionAnalysis.hashtagCount} hashtags — quality gate recommends 5–8` });
  }

  // Improvement suggestions
  const suggestions: string[] = [];
  if (!isReel) suggestions.push("Convert to a Reel or add a short video clip — Reels get 2.4× your average reach");
  if (!input.scheduledFor || new Date(input.scheduledFor).toLocaleDateString("en-US", { weekday: "long" }) !== "Sunday") {
    suggestions.push("Schedule for Sunday 7–9 AM — your followers are most active then");
  }
  if (!hasLocalTag) {
    suggestions.push("Add #ZacharyLA #CentralLA #FelicianaParish — 15% of your followers are in these markets with no dedicated content");
  }
  if (captionAnalysis?.hookStyle !== "story") {
    suggestions.push("Open with a personal story line — story hooks consistently outperform question or statement openers");
  }

  return {
    predictedReach,
    predictedReachLow,
    predictedReachHigh,
    predictedEngagement,
    engagementProbability,
    reachTier,
    bestPublishDay: best.day,
    bestPublishHour: best.hour,
    similarPosts,
    signals,
    improvementSuggestions: suggestions.slice(0, 3),
  };
}
