// ─────────────────────────────────────────────────────────────────────────────
// The Brain — consumer port implementation (Increment 1): "Present".
//
// The v0 RelationshipIntelligencePort. Surfaces read the Brain's derived models
// through here and NOTHING ELSE — never ContactLog / Lead / loftyId /
// lastContactDate. It reads the disposable Node.facts.model (written by the
// belief engine) and maps it to the vendor-blind shapes the UI renders.
//
// Confidence is surfaced as a BAND, never a number (P10). Provenance — the exact
// observations a belief was rebuilt from — rides along so the UI can put it one
// tap away.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { EntityModelV0 } from "./beliefs";
import type { ConfidenceBand } from "./types";
import type {
  AtRiskQuery,
  RelationshipIntelligence,
  RelationshipIntelligencePort,
} from "./ports";

const BAND_RANK: Record<ConfidenceBand, number> = { LOW: 0, MED: 1, HIGH: 2 };

function readModel(facts: unknown): EntityModelV0 | null {
  const m = (facts as { model?: unknown } | null)?.model;
  if (!m || typeof m !== "object") return null;
  const model = m as EntityModelV0;
  return model.version === 0 ? model : null;
}

function toIntelligence(node: { id: string; label: string; facts: unknown }): RelationshipIntelligence | null {
  const model = readModel(node.facts);
  if (!model) return null;
  return {
    entityId: node.id,
    label: node.label,
    health: model.health
      ? { band: model.health.band, summary: model.health.summary, provenance: model.health.provenance }
      : null,
    riskOfDrift: model.riskOfDrift
      ? {
          band: model.riskOfDrift.band,
          summary: model.riskOfDrift.summary,
          provenance: model.riskOfDrift.provenance,
        }
      : null,
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
    // Fetch People entities that carry a derived model; rank in JS. Vendor-blind:
    // the only filter is kind=Person + a model present, never a date column.
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
