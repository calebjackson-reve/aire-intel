// ─────────────────────────────────────────────────────────────────────────────
// The Brain — predictions & reflection (Increment 2): "Outcome → Reflection → Learning".
//
// The key move: a PREDICTION is an Observation (the Brain observing its own
// thought), an OUTCOME is an Observation (the world, via continuous ingest), and a
// GRADE is an Observation (a derived join over the two). No new primitive — the
// learning loop reuses the same immutable, vendor-blind memory substrate.
//
//   recordPredictions — when the engine asserts a falsifiable belief, remember the
//                       prediction (claim + confidence + engineVersion + horizon).
//   reflect           — for each prediction past its horizon, grade it against what
//                       the entity actually did, and remember the grade.
//   scorecard         — replay all grades → per-engine-version hit rate. This is how
//                       v1 vs v2 gets compared two years from now.
//
// Predictions and grades are immutable history (they happened). The belief itself
// stays disposable. Both Book −1 guardrails hold at once.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { isInbound, type EntityModel } from "./beliefs";

export const BRAIN_SOURCE = "brain";
export const PREDICTION_EVENT = "brain_prediction";
export const GRADE_EVENT = "brain_grade";
export const DEFAULT_HORIZON_DAYS = 14;
const DAY = 86_400_000;

export type Verdict = "confirmed" | "incorrect" | "inconclusive";

/**
 * The grading rule, pure and testable. A "they'll disengage" prediction is:
 *   • incorrect    — if the entity re-engaged (reached IN) within the horizon;
 *   • confirmed    — if the horizon elapsed with no re-engagement;
 *   • inconclusive — if the horizon is still open.
 */
export function decideVerdict(p: { predictedAt: number; horizonDays: number; reEngaged: boolean; now: number }): Verdict {
  if (p.reEngaged) return "incorrect";
  if (p.now >= p.predictedAt + p.horizonDays * DAY) return "confirmed";
  return "inconclusive";
}

// Only falsifiable, meaningful beliefs become predictions. "Health = active" is a
// description, not a falsifiable claim about the future; drift risk is.
function isPredictable(kind: string, confidence: number): boolean {
  return kind === "relationship_drift_risk" && confidence >= 0.5;
}

interface PredictionFacts {
  role: "prediction";
  beliefKind: string;
  claim: string;
  confidence: number;
  engineVersion: string;
  evidenceRefs: string[];
  horizonDays: number;
  predictedAt: string; // ISO
}

/**
 * Remember the Brain's falsifiable predictions for an entity as immutable
 * Observations. Idempotent: skips if an ungraded prediction of the same
 * (kind, engineVersion) is already open. `now` lets a replay stamp the historical
 * moment the belief would have been asserted.
 */
export async function recordPredictions(
  entityId: string,
  model: EntityModel,
  now: number = Date.now(),
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<string[]> {
  const recorded: string[] = [];
  for (const b of model.beliefs) {
    if (!isPredictable(b.kind, b.confidence)) continue;
    if (await hasOpenPrediction(entityId, b.kind, b.engineVersion)) continue;

    const predictedAt = new Date(now);
    const sourceRef = `prediction:${entityId}:${b.kind}:${b.engineVersion}:${predictedAt.toISOString().slice(0, 10)}`;
    const facts: PredictionFacts = {
      role: "prediction",
      beliefKind: b.kind,
      claim: b.claim,
      confidence: b.confidence,
      engineVersion: b.engineVersion,
      evidenceRefs: b.evidenceRefs,
      horizonDays,
      predictedAt: predictedAt.toISOString(),
    };
    const obs = await prisma.observation.upsert({
      where: { sourceKind_sourceRef: { sourceKind: BRAIN_SOURCE, sourceRef } },
      update: {}, // immutable — never rewrite an already-remembered prediction
      create: {
        nodeId: entityId,
        sourceKind: BRAIN_SOURCE,
        sourceRef,
        eventType: PREDICTION_EVENT,
        text: b.claim,
        confidence: b.confidence,
        recordedAt: predictedAt,
        workspaceId: "default",
        facts: facts as unknown as object,
      },
      select: { id: true },
    });
    recorded.push(obs.id);
  }
  return recorded;
}

/**
 * Grade every open prediction whose horizon has elapsed against what the entity
 * actually did, and remember the grade as an Observation. Returns the verdicts it
 * recorded this pass. `now` lets a replay advance the clock to show the outcome.
 */
export async function reflect(
  entityId: string,
  now: number = Date.now(),
): Promise<Array<{ predictionId: string; verdict: Verdict; engineVersion: string }>> {
  const all = await prisma.observation.findMany({
    where: { nodeId: entityId },
    orderBy: { recordedAt: "asc" },
    select: { id: true, eventType: true, sourceKind: true, facts: true, recordedAt: true },
  });

  const predictions = all.filter((o) => o.eventType === PREDICTION_EVENT);
  const gradedRefs = new Set(
    all.filter((o) => o.eventType === GRADE_EVENT).map((g) => (g.facts as { predictionRef?: string }).predictionRef),
  );
  // What the ENTITY actually did — real-world events only, never the Brain's own.
  const entityEvents = all.filter((o) => o.sourceKind !== BRAIN_SOURCE);

  const out: Array<{ predictionId: string; verdict: Verdict; engineVersion: string }> = [];
  for (const p of predictions) {
    if (gradedRefs.has(p.id)) continue;
    const f = p.facts as unknown as PredictionFacts;
    const predictedAt = new Date(f.predictedAt).getTime();
    const windowEnd = predictedAt + (f.horizonDays ?? DEFAULT_HORIZON_DAYS) * DAY;

    // Re-engagement = the entity reached back IN within the horizon. That falsifies
    // a "they'll disengage" prediction.
    const reEngaged = entityEvents.some(
      (o) => isInbound(o) && new Date(o.recordedAt).getTime() > predictedAt && new Date(o.recordedAt).getTime() <= windowEnd,
    );

    const verdict = decideVerdict({ predictedAt, horizonDays: f.horizonDays ?? DEFAULT_HORIZON_DAYS, reEngaged, now });
    if (verdict === "inconclusive") continue; // horizon still open — not yet gradable

    await prisma.observation.upsert({
      where: { sourceKind_sourceRef: { sourceKind: BRAIN_SOURCE, sourceRef: `grade:${p.id}` } },
      update: {},
      create: {
        nodeId: entityId,
        sourceKind: BRAIN_SOURCE,
        sourceRef: `grade:${p.id}`,
        eventType: GRADE_EVENT,
        text: `Prediction ${verdict}`,
        recordedAt: new Date(now),
        workspaceId: "default",
        facts: {
          role: "grade",
          predictionRef: p.id,
          verdict,
          beliefKind: f.beliefKind,
          engineVersion: f.engineVersion,
          gradedAt: new Date(now).toISOString(),
        } as object,
      },
    });
    out.push({ predictionId: p.id, verdict, engineVersion: f.engineVersion });
  }
  return out;
}

export interface EngineScore {
  engineVersion: string;
  graded: number;
  confirmed: number;
  incorrect: number;
  openPredictions: number;
  hitRate: number | null; // confirmed / (confirmed + incorrect); null until decided
}

/** Replay every grade into a per-engine-version scorecard. This is the v1-vs-v2 lens. */
export async function scorecard(engineVersion?: string): Promise<EngineScore[]> {
  const [grades, openPreds] = await Promise.all([
    prisma.observation.findMany({
      where: { sourceKind: BRAIN_SOURCE, eventType: GRADE_EVENT },
      select: { facts: true },
    }),
    prisma.observation.findMany({
      where: { sourceKind: BRAIN_SOURCE, eventType: PREDICTION_EVENT },
      select: { id: true, facts: true },
    }),
  ]);

  const gradedPredRefs = new Set(grades.map((g) => (g.facts as { predictionRef?: string }).predictionRef));
  const byVersion = new Map<string, EngineScore>();
  const get = (v: string) =>
    byVersion.get(v) ?? byVersion.set(v, { engineVersion: v, graded: 0, confirmed: 0, incorrect: 0, openPredictions: 0, hitRate: null }).get(v)!;

  for (const g of grades) {
    const f = g.facts as { engineVersion?: string; verdict?: Verdict };
    const s = get(f.engineVersion ?? "unknown");
    s.graded++;
    if (f.verdict === "confirmed") s.confirmed++;
    else if (f.verdict === "incorrect") s.incorrect++;
  }
  for (const p of openPreds) {
    if (gradedPredRefs.has(p.id)) continue;
    const f = p.facts as { engineVersion?: string };
    get(f.engineVersion ?? "unknown").openPredictions++;
  }
  for (const s of byVersion.values()) {
    const decided = s.confirmed + s.incorrect;
    s.hitRate = decided > 0 ? s.confirmed / decided : null;
  }

  const all = [...byVersion.values()];
  return engineVersion ? all.filter((s) => s.engineVersion === engineVersion) : all;
}

// True if an ungraded prediction of this (kind, engineVersion) is already open.
async function hasOpenPrediction(entityId: string, beliefKind: string, engineVersion: string): Promise<boolean> {
  const preds = await prisma.observation.findMany({
    where: { nodeId: entityId, sourceKind: BRAIN_SOURCE, eventType: PREDICTION_EVENT },
    select: { id: true, facts: true },
  });
  const mine = preds.filter((p) => {
    const f = p.facts as { beliefKind?: string; engineVersion?: string };
    return f.beliefKind === beliefKind && f.engineVersion === engineVersion;
  });
  if (mine.length === 0) return false;
  const grades = await prisma.observation.findMany({
    where: { nodeId: entityId, sourceKind: BRAIN_SOURCE, eventType: GRADE_EVENT },
    select: { facts: true },
  });
  const gradedRefs = new Set(grades.map((g) => (g.facts as { predictionRef?: string }).predictionRef));
  return mine.some((p) => !gradedRefs.has(p.id));
}
