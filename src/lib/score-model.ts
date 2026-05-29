// Calibrated Score Model — AIRE Platform
//
// The "learning" half of lead temperature. Instead of hand-tuned points, this
// derives a close-probability from Caleb's OWN history: for each feature bucket
// (stage, price band, source, type, timeline, pre-approval) it computes the
// empirical win-rate among resolved leads, then blends them in log-odds space
// (a transparent naive-Bayes update) into a single probability.
//
// Design choices:
//   - Inspectable, not a black box: every weight is a real win-rate you can read.
//   - Same call site: lead-score.ts consumes this synchronously from an in-memory
//     cache (loadScoreModel() warms it; recalibrate() retrains + persists).
//   - Honest fallback: if history is too thin the model is inactive and the
//     static formula in lead-score.ts is used instead.
//   - Low-leakage features only: recency & engagement stay as LIVE warmth signals
//     in lead-score.ts; the learned part is the durable "will this ever close"
//     signal (stage / price / source / type / timeline / pre-approval).

import { prisma } from "./prisma";
import { labelLeads, summarizeOutcomes, type LabeledLead } from "./lead-outcomes";

const SETTING_KEY = "score_model_weights";

// Activation thresholds — below these we don't trust the data and fall back.
const MIN_RESOLVED = 40;
const MIN_WON = 12;

// Beta-style smoothing toward the base rate (pseudo-count). Higher = more
// conservative for thin buckets.
const SMOOTH_ALPHA = 4;
// Per-feature dampening so correlated features don't compound into overconfidence.
const FEATURE_WEIGHT = 0.6;
// Close-probability owns 45 of the 100 total points (recency+engagement own 55).
export const CLOSE_PROB_MAX = 45;

export const FEATURES = ["stage", "priceBand", "source", "type", "timeline", "preApproved"] as const;
export type FeatureName = (typeof FEATURES)[number];

export interface LeadFeatures {
  stage: string;
  pricePoint: number | null;
  source: string | null;
  type: string | null;
  timeline: string | null;
  preApproved: boolean;
}

interface BucketStat {
  winRate: number; // smoothed
  n: number; // resolved count in this bucket (pre-smoothing)
}

export interface ScoreModel {
  version: number;
  trainedAt: string;
  active: boolean;
  baseRate: number; // overall win rate among resolved
  resolved: number;
  won: number;
  features: Record<FeatureName, Record<string, BucketStat>>;
}

// ---- Feature bucketing (shared with lead-score fallback) -------------------

export function priceBand(pricePoint: number | null): string {
  if (!pricePoint || pricePoint <= 0) return "unknown";
  if (pricePoint < 200_000) return "lt200";
  if (pricePoint < 400_000) return "200-400";
  if (pricePoint < 600_000) return "400-600";
  if (pricePoint < 900_000) return "600-900";
  if (pricePoint < 1_200_000) return "900-1200";
  return "gte1200";
}

function norm(s: string | null | undefined): string {
  const v = (s ?? "").trim().toLowerCase();
  return v || "unknown";
}

export function bucketsFor(lead: LeadFeatures): Record<FeatureName, string> {
  return {
    stage: norm(lead.stage),
    priceBand: priceBand(lead.pricePoint),
    source: norm(lead.source),
    type: norm(lead.type),
    timeline: norm(lead.timeline),
    preApproved: lead.preApproved ? "yes" : "no",
  };
}

// ---- In-memory cache -------------------------------------------------------

let _model: ScoreModel | null = null;
let _loaded = false;

export function getCachedModel(): ScoreModel | null {
  return _model && _model.active ? _model : null;
}

/** Warm the in-memory model cache from the Setting row. Idempotent. */
export async function loadScoreModel(force = false): Promise<ScoreModel | null> {
  if (_loaded && !force) return _model;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  if (row?.value) {
    try {
      _model = JSON.parse(row.value) as ScoreModel;
    } catch {
      _model = null;
    }
  } else {
    _model = null;
  }
  _loaded = true;
  return _model;
}

// ---- Training --------------------------------------------------------------

/**
 * Retrain from full history and persist. Returns the model plus a summary. The
 * model is marked active only when there's enough resolved data to trust it.
 */
export async function recalibrate(): Promise<{ model: ScoreModel; summary: ReturnType<typeof summarizeOutcomes> }> {
  const labeled = await labelLeads();
  const summary = summarizeOutcomes(labeled);
  const resolved = labeled.filter((l) => l.outcome !== "open");
  const wonCount = summary.won;
  const baseRate = resolved.length === 0 ? 0 : wonCount / resolved.length;

  const features = emptyFeatureMap();
  for (const f of FEATURES) {
    const buckets = countByBucket(resolved, f);
    for (const [bucket, { wins, total }] of Object.entries(buckets)) {
      // Smooth toward base rate: (wins + alpha*base) / (total + alpha)
      const winRate = (wins + SMOOTH_ALPHA * baseRate) / (total + SMOOTH_ALPHA);
      features[f][bucket] = { winRate, n: total };
    }
  }

  const active = resolved.length >= MIN_RESOLVED && wonCount >= MIN_WON && baseRate > 0;

  const model: ScoreModel = {
    version: 1,
    trainedAt: new Date().toISOString(),
    active,
    baseRate,
    resolved: resolved.length,
    won: wonCount,
    features,
  };

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(model) },
    update: { value: JSON.stringify(model) },
  });
  _model = model;
  _loaded = true;

  return { model, summary };
}

function emptyFeatureMap(): Record<FeatureName, Record<string, BucketStat>> {
  return {
    stage: {}, priceBand: {}, source: {}, type: {}, timeline: {}, preApproved: {},
  };
}

function countByBucket(resolved: LabeledLead[], feature: FeatureName) {
  const out: Record<string, { wins: number; total: number }> = {};
  for (const l of resolved) {
    const bucket = bucketsFor(l)[feature];
    const cell = (out[bucket] ??= { wins: 0, total: 0 });
    cell.total++;
    if (l.outcome === "won") cell.wins++;
  }
  return out;
}

// ---- Scoring ---------------------------------------------------------------

function logit(p: number): number {
  const c = Math.min(0.98, Math.max(0.02, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface CloseProbResult {
  points: number; // 0..CLOSE_PROB_MAX
  prob: number; // 0..1
  contributors: { feature: FeatureName; bucket: string; winRate: number; delta: number }[];
}

/**
 * Compute the learned close-probability for a lead from the cached active model.
 * Returns null when no active model (caller falls back to the static formula).
 */
export function scoreCloseProbability(lead: LeadFeatures): CloseProbResult | null {
  const model = getCachedModel();
  if (!model) return null;

  const base = logit(model.baseRate);
  let acc = base;
  const buckets = bucketsFor(lead);
  const contributors: CloseProbResult["contributors"] = [];

  for (const f of FEATURES) {
    const bucket = buckets[f];
    const stat = model.features[f]?.[bucket];
    if (!stat || stat.n === 0) continue; // unseen bucket → no evidence
    const delta = FEATURE_WEIGHT * (logit(stat.winRate) - base);
    acc += delta;
    contributors.push({ feature: f, bucket, winRate: stat.winRate, delta });
  }

  const prob = sigmoid(acc);
  contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { points: prob * CLOSE_PROB_MAX, prob, contributors: contributors.slice(0, 4) };
}

// ---- Sell-intent (Phase C) -------------------------------------------------
//
// Distinct from close-probability/temperature. Estimates how likely a homeowner is
// to be *thinking about selling*, blending PropStream property attributes with our
// first-party engagement. There are no labeled sell outcomes yet, so this is a
// transparent, hand-set PRIOR (named factors, readable weights) — not a learned
// model. Once sell outcomes accrue it can be recalibrated like close-probability.
// Marketing-prioritization ONLY; never an FCRA credit/eligibility input.

export interface SellIntentInput {
  // Property attributes (PropertyIntel) — any may be null/unknown.
  equityPct: number | null;
  ownershipYears: number | null;
  absentee: boolean | null;
  preForeclosure: boolean | null;
  ownerOccupied: boolean | null;
  // First-party signals.
  type: string | null; // seller / both / investor weigh higher
  timeline: string | null;
  inboundCount: number; // all-time inbound ContactLog
  daysSinceInbound: number | null; // recency of their last reply to us
}

export interface SellIntentFactor {
  label: string;
  points: number; // signed contribution
}

export interface SellIntentResult {
  score: number; // 0..100
  level: "high" | "moderate" | "low";
  hasPropertyData: boolean;
  factors: SellIntentFactor[];
}

export function scoreSellIntent(input: SellIntentInput): SellIntentResult {
  const factors: SellIntentFactor[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) factors.push({ label, points });
  };

  // --- Property attributes (max ~70) ---
  // High equity = can sell freely (not underwater). Scales 0→30 from 0→80%+ equity.
  if (input.equityPct != null) {
    const e = Math.max(0, Math.min(100, input.equityPct));
    add(`${Math.round(e)}% equity`, Math.round((Math.min(e, 80) / 80) * 30));
  }
  // Tenure sweet spot: avg homeowner sells ~8–12 yrs in. 0 near fresh purchase,
  // peak ~7–14 yrs, gently lower past that.
  if (input.ownershipYears != null) {
    const y = input.ownershipYears;
    let t = 0;
    if (y >= 7 && y <= 14) t = 20;
    else if (y > 14) t = 14;
    else if (y >= 4) t = 10;
    else t = 0;
    add(`owned ${Math.round(y)} yr`, t);
  }
  // Pre-foreclosure = strong motivation to sell (still handle with care).
  if (input.preForeclosure) add("pre-foreclosure", 18);
  // Absentee owners (landlords/inheritors) sell more readily.
  if (input.absentee) add("absentee owner", 10);
  // Owner-occupied is slightly stickier (lower intent), small negative nudge.
  if (input.ownerOccupied === true) add("owner-occupied", -4);

  // --- First-party signals (max ~30) ---
  const t = (input.type ?? "").toLowerCase();
  if (t === "seller") add("seller lead", 14);
  else if (t === "both") add("buyer+seller", 8);
  else if (t === "investor") add("investor", 6);

  if (input.timeline) {
    const tl = input.timeline.toLowerCase();
    if (tl.includes("immediate") || tl.startsWith("1-3")) add("near-term timeline", 12);
    else if (tl.startsWith("3-6")) add("mid timeline", 6);
  }
  // Recent two-way engagement with us is the strongest first-party signal.
  if (input.inboundCount > 0) {
    if (input.daysSinceInbound != null && input.daysSinceInbound <= 30) add("replied <30d", 10);
    else if (input.daysSinceInbound != null && input.daysSinceInbound <= 90) add("replied <90d", 5);
    else add("has replied", 2);
  }

  const raw = factors.reduce((s, f) => s + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level: SellIntentResult["level"] = score >= 60 ? "high" : score >= 35 ? "moderate" : "low";
  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  return {
    score,
    level,
    hasPropertyData:
      input.equityPct != null || input.ownershipYears != null || input.preForeclosure === true || input.absentee != null,
    factors,
  };
}
