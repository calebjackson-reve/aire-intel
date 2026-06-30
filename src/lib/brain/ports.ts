// ─────────────────────────────────────────────────────────────────────────────
// The Brain — consumer port (Increment 1).
//
// The ONLY read path the UI may use. Surfaces NEVER touch ContactLog / Lead /
// loftyId / lastContactDate — they read the Brain's derived models through here.
// This keeps the Brain vendor-blind and lets the model layer be rebuilt freely
// (disposable) without changing a single surface.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConfidenceBand, Provenance } from "./types";

// One belief as a surface sees it. The PORT (not the engine) chose the band from
// the belief's confidence scalar; `summary` is the engine's claim verbatim;
// `counterConsiderations` are the alternatives it weighed (the "Why?" panel);
// provenance is the observations it was rebuilt from — one tap away.
export interface SurfacedBelief {
  band: ConfidenceBand; // presentation, decided here — never by the engine
  summary: string; // the belief's claim
  counterConsiderations: string[];
  provenance: Provenance;
}

// What a surface sees about an entity's relationship state. Derived, never raw.
// Confidence is a BAND, never a number (P10). `engineVersion` lets the UI attribute
// the reasoning (and lets us compare engine generations later).
export interface RelationshipIntelligence {
  entityId: string;
  label: string;
  engineVersion: string | null;
  health: SurfacedBelief | null;
  riskOfDrift: SurfacedBelief | null;
}

export interface AtRiskQuery {
  minBand?: ConfidenceBand;
  limit?: number;
  workspaceId?: string;
}

// The port contract. The going-cold lens (Sprint 1's deferred workflow) will
// consume `atRiskOfDrift` ONLY — never a days-since-lastContactDate query.
export interface RelationshipIntelligencePort {
  forPerson(entityId: string): Promise<RelationshipIntelligence | null>;
  atRiskOfDrift(query?: AtRiskQuery): Promise<RelationshipIntelligence[]>;
}

// v0 implementation lands in layer 4 (belief derivation): it will read the
// computed Health / Risk-of-Drift beliefs off each Person Node's derived model
// and map them to bands + provenance. Declared now so surfaces can be written
// against the contract while the engine fills in beneath it.
