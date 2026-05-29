// Lead Outcome Labeling — AIRE Platform
//
// Turns the full historical lead database into a labeled training set so the
// temperature model can LEARN from what actually closed vs. what died, instead
// of relying on hand-tuned weights.
//
// Labels:
//   won  — a deal closed for this lead (linked closed Deal, closed Dotloop loop,
//          or the lead reached stage "closed")
//   lost — dead by the locked definition: 90+ days old, stage still new_lead/
//          active, and ZERO inbound ContactLog ever, and not won
//   open — everything else (too young to judge, or actively in motion)
//
// Only won + lost are "resolved" and used for calibration. open is excluded.

import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEAD_AGE_DAYS = 90;
const DEAD_STAGES = ["new_lead", "active"];
const WON_LOOP_STATUSES = ["SOLD", "CLOSED", "LEASED"];

export type Outcome = "won" | "lost" | "open";

export interface LabeledLead {
  id: string;
  outcome: Outcome;
  // Raw feature values (bucketing happens in score-model.ts)
  stage: string;
  pricePoint: number | null;
  source: string | null;
  type: string;
  timeline: string | null;
  preApproved: boolean;
}

/**
 * Label every lead in the database. One pass, all aggregates fetched up front
 * (no N+1): closed-deal lead ids, won-loop lead ids, and all-time inbound counts.
 */
export async function labelLeads(): Promise<LabeledLead[]> {
  const leads = await prisma.lead.findMany({
    select: {
      id: true,
      stage: true,
      pricePoint: true,
      source: true,
      type: true,
      timeline: true,
      preApproved: true,
      createdAt: true,
    },
  });
  if (leads.length === 0) return [];

  // Full-history aggregation: query whole tables (no `in: ids` binding, which
  // blows the SQLite bound-parameter limit) and join in memory.
  const [closedDeals, wonLoops, inboundRows] = await Promise.all([
    prisma.deal.findMany({
      where: { status: "closed", leadId: { not: null } },
      select: { leadId: true },
    }),
    prisma.dotloopLoop.findMany({
      where: { status: { in: WON_LOOP_STATUSES }, leadId: { not: null } },
      select: { leadId: true },
    }),
    prisma.contactLog.groupBy({
      by: ["leadId"],
      where: { direction: "inbound" },
      _count: { id: true },
    }),
  ]);

  const wonByLead = new Set<string>();
  for (const d of closedDeals) if (d.leadId) wonByLead.add(d.leadId);
  for (const l of wonLoops) if (l.leadId) wonByLead.add(l.leadId);

  const inboundByLead = new Map<string, number>(
    inboundRows.map((r) => [r.leadId, r._count.id])
  );

  const cutoff = Date.now() - DEAD_AGE_DAYS * DAY_MS;

  return leads.map((l) => {
    const won = wonByLead.has(l.id) || l.stage === "closed";
    let outcome: Outcome;
    if (won) {
      outcome = "won";
    } else {
      const aged = l.createdAt.getTime() < cutoff;
      const inDeadStage = DEAD_STAGES.includes(l.stage);
      const noInbound = (inboundByLead.get(l.id) ?? 0) === 0;
      outcome = aged && inDeadStage && noInbound ? "lost" : "open";
    }
    return {
      id: l.id,
      outcome,
      stage: l.stage,
      pricePoint: l.pricePoint,
      source: l.source,
      type: l.type,
      timeline: l.timeline,
      preApproved: l.preApproved,
    };
  });
}

/** Quick counts for diagnostics / the recalibrate response. */
export function summarizeOutcomes(labeled: LabeledLead[]) {
  let won = 0;
  let lost = 0;
  let open = 0;
  for (const l of labeled) {
    if (l.outcome === "won") won++;
    else if (l.outcome === "lost") lost++;
    else open++;
  }
  return { total: labeled.length, won, lost, open, resolved: won + lost };
}
