// ─────────────────────────────────────────────────────────────────────────────
// The Brain's first thought — end-to-end vertical slice (Increment 1).
//
// Observe → Remember → Model → Reason → Present, on REAL data, vendor-blind.
//
//   1. Observe   — read a real Lead + its real ContactLogs from the dev DB.
//   2. (adapter) — translate vendor rows into vendor-blind ObservationInputs.
//   3. Remember  — projector.ingest() writes immutable, deduped Observations.
//   4. Model     — projector.recompute() derives Health + Risk-of-Drift beliefs.
//   5. Present   — the consumer port surfaces the derived intelligence.
//
// Run: npx tsx scripts/brain-first-thought.ts            (uses the at-risk lead it finds)
//      npx tsx scripts/brain-first-thought.ts <leadId>   (pin a specific lead)
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { ingest, recompute } from "@/lib/brain/projector";
import { relationshipIntelligence } from "@/lib/brain/intelligence";
import type { IdentityKey, ObservationInput } from "@/lib/brain/types";

// ── The adapter: vendor ContactLog → vendor-blind ObservationInput. ──────────
// This is the ONLY place that knows about Lofty/ContactLog shapes. Everything
// downstream is vendor-blind.
function logToObservation(
  lead: { id: string; name: string; email: string | null; phone: string | null },
  log: { id: string; externalId: string | null; method: string; platform: string | null; note: string | null; direction: string; touchedAt: Date },
): ObservationInput {
  const identities: IdentityKey[] = [{ scheme: "leadId", value: lead.id }];
  if (lead.email) identities.push({ scheme: "email", value: lead.email });
  if (lead.phone) identities.push({ scheme: "phone", value: lead.phone });

  return {
    sourceKind: "contact_log",
    sourceRef: log.externalId ?? log.id, // idempotency key — re-runs are no-ops
    eventType: log.direction === "inbound" ? "message_received" : "message_sent",
    text: log.note ?? `${log.method} (${log.direction})`,
    occurredAt: new Date(log.touchedAt),
    identities,
    facts: { direction: log.direction, method: log.method, platform: log.platform, entityKind: "Person", entityLabel: lead.name },
  };
}

async function pickLead(argId?: string) {
  if (argId) {
    return prisma.lead.findUnique({ where: { id: argId }, include: { timeline_logs: { orderBy: { touchedAt: "asc" } } } });
  }
  // Prefer a real lead whose most recent touch was INBOUND and is old — the most
  // compelling "first thought": someone reached out and is still waiting.
  const withInbound = await prisma.lead.findMany({
    where: { timeline_logs: { some: { direction: "inbound" } } },
    include: { timeline_logs: { orderBy: { touchedAt: "asc" } } },
    take: 50,
  });
  const owed = withInbound
    .filter((l) => l.timeline_logs.length > 0 && l.timeline_logs[l.timeline_logs.length - 1].direction === "inbound")
    .sort((a, b) => +a.timeline_logs[a.timeline_logs.length - 1].touchedAt - +b.timeline_logs[b.timeline_logs.length - 1].touchedAt);
  if (owed[0]) return owed[0];

  // Fallback: oldest-contacted lead that has any logs at all.
  return prisma.lead.findFirst({
    where: { timeline_logs: { some: {} } },
    orderBy: { lastContactDate: "asc" },
    include: { timeline_logs: { orderBy: { touchedAt: "asc" } } },
  });
}

async function main() {
  const argId = process.argv[2];
  const lead = await pickLead(argId);
  if (!lead || lead.timeline_logs.length === 0) {
    console.error("No real lead with contact logs found in the dev DB. Pass a leadId.");
    process.exit(1);
  }

  console.log("━━━ 1. OBSERVE (real vendor data) ━━━");
  console.log(`   Lead: ${lead.name}  (${lead.timeline_logs.length} contact logs)`);
  for (const l of lead.timeline_logs.slice(-4)) {
    console.log(`     • ${new Date(l.touchedAt).toISOString().slice(0, 10)}  ${l.direction.padEnd(8)} ${l.method}: ${(l.note ?? "").slice(0, 60)}`);
  }

  console.log("\n━━━ 2–3. REMEMBER (adapter → immutable Observations) ━━━");
  let entityId = "";
  for (const log of lead.timeline_logs) {
    const obsInput = logToObservation(lead, log);
    const { observationId, entityId: eid } = await ingest(obsInput);
    entityId = eid;
    console.log(`   ✓ remembered ${obsInput.eventType.padEnd(17)} → obs ${observationId.slice(0, 8)}  entity ${eid.slice(0, 8)}`);
  }

  console.log("\n━━━ 4. MODEL → REASON (belief engine) ━━━");
  await recompute(entityId);
  const node = await prisma.node.findUnique({ where: { id: entityId }, select: { kind: true, label: true } });
  console.log(`   ✓ recomputed model for ${node?.kind} "${node?.label}"`);

  console.log("\n━━━ 5. PRESENT (consumer port — the only UI read path) ━━━");
  const one = await relationshipIntelligence.forPerson(entityId);
  console.log("   forPerson():");
  console.log(`     health      [${one?.health?.band}]  ${one?.health?.summary}`);
  console.log(`     riskOfDrift [${one?.riskOfDrift?.band}]  ${one?.riskOfDrift?.summary}`);
  console.log(`     provenance  ${one?.riskOfDrift?.provenance.observationIds.length} obs from [${one?.riskOfDrift?.provenance.sourceLabels.join(", ")}]`);

  const atRisk = await relationshipIntelligence.atRiskOfDrift({ minBand: "MED", limit: 5 });
  console.log(`\n   atRiskOfDrift(): ${atRisk.length} entit${atRisk.length === 1 ? "y" : "ies"} the Brain flags`);
  for (const r of atRisk) console.log(`     • [${r.riskOfDrift?.band}] ${r.label} — ${r.riskOfDrift?.summary}`);

  console.log("\n✅ Loop closed: real Observation → visible recommendation.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
