// ─────────────────────────────────────────────────────────────────────────────
// The Brain — core contracts (Increment 1).
//
// Grounded in Book −1 (The Theory of The Brain) + Amendment I:
//   • Entities are the first primitive. An Entity is ANYTHING (a person, a
//     listing, a place, a rate, a file…), each a `kind` under one of ten primitives.
//   • Observations are immutable memory atoms; they CONNECT entities.
//   • Everything derived (Entities/models, Beliefs, scores) is DISPOSABLE —
//     rebuildable by replaying observations. "Replay, never migrate."
//   • Beliefs are reproducible: claim + confidence + evidence REFERENCES +
//     contradictions + last-evaluated + revision history.
//
// These are vendor-blind: no Lofty/CRM/Instagram concept appears here. Adapters
// translate vendor data into these shapes; the Brain never learns the source.
// ─────────────────────────────────────────────────────────────────────────────

// The ten primitives Amendment I freezes. Every entity kind lives under exactly one.
export const PRIMITIVES = [
  "People", "Projects", "Knowledge", "Time", "Money",
  "Health", "Places", "Media", "Goals", "Habits",
] as const;
export type Primitive = (typeof PRIMITIVES)[number];

// An entity kind is a subtype under one primitive (open set — extend freely,
// but every kind must name its primitive). Stored as Node.kind.
export const ENTITY_KIND_PRIMITIVE: Record<string, Primitive> = {
  Person: "People",
  Organization: "People",
  Listing: "Places",
  Property: "Places",
  Place: "Places",
  Neighborhood: "Places",
  Deal: "Projects",
  Document: "Knowledge",
  MarketSignal: "Knowledge",
  Rate: "Knowledge",
  Content: "Media",
  Belief: "Knowledge", // a belief is a derived model ABOUT something; see Belief below
};

// Identity is resolved vendor-blind: an entity is matched by ANY of these schemes
// with no vendor branch, so a new channel (handle-only) resolves with no core change.
export type IdentityScheme = "leadId" | "phone" | "email" | "handle" | "loftyId" | "nodeId";
export interface IdentityKey {
  scheme: IdentityScheme;
  value: string; // for "handle", value is "platform:handle" e.g. "instagram:sarah_b"
}

// The seven memory classes are SEMANTIC ROLES over one graph — not seven tables.
// A memory can play more than one role and relate to others.
export type MemoryRole =
  | "Observation" | "Experience" | "Knowledge"
  | "Belief" | "Decision" | "Outcome" | "Reflection";

// What an adapter EMITS. The projector turns this into an immutable Observation,
// resolving/creating the entities it concerns. Never mutated, never deleted.
export interface ObservationInput {
  sourceKind: string;   // vendor-blind origin label, e.g. "contact_log", "email", "manual"
  sourceRef: string;    // stable id from the source — the idempotency key (dedup)
  eventType: string;    // the interaction kind, e.g. "message_sent", "message_received", "showing"
  text: string;         // raw "what happened"
  occurredAt: Date;     // when it actually happened (not when ingested)
  identities: IdentityKey[]; // who/what this concerns — drives entity resolution
  confidence?: number;  // 0..1; default 0.8
  // direction / channel / location / artifact and any extracted facts ride here
  // (roles-not-tables: we do not spawn a table per field).
  facts?: Record<string, unknown>;
}

// A reproducible belief — Book −1's first guardrail. Evidence is held as
// REFERENCES into immutable memory so the Brain can replay it, never assert from
// authority. Persisted as a derived Node(kind="Belief"); fields live in facts.
export interface Belief {
  claim: string;
  confidence: number;            // internal scalar, NEVER shown to Caleb as a number
  evidenceRefs: string[];        // Observation ids supporting it
  contradictionRefs: string[];   // Observation ids cutting against it
  lastEvaluatedAt: Date;
  revisionHistory: Array<{ claim: string; confidence: number; changedAt: Date; reason: string }>;
}

// Confidence reaches Caleb as a band + behavior + provenance — never as a decimal (P10).
export type ConfidenceBand = "HIGH" | "MED" | "LOW";
export function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "HIGH";
  if (confidence >= 0.5) return "MED";
  return "LOW";
}

// Every derived claim carries provenance: the observations it was rebuilt from.
export interface Provenance {
  observationIds: string[];
  sourceLabels: string[]; // vendor-blind, e.g. "contact_log", "email"
  asOf: Date;
}
