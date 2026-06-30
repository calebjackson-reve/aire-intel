export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// The Brain — surface read endpoint (Increment 1, "Present").
//
// The ONLY thing this route may touch is the consumer port. No Lead, no
// ContactLog, no lastContactDate. It returns the Brain's derived relationship
// intelligence — bands + summaries + provenance counts — for the UI to render.
// ─────────────────────────────────────────────────────────────────────────────

import { relationshipIntelligence } from "@/lib/brain/intelligence";

export async function GET() {
  try {
    const atRisk = await relationshipIntelligence.atRiskOfDrift({ minBand: "MED", limit: 5 });
    return Response.json({
      atRisk: atRisk.map((r) => ({
        entityId: r.entityId,
        label: r.label,
        risk: r.riskOfDrift
          ? { band: r.riskOfDrift.band, summary: r.riskOfDrift.summary, evidenceCount: r.riskOfDrift.provenance.observationIds.length }
          : null,
        health: r.health ? { band: r.health.band, summary: r.health.summary } : null,
      })),
      computed: true,
    });
  } catch (err) {
    return Response.json({ atRisk: [], computed: false, error: err instanceof Error ? err.message : String(err) });
  }
}
