// Dead-Lead Revival — Proof Foundation (AIRE Platform)
//
// The #1 priority is PROVABLE results. Before any agent sends a single message,
// this module establishes (a) who counts as a "dead lead" and (b) the historical
// baseline revival rate that every later result is measured against.
//
// Dead lead (locked definition):
//   - stage is still new_lead or active (never progressed)
//   - created 90+ days ago
//   - ZERO inbound ContactLog ever (the lead never once replied)
//
// A "revived" lead is a previously-dead lead that later produced an inbound
// ContactLog OR advanced past `active` (showing / under_contract / closed).
//
// Used by: /api/revival/* and the proof dashboard card.

import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEAD_AGE_DAYS = 90;
const DEAD_STAGES = ["new_lead", "active"];

export interface DeadLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  pricePoint: number | null;
  source: string | null;
  type: string;
  createdAt: Date;
  lastContactDate: Date | null;
  ageDays: number;
}

/**
 * Returns the set of currently-dead leads: old, never-progressed, never replied.
 * These are the revival candidates — "found money" sitting in the database.
 */
export async function getDeadLeads(): Promise<DeadLead[]> {
  const cutoff = new Date(Date.now() - DEAD_AGE_DAYS * DAY_MS);

  // Candidates: right stage + old enough. Inbound filtering happens after, in one
  // grouped query, to avoid an N+1 of per-lead counts (mirrors the score route).
  const candidates = await prisma.lead.findMany({
    where: {
      stage: { in: DEAD_STAGES },
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      stage: true,
      pricePoint: true,
      source: true,
      type: true,
      createdAt: true,
      lastContactDate: true,
    },
  });
  if (candidates.length === 0) return [];

  const inboundByLead = await allInboundCounts();

  return candidates
    .filter((c) => (inboundByLead[c.id] ?? 0) === 0)
    .map((c) => ({
      ...c,
      ageDays: Math.floor((Date.now() - c.createdAt.getTime()) / DAY_MS),
    }));
}

/**
 * Historical baseline: of all leads that were EVER dead by our definition, what
 * fraction eventually revived (got an inbound reply or advanced past `active`)?
 *
 * This is the honest "do nothing" rate. A revival campaign only counts as a win
 * if its treatment arm beats this number (and its own holdout arm).
 */
export async function getRevivalBaseline(): Promise<{
  totalEverDead: number;
  revived: number;
  rate: number; // 0..1
}> {
  const cutoff = new Date(Date.now() - DEAD_AGE_DAYS * DAY_MS);

  // "Ever dead": old enough to have qualified, and currently/once in a dead stage.
  // We approximate the historical dead pool as every lead created 90+ days ago.
  // A lead that later closed but was once cold still counts as a revival.
  const aged = await prisma.lead.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, stage: true },
  });
  if (aged.length === 0) return { totalEverDead: 0, revived: 0, rate: 0 };

  const inboundByLead = await allInboundCounts();

  // Ever-dead = those that started with no inbound traction. We treat a lead as
  // part of the historical dead pool if it sits in a dead stage with no inbound,
  // OR advanced/closed (meaning it was eventually revived from a cold start).
  let totalEverDead = 0;
  let revived = 0;
  for (const l of aged) {
    const inbound = inboundByLead[l.id] ?? 0;
    const advanced = !DEAD_STAGES.includes(l.stage); // showing/under_contract/closed
    const wasDead = (DEAD_STAGES.includes(l.stage) && inbound === 0) || advanced;
    if (!wasDead) continue;
    totalEverDead++;
    if (inbound > 0 || advanced) revived++;
  }

  return {
    totalEverDead,
    revived,
    rate: totalEverDead === 0 ? 0 : revived / totalEverDead,
  };
}

/**
 * Live outcomes for a saved cohort. Joins the frozen leadIds back to current
 * ContactLog + Lead.stage to compute treatment-vs-holdout deltas for the
 * proof dashboard. A lead "replied" if it has any inbound log dated after the
 * cohort was created; "revived" if it also advanced past `active`.
 */
export async function getCohortOutcomes(cohortId: string) {
  const cohort = await prisma.revivalCohort.findUnique({ where: { id: cohortId } });
  if (!cohort) return null;

  const treatment = safeParseIds(cohort.leadIds);
  const holdout = safeParseIds(cohort.holdoutIds);

  const [treatmentStats, holdoutStats] = await Promise.all([
    armOutcomes(treatment, cohort.createdAt),
    armOutcomes(holdout, cohort.createdAt),
  ]);

  return {
    id: cohort.id,
    name: cohort.name,
    createdAt: cohort.createdAt,
    baselineRate: cohort.baselineRate ?? 0,
    treatment: treatmentStats,
    holdout: holdoutStats,
    // Lift = how much better treatment did than the holdout (true A/B delta).
    revivalLift: treatmentStats.revivalRate - holdoutStats.revivalRate,
  };
}

/** Per-arm reply / revival / recovered-pipeline tallies since a cutoff. */
async function armOutcomes(leadIds: string[], since: Date) {
  if (leadIds.length === 0) {
    return { count: 0, replied: 0, revived: 0, replyRate: 0, revivalRate: 0, recoveredPipeline: 0 };
  }

  const cohortSet = new Set(leadIds);
  const [inboundSince, leads] = await Promise.all([
    // Group all inbound-since rows (no large `in` binding), filter to cohort after.
    prisma.contactLog.groupBy({
      by: ["leadId"],
      where: { direction: "inbound", createdAt: { gte: since } },
      _count: { id: true },
    }),
    // Cohort leads fetched in id-chunks to stay under the SQLite param limit.
    findLeadsChunked(leadIds),
  ]);

  const repliedSet = new Set(
    inboundSince.filter((r) => r._count.id > 0 && cohortSet.has(r.leadId)).map((r) => r.leadId)
  );
  let replied = 0;
  let revived = 0;
  let recoveredPipeline = 0;
  for (const l of leads) {
    const didReply = repliedSet.has(l.id);
    const advanced = !DEAD_STAGES.includes(l.stage);
    if (didReply) replied++;
    if (didReply || advanced) {
      revived++;
      recoveredPipeline += l.pricePoint ?? 0;
    }
  }

  const count = leads.length;
  return {
    count,
    replied,
    revived,
    replyRate: count === 0 ? 0 : replied / count,
    revivalRate: count === 0 ? 0 : revived / count,
    recoveredPipeline,
  };
}

/**
 * Freeze the current dead-lead pool into an experiment cohort. ~holdoutPct of the
 * leads are randomly assigned to a holdout arm that receives NO outreach, giving a
 * clean A/B comparison. The historical baseline is captured at creation time.
 */
export async function createCohort(opts: {
  name?: string;
  holdoutPct?: number; // 0..1, default 0.2
} = {}) {
  const dead = await getDeadLeads();
  if (dead.length === 0) {
    return { error: "No dead leads found to enroll." as const };
  }

  const holdoutPct = opts.holdoutPct ?? 0.2;
  const shuffled = [...dead].sort(() => Math.random() - 0.5);
  const holdoutCount = Math.round(shuffled.length * holdoutPct);
  const holdout = shuffled.slice(0, holdoutCount).map((l) => l.id);
  const treatment = shuffled.slice(holdoutCount).map((l) => l.id);

  const baseline = await getRevivalBaseline();

  const cohort = await prisma.revivalCohort.create({
    data: {
      name: opts.name ?? `Revival ${new Date().toISOString().slice(0, 10)}`,
      leadIds: JSON.stringify(treatment),
      holdoutIds: JSON.stringify(holdout),
      baselineRate: baseline.rate,
    },
  });

  return {
    cohortId: cohort.id,
    name: cohort.name,
    treatmentCount: treatment.length,
    holdoutCount: holdout.length,
    baselineRate: baseline.rate,
  };
}

/**
 * Map of leadId → all-time inbound ContactLog count, for the WHOLE table.
 * One grouped query with no bound-parameter list (SQLite caps `in` lists), so
 * callers just look up their ids (absent = 0 inbound).
 */
async function allInboundCounts(): Promise<Record<string, number>> {
  const rows = await prisma.contactLog.groupBy({
    by: ["leadId"],
    where: { direction: "inbound" },
    _count: { id: true },
  });
  return Object.fromEntries(rows.map((r) => [r.leadId, r._count.id]));
}

/** Fetch leads by id in chunks to stay under SQLite's bound-parameter limit. */
async function findLeadsChunked(ids: string[]) {
  const CHUNK = 400;
  const out: { id: string; stage: string; pricePoint: number | null }[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const rows = await prisma.lead.findMany({
      where: { id: { in: slice } },
      select: { id: true, stage: true, pricePoint: true },
    });
    out.push(...rows);
  }
  return out;
}

function safeParseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
