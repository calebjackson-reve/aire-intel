// ─────────────────────────────────────────────────────────────────────────────
// Adapter — Lofty/CRM ContactLog → vendor-blind Observation. "Where vendor ugliness dies."
//
// This is the ONLY module that knows ContactLog/Lead shapes. It translates a
// vendor row into a canonical ObservationInput and hands it to the projector.
// Everything downstream (engine, port, UI) is vendor-blind. Observations are
// immutable — this adapter NEVER mutates them; it only produces clean inputs.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { ingest } from "../projector";
import type { IdentityKey, ObservationInput } from "../types";

type LeadLike = { id: string; name: string; email: string | null; phone: string | null };
type LogLike = {
  id: string;
  externalId: string | null;
  method: string;
  platform: string | null;
  note: string | null;
  direction: string;
  touchedAt: Date;
};

// Strip vendor-import boilerplate so the Brain remembers content, not migration
// noise. (e.g. "[Lofty#123] Notes: Last Assigned: …" → "").
function cleanNote(note: string | null): string {
  if (!note) return "";
  return note
    .replace(/\[Lofty#\d+\]/gi, "")
    .replace(/<[^>]+>/g, " ") // strip stray HTML from imports
    .replace(/&nbsp;/gi, " ")
    .replace(/Notes:\s*Last Assigned:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function contactLogToObservation(lead: LeadLike, log: LogLike): ObservationInput {
  const identities: IdentityKey[] = [{ scheme: "leadId", value: lead.id }];
  if (lead.email) identities.push({ scheme: "email", value: lead.email });
  if (lead.phone) identities.push({ scheme: "phone", value: lead.phone });

  const clean = cleanNote(log.note);
  return {
    sourceKind: "contact_log",
    sourceRef: log.externalId ?? log.id, // idempotency key — re-ingest is a no-op
    eventType: log.direction === "inbound" ? "message_received" : "message_sent",
    text: clean || `${log.method} (${log.direction})`,
    occurredAt: new Date(log.touchedAt),
    identities,
    facts: { direction: log.direction, method: log.method, platform: log.platform, entityKind: "Person", entityLabel: lead.name },
  };
}

/**
 * Continuous ingest, per lead: translate every ContactLog into an immutable
 * Observation through the projector (which dedups and recomputes beliefs). Safe to
 * re-run — already-remembered logs are no-ops. Returns the resolved entity id.
 */
export async function ingestContactLogsForLead(leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { timeline_logs: { orderBy: { touchedAt: "asc" } } },
  });
  if (!lead) return null;

  let entityId: string | null = null;
  for (const log of lead.timeline_logs) {
    const { entityId: eid } = await ingest(contactLogToObservation(lead, log));
    entityId = eid;
  }
  return entityId;
}
