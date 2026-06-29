// Reel Karpathy loop — the self-improving brain behind the /reel command.
//
// Implements the 5 rules from ~/.claude/templates/karpathy-loop.md:
//   1. Data flywheel   — every decision + outcome recorded (ContentPreference rows + LEDGER).
//   2. The leash       — every style choice is confidence-rated; LOW → escalate, never guess.
//   3. Gen→verify      — resolveStyle annotates choices; the route verifies the render.
//   4. Bitter lesson   — preferences move on REAL approvals/rejections, not hardcoded rules.
//   5. Context = cost  — resolved brand constants cached here (mirror of REEL-STYLE.md).
//
// Runtime-safe on Vercel: the live flywheel is the DB (ContentPreference). The markdown
// memory bank (LESSONS/LEDGER/ESCALATIONS/REEL-STYLE) is the human-curated source of truth,
// read/written best-effort locally and synced by Claude Code sessions. DEFAULT_STYLE below
// is the compiled mirror of REEL-STYLE.md so the loop never depends on reading files at runtime.

import { prisma } from "../prisma";
import { REVE_BRAND, type EditRecipe, type ReelInput, type TransitionType } from "./recipe";
import type { ResolvedStyle } from "./timeline";
import type { ShotstackTransition } from "../render/providers/shotstack";

export type Confidence = "HIGH" | "MED" | "LOW";

export interface Escalation {
  title: string;
  context: string;
  question: string;
}

export interface StyleResolution {
  style: ResolvedStyle;
  escalations: Escalation[];
  notes: string[];
  /** Per-choice confidence, surfaced into the Approve Queue payload. */
  confidence: Record<string, Confidence>;
}

// ── DEFAULT_STYLE — compiled mirror of REEL-STYLE.md (rule 5: cached constants) ──

const TRANSITION_MAP: Record<TransitionType, ShotstackTransition | "none"> = {
  hard: "none",
  dissolve: "fade",
  whip: "slideLeft",
  zoom: "zoom",
  fade: "fade",
};

const DEFAULT_STYLE: ResolvedStyle = {
  avgShotLen: 1.8,
  snapToBeat: true,
  transitionMap: TRANSITION_MAP,
  gradeFilter: "contrast", // restraint default
  maxAccentTransitions: 1,
  brand: REVE_BRAND,
};

// Pattern keys used in ContentPreference (the flywheel substrate).
export const PT = {
  pacing: "reel_pacing",
  grade: "reel_grade",
  transition: "reel_transition",
  hook: "reel_hook",
  music: "reel_music",
} as const;

// ── Rule 2: the leash — confidence from real approval history ────────────────

/** HIGH (act silently) · MED (act + flag) · LOW (escalate / avoid). */
export function tierFor(approvals: number, rejections: number): Confidence {
  const n = approvals + rejections;
  if (n === 0) return "MED"; // unseen → act but flag
  const rate = approvals / n;
  if (n >= 5 && rate >= 0.7) return "HIGH";
  if (n >= 3 && rate < 0.4) return "LOW";
  return "MED";
}

async function prefTier(patternType: string, value: string): Promise<Confidence> {
  const row = await prisma.contentPreference.findUnique({
    where: { patternType_value: { patternType, value } },
  });
  if (!row) return "MED";
  return tierFor(row.approvals, row.rejections);
}

// ── Rule 3 helper: derive the grade filter the reference's grade implies ─────

function gradeFilterFor(recipe: EditRecipe): string {
  const g = recipe.grade;
  if (!g) return DEFAULT_STYLE.gradeFilter;
  if (g.saturation > 0.2) return "boost";
  if (g.contrast > 0.15) return "contrast";
  return DEFAULT_STYLE.gradeFilter;
}

function pacingBucket(avgShotLen: number): "fast" | "medium" | "slow" {
  if (avgShotLen < 1.2) return "fast";
  if (avgShotLen > 2.4) return "slow";
  return "medium";
}

/**
 * Phase 0–3 of the loop: load memory, resolve the style for this reel, and apply the
 * confidence leash. Returns the ResolvedStyle for the bridge plus any escalations
 * (LOW-confidence or missing-input cases the loop refuses to guess).
 */
export async function resolveStyle(recipe: EditRecipe | null, input: ReelInput): Promise<StyleResolution> {
  const escalations: Escalation[] = [];
  const notes: string[] = [];
  const confidence: Record<string, Confidence> = {};

  const brand = { ...REVE_BRAND, ...(input.brand ?? {}) };

  // Pacing: prefer the recipe's measured shot length; bucket it and check the flywheel.
  const avgShotLen = recipe?.rhythm?.avgShotLen || DEFAULT_STYLE.avgShotLen;
  const bucket = pacingBucket(avgShotLen);
  const pacingTier = await prefTier(PT.pacing, bucket);
  confidence[`pacing:${bucket}`] = pacingTier;
  let effectiveShotLen = avgShotLen;
  if (pacingTier === "LOW") {
    // Caleb keeps rejecting this pace → fall back to the safe medium default + escalate.
    effectiveShotLen = DEFAULT_STYLE.avgShotLen;
    escalations.push({
      title: `Pacing "${bucket}" has a low approval rate`,
      context: `Reference reel paces at ${avgShotLen.toFixed(2)}s/shot (${bucket}).`,
      question: `Keep matching ${bucket} pacing, or always normalize to medium (~1.8s)?`,
    });
    notes.push(`pacing ${bucket} is LOW-confidence → using medium default`);
  }

  // Grade: derive from the reference; respect a HIGH learned override.
  const gradeFilter = recipe ? gradeFilterFor(recipe) : DEFAULT_STYLE.gradeFilter;
  confidence[`grade:${gradeFilter}`] = await prefTier(PT.grade, gradeFilter);

  // Music: rule from LESSONS — never ship silent / never guess a track.
  if (!input.musicUrl) {
    escalations.push({
      title: "No music track supplied",
      context: "A reel with no soundtrack reads as unfinished.",
      question: "Provide a music URL, or approve rendering this reel silent?",
    });
    notes.push("missing musicUrl → escalated (no silent reels)");
  }

  // Need either a recipe or a vibe to have any cut rhythm to copy.
  if (!recipe && !input.vibe) {
    escalations.push({
      title: "No reference recipe and no vibe",
      context: "Nothing to derive a cut rhythm from.",
      question: "Paste a reference reel to tear down, or describe the vibe.",
    });
  }

  const style: ResolvedStyle = {
    ...DEFAULT_STYLE,
    avgShotLen: effectiveShotLen,
    gradeFilter,
    brand,
  };

  return { style, escalations, notes, confidence };
}

// ── Rules 1 & 4: record the outcome, move the flywheel ───────────────────────

export type ReelDecision = "approved" | "rejected" | "edited";

/** The style fingerprint of a rendered reel, stashed so an approve/reject can score it. */
export interface ReelFingerprint {
  pacing: "fast" | "medium" | "slow";
  gradeFilter: string;
  hadMusic: boolean;
}

export function fingerprint(style: ResolvedStyle, input: ReelInput): ReelFingerprint {
  return {
    pacing: pacingBucket(style.avgShotLen),
    gradeFilter: style.gradeFilter,
    hadMusic: Boolean(input.musicUrl),
  };
}

async function bump(patternType: string, value: string, decision: ReelDecision) {
  const approved = decision === "approved";
  const existing = await prisma.contentPreference.findUnique({
    where: { patternType_value: { patternType, value } },
  });
  const approvals = (existing?.approvals ?? 0) + (approved ? 1 : 0);
  const rejections = (existing?.rejections ?? 0) + (approved ? 0 : 1);
  const total = approvals + rejections;

  await prisma.contentPreference.upsert({
    where: { patternType_value: { patternType, value } },
    create: {
      patternType,
      value,
      approvals,
      rejections,
      approvalRate: total ? approvals / total : 0,
      lastSeen: new Date(),
    },
    update: {
      approvals,
      rejections,
      approvalRate: total ? approvals / total : 0,
      lastSeen: new Date(),
    },
  });
}

/**
 * Phase 6 (reflect): fold an approve/reject/edit decision back into the flywheel.
 * Called from the Approve Queue when Caleb acts on a reel. `edited` counts as a soft
 * rejection of the exact choices (he changed them) but not a hard no.
 */
export async function recordReelOutcome(fp: ReelFingerprint, decision: ReelDecision): Promise<void> {
  const effective: ReelDecision = decision === "edited" ? "rejected" : decision;
  await Promise.all([
    bump(PT.pacing, fp.pacing, effective),
    bump(PT.grade, fp.gradeFilter, effective),
    bump(PT.music, fp.hadMusic ? "with_music" : "silent", effective),
  ]);
}

/** Read-only snapshot of the flywheel for the /reel UI + debugging. */
export async function reelPreferenceSnapshot() {
  const rows = await prisma.contentPreference.findMany({
    where: { patternType: { in: Object.values(PT) } },
    orderBy: [{ patternType: "asc" }, { approvalRate: "desc" }],
  });
  return rows.map((r) => ({
    patternType: r.patternType,
    value: r.value,
    approvals: r.approvals,
    rejections: r.rejections,
    approvalRate: Number(r.approvalRate.toFixed(2)),
    tier: tierFor(r.approvals, r.rejections),
  }));
}
