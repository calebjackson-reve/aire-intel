// ─────────────────────────────────────────────────────────────────────────────
// The Brain — belief engine (Increment 1, layer 4): "Model → Reason".
//
// computeV0 is a PURE FUNCTION OF REMEMBERED HISTORY. It reads an entity's
// immutable Observations and derives two reproducible beliefs — Relationship
// Health and Risk-of-Drift — each with a confidence scalar (never shown raw) and
// provenance (the exact observations it was rebuilt from). The result is written
// to Node.facts.model, which is DISPOSABLE: drop it, replay observations, get it
// back. "Replay, never migrate."
//
// Vendor-blind: this file reads Observation rows ONLY. It never imports Lead,
// ContactLog, loftyId, or lastContactDate. Adapters translate vendor data into
// Observations upstream; the Brain never learns the source.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { bandOf, type ConfidenceBand, type Provenance } from "./types";

// ── The one genuine judgment call in v0: what counts as "drifting". ──────────
// These thresholds encode Caleb's cadence philosophy. They're centralized here
// so they can be tuned in one place after he sees the first thought land.
const DRIFT = {
  // An unanswered inbound this many days old is already a cooling relationship.
  oweColdAfterDays: 3,
  // No contact at all for this many days → drift risk regardless of who owes whom.
  silentMedAfterDays: 10,
  silentHighAfterDays: 21,
  // Health windows (days since the last interaction of any kind).
  healthHotWithinDays: 7,
  healthWarmWithinDays: 21,
} as const;

// Inbound = they reached toward Caleb. Vendor-blind: we read the normalized
// eventType / facts.direction an adapter set, never a vendor field.
function isInbound(o: { eventType: string; facts: unknown }): boolean {
  const dir = (o.facts as { direction?: string } | null)?.direction;
  if (dir) return dir === "inbound";
  return /received|inbound|reply/i.test(o.eventType);
}
function isOutbound(o: { eventType: string; facts: unknown }): boolean {
  const dir = (o.facts as { direction?: string } | null)?.direction;
  if (dir) return dir === "outbound";
  return /sent|outbound|call_made|emailed/i.test(o.eventType);
}

const DAY = 86_400_000;
const daysBetween = (a: number, b: number) => Math.floor((a - b) / DAY);

export interface DerivedBelief {
  band: ConfidenceBand;
  confidence: number; // internal scalar — never rendered as a number (P10)
  summary: string; // honest, references the real observed history
  provenance: Provenance;
}
export interface EntityModelV0 {
  version: 0;
  computedAt: string; // ISO
  health: DerivedBelief | null;
  riskOfDrift: DerivedBelief | null;
}

/**
 * Recompute the derived model for one entity from its immutable observations.
 * Idempotent and side-effect-free except for writing the disposable Node.facts.model.
 * Returns the model it computed (or null if the entity has no memory yet).
 */
export async function computeV0(entityId: string, now: number = Date.now()): Promise<EntityModelV0 | null> {
  const node = await prisma.node.findUnique({
    where: { id: entityId },
    select: { id: true, label: true, facts: true },
  });
  if (!node) return null;

  const obs = await prisma.observation.findMany({
    where: { nodeId: entityId },
    orderBy: { recordedAt: "asc" },
    select: { id: true, eventType: true, text: true, facts: true, sourceKind: true, recordedAt: true },
  });

  if (obs.length === 0) {
    await writeModel(node.id, node.facts, null);
    return null;
  }

  const last = obs[obs.length - 1];
  const daysSinceLast = daysBetween(now, new Date(last.recordedAt).getTime());
  const sourceLabels = [...new Set(obs.map((o) => o.sourceKind))];
  const allIds = obs.map((o) => o.id);

  const lastInbound = [...obs].reverse().find(isInbound) ?? null;
  const lastOutbound = [...obs].reverse().find(isOutbound) ?? null;
  // Caleb "owes" a reply when their last reach toward him has no later reach back.
  const oweReply =
    !!lastInbound &&
    (!lastOutbound || new Date(lastInbound.recordedAt) > new Date(lastOutbound.recordedAt));
  const daysOwed = lastInbound ? daysBetween(now, new Date(lastInbound.recordedAt).getTime()) : null;

  // ── Health: is this relationship warm right now? ────────────────────────
  let healthConf: number;
  if (daysSinceLast <= DRIFT.healthHotWithinDays) healthConf = 0.85;
  else if (daysSinceLast <= DRIFT.healthWarmWithinDays) healthConf = 0.6;
  else healthConf = 0.35;
  // More remembered touches = a sturdier read.
  if (obs.length >= 3) healthConf = Math.min(0.95, healthConf + 0.05);

  const health: DerivedBelief = {
    band: bandOf(healthConf),
    confidence: healthConf,
    summary:
      daysSinceLast <= DRIFT.healthHotWithinDays
        ? `Active — last exchange ${daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}.`
        : daysSinceLast <= DRIFT.healthWarmWithinDays
          ? `Warming down — ${daysSinceLast}d since the last exchange.`
          : `Gone quiet — ${daysSinceLast}d of silence.`,
    provenance: { observationIds: allIds, sourceLabels, asOf: new Date(now) },
  };

  // ── Risk of drift: is Caleb about to lose this relationship? ────────────
  let riskConf = 0.2;
  let riskWhy = `Cadence looks fine — ${daysSinceLast}d since the last touch.`;
  const evidenceIds: string[] = [];

  if (oweReply && daysOwed !== null && daysOwed >= DRIFT.oweColdAfterDays) {
    riskConf = Math.min(0.95, 0.7 + daysOwed * 0.01);
    const what = lastInbound!.text?.trim();
    riskWhy = `${node.label} reached out ${daysOwed}d ago and is still waiting on a reply${
      what ? ` — "${truncate(what, 80)}"` : ""
    }.`;
    evidenceIds.push(lastInbound!.id);
  } else if (daysSinceLast >= DRIFT.silentHighAfterDays) {
    riskConf = 0.8;
    riskWhy = `${daysSinceLast}d of total silence — well past your cadence.`;
    evidenceIds.push(last.id);
  } else if (daysSinceLast >= DRIFT.silentMedAfterDays) {
    riskConf = 0.55;
    riskWhy = `${daysSinceLast}d quiet — starting to slip.`;
    evidenceIds.push(last.id);
  }

  const riskOfDrift: DerivedBelief = {
    band: bandOf(riskConf),
    confidence: riskConf,
    summary: riskWhy,
    provenance: {
      observationIds: evidenceIds.length ? evidenceIds : [last.id],
      sourceLabels,
      asOf: new Date(now),
    },
  };

  const model: EntityModelV0 = {
    version: 0,
    computedAt: new Date(now).toISOString(),
    health,
    riskOfDrift,
  };
  await writeModel(node.id, node.facts, model);
  return model;
}

// Merge the model into Node.facts without disturbing other derived state.
async function writeModel(nodeId: string, existing: unknown, model: EntityModelV0 | null): Promise<void> {
  const facts = (existing && typeof existing === "object" ? { ...(existing as object) } : {}) as Record<
    string,
    unknown
  >;
  if (model) facts.model = model;
  else delete facts.model;
  await prisma.node.update({ where: { id: nodeId }, data: { facts: facts as object } });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
