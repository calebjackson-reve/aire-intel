// ─────────────────────────────────────────────────────────────────────────────
// The Brain — belief engine (Increment 1, layer 4): "Model → Reason".
//
// computeV0 is a PURE FUNCTION OF REMEMBERED HISTORY. It reads an entity's
// immutable Observations and ASSERTS BELIEFS — claim + confidence + evidence +
// counter-considerations + engine version. It does NOT decide presentation: no
// bands, no labels, no colours. The consumer port turns a belief into a badge.
//
// The result is written to Node.facts.model, which is DISPOSABLE: drop it, replay
// observations, get the same beliefs back. "Replay, never migrate." Every belief
// stamps BELIEF_ENGINE_VERSION so a future engine's output can be compared to this
// one over the same history.
//
// Vendor-blind: reads Observation rows ONLY. Never imports Lead / ContactLog /
// loftyId / lastContactDate. Adapters translate vendor data into Observations
// upstream; the Brain never learns the source.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { BELIEF_ENGINE_VERSION, type Belief } from "./types";

// ── The one genuine judgment call in v1: what counts as "drifting". ──────────
// Centralized so it can be tuned in ONE place — but NOT YET: tuning on n=1 is
// optimizing intuition, not evidence. These hold until outcome data accumulates.
const DRIFT = {
  oweColdAfterDays: 3, // an unanswered inbound this old is already cooling
  silentMedAfterDays: 10,
  silentHighAfterDays: 21,
  healthHotWithinDays: 7,
  healthWarmWithinDays: 21,
} as const;

export function isInbound(o: { eventType: string; facts: unknown }): boolean {
  const dir = (o.facts as { direction?: string } | null)?.direction;
  if (dir) return dir === "inbound";
  return /received|inbound|reply/i.test(o.eventType);
}
export function isOutbound(o: { eventType: string; facts: unknown }): boolean {
  const dir = (o.facts as { direction?: string } | null)?.direction;
  if (dir) return dir === "outbound";
  return /sent|outbound|call_made|emailed/i.test(o.eventType);
}

const DAY = 86_400_000;
const daysBetween = (a: number, b: number) => Math.floor((a - b) / DAY);

export interface EntityModel {
  engineVersion: string;
  computedAt: string; // ISO
  beliefs: Belief[]; // structured reasoning — presentation lives in the port
}

/**
 * Recompute the derived beliefs for one entity from its immutable observations.
 * Idempotent and side-effect-free except for writing the disposable Node.facts.model.
 * Returns the model it computed (empty beliefs if the entity has no memory yet).
 */
export async function computeV0(entityId: string, now: number = Date.now()): Promise<EntityModel | null> {
  const node = await prisma.node.findUnique({
    where: { id: entityId },
    select: { id: true, label: true, facts: true },
  });
  if (!node) return null;

  // Vendor + self exclusion: the Brain never reasons FROM its own predictions/
  // grades (sourceKind "brain"), only about real-world events. `recordedAt <= now`
  // makes replay honest — recomputing "as of" a past date sees only what was known
  // then. "Replay, never migrate."
  const obs = await prisma.observation.findMany({
    where: { nodeId: entityId, NOT: { sourceKind: "brain" }, recordedAt: { lte: new Date(now) } },
    orderBy: { recordedAt: "asc" },
    select: { id: true, eventType: true, text: true, facts: true, sourceKind: true, recordedAt: true },
  });

  const model: EntityModel = { engineVersion: BELIEF_ENGINE_VERSION, computedAt: new Date(now).toISOString(), beliefs: [] };

  if (obs.length === 0) {
    await writeModel(node.id, node.facts, model);
    return model;
  }

  const last = obs[obs.length - 1];
  const allIds = obs.map((o) => o.id);
  const daysSinceLast = daysBetween(now, new Date(last.recordedAt).getTime());

  const lastInbound = [...obs].reverse().find(isInbound) ?? null;
  const lastOutbound = [...obs].reverse().find(isOutbound) ?? null;
  const oweReply =
    !!lastInbound && (!lastOutbound || new Date(lastInbound.recordedAt) > new Date(lastOutbound.recordedAt));
  const daysOwed = lastInbound ? daysBetween(now, new Date(lastInbound.recordedAt).getTime()) : null;

  // Caveats that lower confidence honestly — surfaced as "alternatives considered".
  const thinEvidence = obs.length < 3 ? ["Only " + obs.length + " signal" + (obs.length === 1 ? "" : "s") + " remembered — low evidence."] : [];

  const base = (extra: Partial<Belief> = {}): Belief => ({
    kind: "relationship_health",
    claim: "",
    confidence: 0.5,
    evidenceRefs: allIds,
    contradictionRefs: [],
    counterConsiderations: [...thinEvidence],
    lastEvaluatedAt: new Date(now),
    engineVersion: BELIEF_ENGINE_VERSION,
    revisionHistory: [],
    ...extra,
  });

  // ── Belief: relationship health ─────────────────────────────────────────
  let healthConf = daysSinceLast <= DRIFT.healthHotWithinDays ? 0.85 : daysSinceLast <= DRIFT.healthWarmWithinDays ? 0.6 : 0.35;
  if (obs.length >= 3) healthConf = Math.min(0.95, healthConf + 0.05);
  model.beliefs.push(
    base({
      kind: "relationship_health",
      confidence: healthConf,
      claim:
        daysSinceLast <= DRIFT.healthHotWithinDays
          ? `The relationship is active — last exchange ${daysSinceLast === 0 ? "today" : `${daysSinceLast} days ago`}.`
          : daysSinceLast <= DRIFT.healthWarmWithinDays
            ? `The relationship is cooling — ${daysSinceLast} days since the last exchange.`
            : `The relationship has gone quiet — ${daysSinceLast} days of silence.`,
    }),
  );

  // ── Belief: risk of drift ───────────────────────────────────────────────
  let riskConf = 0.2;
  let riskClaim = `${node.label} is on a healthy cadence — last touch ${daysSinceLast} days ago.`;
  let evidence = [last.id];
  if (oweReply && daysOwed !== null && daysOwed >= DRIFT.oweColdAfterDays) {
    riskConf = Math.min(0.95, 0.7 + daysOwed * 0.01);
    riskClaim = `${node.label} is at elevated risk of disengaging — they reached out ${daysOwed} days ago and have had no reply.`;
    evidence = [lastInbound!.id];
  } else if (daysSinceLast >= DRIFT.silentHighAfterDays) {
    riskConf = 0.8;
    riskClaim = `${node.label} is at high risk of disengaging — ${daysSinceLast} days of total silence.`;
  } else if (daysSinceLast >= DRIFT.silentMedAfterDays) {
    riskConf = 0.55;
    riskClaim = `${node.label} may be starting to slip — ${daysSinceLast} days quiet.`;
  }
  model.beliefs.push(
    base({ kind: "relationship_drift_risk", confidence: riskConf, claim: riskClaim, evidenceRefs: evidence }),
  );

  await writeModel(node.id, node.facts, model);
  return model;
}

// Merge the model into Node.facts without disturbing other derived state.
async function writeModel(nodeId: string, existing: unknown, model: EntityModel): Promise<void> {
  const facts = (existing && typeof existing === "object" ? { ...(existing as object) } : {}) as Record<string, unknown>;
  facts.model = model;
  await prisma.node.update({ where: { id: nodeId }, data: { facts: facts as object } });
}
