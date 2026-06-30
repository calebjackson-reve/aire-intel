// ─────────────────────────────────────────────────────────────────────────────
// The Brain — consumer port implementation (Increment 1): "Present".
//
// The v1 RelationshipIntelligencePort. This is the ONLY place where reasoning
// becomes presentation: it reads the engine's structured Beliefs off the disposable
// Node.facts.model and DECIDES the band/label. The engine never names a band; the
// UI never sees a Belief. All vendor-blindness and P10 (confidence-as-register,
// never a number) is enforced right here.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { EntityModel } from "./beliefs";
import { bandOf, type Belief, type BeliefKind, type ConfidenceBand } from "./types";
import type {
  AtRiskQuery,
  RelationshipIntelligence,
  RelationshipIntelligencePort,
  SurfacedBelief,
} from "./ports";

const BAND_RANK: Record<ConfidenceBand, number> = { LOW: 0, MED: 1, HIGH: 2 };

function readModel(facts: unknown): EntityModel | null {
  const m = (facts as { model?: unknown } | null)?.model;
  if (!m || typeof m !== "object") return null;
  const model = m as EntityModel;
  return Array.isArray(model.beliefs) ? model : null;
}

// PRESENTATION DECISION: a belief's scalar confidence becomes a band HERE.
function surface(belief: Belief | undefined): SurfacedBelief | null {
  if (!belief) return null;
  return {
    band: bandOf(belief.confidence),
    summary: belief.claim,
    counterConsiderations: belief.counterConsiderations ?? [],
    provenance: {
      observationIds: belief.evidenceRefs,
      sourceLabels: [], // filled by caller-free default; refs carry the link
      asOf: new Date(belief.lastEvaluatedAt),
    },
  };
}

function toIntelligence(node: { id: string; label: string; facts: unknown }): RelationshipIntelligence | null {
  const model = readModel(node.facts);
  if (!model) return null;
  const byKind = (k: BeliefKind) => model.beliefs.find((b) => b.kind === k);
  return {
    entityId: node.id,
    label: node.label,
    engineVersion: model.engineVersion ?? null,
    health: surface(byKind("relationship_health")),
    riskOfDrift: surface(byKind("relationship_drift_risk")),
  };
}

export const relationshipIntelligence: RelationshipIntelligencePort = {
  async forPerson(entityId: string): Promise<RelationshipIntelligence | null> {
    const node = await prisma.node.findUnique({
      where: { id: entityId },
      select: { id: true, label: true, facts: true },
    });
    return node ? toIntelligence(node) : null;
  },

  async atRiskOfDrift(query: AtRiskQuery = {}): Promise<RelationshipIntelligence[]> {
    const minRank = BAND_RANK[query.minBand ?? "MED"];
    const nodes = await prisma.node.findMany({
      where: { kind: "Person", workspaceId: query.workspaceId ?? "default" },
      select: { id: true, label: true, facts: true },
      take: 200,
    });

    return nodes
      .map(toIntelligence)
      .filter((x): x is RelationshipIntelligence => !!x?.riskOfDrift)
      .filter((x) => BAND_RANK[x.riskOfDrift!.band] >= minRank)
      .sort((a, b) => BAND_RANK[b.riskOfDrift!.band] - BAND_RANK[a.riskOfDrift!.band])
      .slice(0, query.limit ?? 10);
  },
};
