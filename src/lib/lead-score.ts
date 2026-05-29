// Lead Scoring Engine — AIRE Platform
//
// Scores each lead 0–100 from two halves:
//   LIVE WARMTH (55pts) — how engaged the lead is right now
//     recency    (30pts) — days since last contact. 0d=30, 7d=18, 30d=4
//     engagement (25pts) — ContactLog entries in last 30 days
//   CLOSE PROBABILITY (45pts) — how likely this lead is to ever close
//     LEARNED from Caleb's own history when a calibrated model is active
//     (see score-model.ts); otherwise falls back to the static stage+price curve.
//
// scoreLeadSync stays synchronous — callers that want the learned model warm the
// in-memory cache first via loadScoreModel() (the batch score route does this).
// Without a warm/active model it transparently uses the static formula.
//
// Usage:
//   await loadScoreModel();            // optional — enables learned scoring
//   const score = scoreLeadSync(lead, logCount30d);
//   const level = scoreLevel(score);   → "hot" | "warm" | "cool" | "cold"

import { scoreCloseProbability, type LeadFeatures, type CloseProbResult } from "./score-model";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LeadForScore {
  lastContactDate: string | Date | null;
  stage: string;
  pricePoint: number | null;
  // Optional — used by the learned close-probability model. Existing callers
  // that omit these still score correctly (model skips unseen features).
  source?: string | null;
  type?: string | null;
  timeline?: string | null;
  preApproved?: boolean;
}

/** Score recency: more recent = higher score (max 30) */
function recencyScore(lastContactDate: string | Date | null): number {
  if (!lastContactDate) return 0;
  const days = (Date.now() - new Date(lastContactDate).getTime()) / DAY_MS;
  if (days <= 0)  return 30;
  if (days <= 1)  return 28;
  if (days <= 3)  return 24;
  if (days <= 7)  return 18;
  if (days <= 14) return 10;
  if (days <= 30) return 4;
  return 0;
}

/** Score engagement: ContactLog count in last 30 days (max 25) */
function engagementScore(logCount30d: number): number {
  if (logCount30d === 0) return 0;
  if (logCount30d === 1) return 8;
  if (logCount30d === 2) return 14;
  if (logCount30d <= 4) return 20;
  return 25;
}

/** Static stage curve — used in the fallback close-probability (max 25) */
function stageScore(stage: string): number {
  const map: Record<string, number> = {
    new_lead:       8,
    active:         14,
    showing:        20,
    under_contract: 25,
    closed:         0,  // closed = no longer actionable
  };
  return map[stage] ?? 5;
}

/** Static price curve — used in the fallback close-probability (max 20)
 *  Calibrated for Baton Rouge luxury market ($200k–$2M+) */
function priceScore(pricePoint: number | null): number {
  if (!pricePoint || pricePoint <= 0) return 2;
  if (pricePoint < 200_000)  return 4;
  if (pricePoint < 400_000)  return 8;
  if (pricePoint < 600_000)  return 12;
  if (pricePoint < 900_000)  return 16;
  if (pricePoint < 1_200_000) return 18;
  return 20;
}

function toFeatures(lead: LeadForScore): LeadFeatures {
  return {
    stage: lead.stage,
    pricePoint: lead.pricePoint,
    source: lead.source ?? null,
    type: lead.type ?? null,
    timeline: lead.timeline ?? null,
    preApproved: lead.preApproved ?? false,
  };
}

/** Close-probability portion (max 45): learned if a model is active, else static. */
function closeProbabilityScore(lead: LeadForScore): { points: number; learned: CloseProbResult | null } {
  const learned = scoreCloseProbability(toFeatures(lead));
  if (learned) return { points: learned.points, learned };
  return { points: stageScore(lead.stage) + priceScore(lead.pricePoint), learned: null };
}

/** Compute total score 0–100 */
export function scoreLeadSync(lead: LeadForScore, logCount30d = 0): number {
  const { points } = closeProbabilityScore(lead);
  return Math.round(Math.min(100,
    recencyScore(lead.lastContactDate) +
    engagementScore(logCount30d) +
    points
  ));
}

export interface ScoreBreakdown {
  total: number;
  recency: number;
  engagement: number;
  closeProbability: number;
  learned: boolean;
  /** Top contributing features when the learned model is active (for "why" UI). */
  contributors: CloseProbResult["contributors"];
}

/** Same score as scoreLeadSync, but with the component breakdown for the UI. */
export function scoreLeadDetailed(lead: LeadForScore, logCount30d = 0): ScoreBreakdown {
  const recency = recencyScore(lead.lastContactDate);
  const engagement = engagementScore(logCount30d);
  const { points, learned } = closeProbabilityScore(lead);
  return {
    total: Math.round(Math.min(100, recency + engagement + points)),
    recency,
    engagement,
    closeProbability: Math.round(points),
    learned: !!learned,
    contributors: learned?.contributors ?? [],
  };
}

export type ScoreLevel = "hot" | "warm" | "cool" | "cold";

/** Convert numeric score to human label */
export function scoreLevel(score: number): ScoreLevel {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "cool";
  return "cold";
}

/** Score badge color — maps to AIRE design tokens */
export function scoreLevelColor(level: ScoreLevel): string {
  return {
    hot:  "var(--aire-coral)",
    warm: "var(--aire-cream)",
    cool: "var(--aire-text-2)",
    cold: "var(--aire-muted)",
  }[level];
}

/** Score badge background */
export function scoreLevelBg(level: ScoreLevel): string {
  return {
    hot:  "rgba(238,129,114,0.12)",
    warm: "rgba(239,221,132,0.10)",
    cool: "var(--aire-card-warm)",
    cold: "var(--status-cold)",
  }[level];
}
