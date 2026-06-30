// ─────────────────────────────────────────────────────────────────────────────
// The Brain — the Projector (Increment 1, layers 1–3).
//
// The SINGLE writer of the Brain's projection. Feature code never writes Nodes
// or Observations directly — it emits ObservationInputs here. The projector:
//   1. Remembers — upserts an immutable, deduped Observation (never deletes).
//   2. Entity graph — ensures the entities an observation concerns exist as Nodes.
//   3. Identity resolution — matches identities vendor-blind via EntityIdentity,
//      with no vendor branch, so a new channel resolves with no core change.
//
// Everything it writes is DISPOSABLE: drop every Node/EntityIdentity and the
// Brain rebuilds by replaying Observations. "Replay, never migrate."
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { computeV0 } from "./beliefs";
import { recordPredictions } from "./predictions";
import type { IdentityKey, ObservationInput } from "./types";

const DEFAULT_WORKSPACE = "default";

/**
 * Resolve a set of identities to a single entity Node id, vendor-blind.
 * Matches by ANY scheme via the EntityIdentity index (no leadId/phone/handle
 * branching). Creates the entity if none match; links every new identity so the
 * next signal on any channel resolves to the same entity. Merges on first match.
 *
 * `kind` is the entity kind to create if none exists (e.g. "Person").
 */
export async function resolveEntity(
  identities: IdentityKey[],
  opts: { kind?: string; label?: string; workspaceId?: string } = {},
): Promise<string> {
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE;
  const keys = normalizeIdentities(identities);
  if (keys.length === 0) throw new Error("resolveEntity: at least one identity is required");

  // A direct nodeId identity short-circuits resolution.
  const direct = keys.find((k) => k.scheme === "nodeId");
  if (direct) return direct.value;

  // 1. Try to match an existing entity by any identity key.
  const existing = await prisma.entityIdentity.findFirst({
    where: { OR: keys.map((k) => ({ scheme: k.scheme, value: k.value })) },
    select: { nodeId: true },
  });

  let nodeId: string;
  if (existing) {
    nodeId = existing.nodeId;
  } else {
    // 2. No match — create the entity Node.
    const node = await prisma.node.create({
      data: {
        kind: opts.kind ?? "Person",
        label: opts.label ?? keys[0].value,
        workspaceId,
      },
      select: { id: true },
    });
    nodeId = node.id;
  }

  // 3. Ensure every identity is linked to this entity (idempotent; never deletes).
  //    A scheme+value is globally unique, so concurrent links converge safely.
  await prisma.entityIdentity.createMany({
    data: keys.map((k) => ({ nodeId, scheme: k.scheme, value: k.value })),
    skipDuplicates: true,
  });

  return nodeId;
}

/**
 * Remember an observation — immutable and idempotent.
 * Deduped on (sourceKind, sourceRef): re-ingesting the same source row is a
 * no-op, so backfills and re-runs are safe. Observations are NEVER updated or
 * deleted; a correction is a new observation.
 *
 * Returns the entity id the observation was attached to.
 */
export async function ingest(input: ObservationInput): Promise<{ observationId: string; entityId: string }> {
  const entityId = await resolveEntity(input.identities, {
    kind: input.facts?.entityKind as string | undefined,
    label: input.facts?.entityLabel as string | undefined,
  });

  // Immutable upsert: create if new, leave untouched if already remembered.
  const existing = await prisma.observation.findUnique({
    where: { sourceKind_sourceRef: { sourceKind: input.sourceKind, sourceRef: input.sourceRef } },
    select: { id: true },
  });
  if (existing) return { observationId: existing.id, entityId };

  const obs = await prisma.observation.create({
    data: {
      nodeId: entityId,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      eventType: input.eventType,
      text: input.text,
      facts: (input.facts ?? {}) as object,
      confidence: input.confidence ?? 0.8,
      recordedAt: input.occurredAt,
      workspaceId: DEFAULT_WORKSPACE,
    },
    select: { id: true },
  });
  return { observationId: obs.id, entityId };
}

/**
 * Recompute the derived model for an entity from its immutable observations.
 * Layer 4 (belief derivation + computeV0 health/risk) lands here next; for now
 * this is the seam where the model layer is rebuilt — disposable by design.
 */
export async function recompute(entityId: string, now: number = Date.now()): Promise<void> {
  // Layer 4: derive beliefs into the disposable Node.facts.model, then REMEMBER
  // any falsifiable prediction the engine just asserted (immutable). `now` lets a
  // replay recompute "as of" a past date. A pure function of remembered history.
  const model = await computeV0(entityId, now);
  if (model) await recordPredictions(entityId, model, now);
}

// Identity hygiene: trim, lowercase emails, and namespace handles, so the same
// person on the same channel always produces the same key.
function normalizeIdentities(identities: IdentityKey[]): IdentityKey[] {
  const seen = new Set<string>();
  const out: IdentityKey[] = [];
  for (const id of identities) {
    if (!id?.value) continue;
    let value = String(id.value).trim();
    if (!value) continue;
    if (id.scheme === "email") value = value.toLowerCase();
    if (id.scheme === "phone") value = value.replace(/[^\d+]/g, "");
    const k = `${id.scheme}:${value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ scheme: id.scheme, value });
  }
  return out;
}
