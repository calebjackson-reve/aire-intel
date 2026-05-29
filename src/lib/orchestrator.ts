// Workflow Orchestrator — AIRE Platform
//
// One declarative tick that ties the intelligence layer together. It reacts to
// lead state changes by firing ordered, idempotent steps that reuse the executors
// already in the codebase (drip enrollments, contract milestones, Tasks,
// Notifications). It runs on the same dashboard-load trigger as advanceEnrollments().
//
// Design rules:
//   - CHEAP + DETERMINISTIC only. The orchestrator never calls the LLM or sends a
//     message. Expensive generation (revival drafts, follow-ups) stays explicitly
//     user-triggered via the approve queue. The orchestrator creates the Tasks/
//     Notifications and pauses drips that *prompt* that work.
//   - IDEMPOTENT. Every rule guards against double-firing — via a title marker on
//     Tasks, a recent-duplicate check on Notifications, or naturally (pausing an
//     already-paused drip is a no-op). Safe to run on every page load.
//
// Rules:
//   1. inbound_reply        — a lead replied → pause its active drips + notify.
//   2. under_contract       — lead went under contract → ensure a TC-handoff task.
//   3. high_sell_intent     — PropStream intel says likely-seller → ensure a touch task.

import { prisma } from "./prisma";
import { scoreSellIntent } from "./score-model";

const DAY_MS = 86_400_000;
const REPLY_WINDOW_DAYS = 3; // how far back an inbound counts as "just replied"

// Title markers make Task creation idempotent (no unique constraint on Task).
const MARKER = {
  tcHandoff: "[Orchestrator:tc_handoff]",
  sellIntent: "[Orchestrator:sell_intent]",
} as const;

export interface OrchestratorResult {
  dripsPaused: number;
  notified: number;
  tasksCreated: number;
  rules: Record<string, number>;
}

/**
 * Run one orchestration tick. Idempotent and side-effect-light; safe to call on
 * every dashboard load alongside advanceEnrollments().
 */
export async function runOrchestrator(): Promise<OrchestratorResult> {
  const result: OrchestratorResult = {
    dripsPaused: 0,
    notified: 0,
    tasksCreated: 0,
    rules: { inbound_reply: 0, under_contract: 0, high_sell_intent: 0 },
  };

  await Promise.all([
    ruleInboundReply(result),
    ruleUnderContract(result),
    ruleHighSellIntent(result),
  ]);

  return result;
}

// ── Rule 1: inbound reply → pause drips + notify ────────────────────────────
async function ruleInboundReply(result: OrchestratorResult) {
  const since = new Date(Date.now() - REPLY_WINDOW_DAYS * DAY_MS);

  // Which leads replied recently? (grouped — no large `in` binding)
  const recent = await prisma.contactLog.groupBy({
    by: ["leadId"],
    where: { direction: "inbound", createdAt: { gte: since } },
    _count: { id: true },
  });
  const repliedIds = recent.map((r) => r.leadId);
  if (repliedIds.length === 0) return;

  // Pause any still-active drips for those leads. Already-inactive = no-op (idempotent).
  const active = await prisma.smartPlanEnrollment.findMany({
    where: { active: true, leadId: { in: repliedIds.slice(0, 400) } },
    select: { id: true, leadId: true, lead: { select: { name: true } } },
  });

  for (const e of active) {
    await prisma.smartPlanEnrollment.update({
      where: { id: e.id },
      data: { active: false, nextStepAt: null },
    });
    result.dripsPaused++;
    result.rules.inbound_reply++;

    // Notify once per lead per window (dedupe on recent matching notification).
    const title = `${e.lead.name} replied — drip paused`;
    const dupe = await prisma.notification.findFirst({
      where: { type: "lead_reply", title, createdAt: { gte: since } },
      select: { id: true },
    });
    if (!dupe) {
      await prisma.notification.create({
        data: {
          type: "lead_reply",
          title,
          body: "Inbound reply detected. Automated drip paused so you can respond personally.",
          href: `/contacts/${e.leadId}`,
        },
      });
      result.notified++;
    }
  }
}

// ── Rule 2: under contract → ensure TC-handoff task ─────────────────────────
async function ruleUnderContract(result: OrchestratorResult) {
  const leads = await prisma.lead.findMany({
    where: { stage: "under_contract" },
    select: { id: true, name: true, closingDate: true },
    take: 200,
  });

  for (const lead of leads) {
    const exists = await prisma.task.findFirst({
      where: { leadId: lead.id, title: { contains: MARKER.tcHandoff } },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.task.create({
      data: {
        leadId: lead.id,
        title: `${MARKER.tcHandoff} Hand ${lead.name} to transaction coordination`,
        description: "Lead is under contract — confirm TC has the file, key dates, and contacts.",
        dueDate: new Date(),
        priority: "high",
      },
    });
    result.tasksCreated++;
    result.rules.under_contract++;
  }
}

// ── Rule 3: high sell-intent → ensure a soft-touch task ─────────────────────
async function ruleHighSellIntent(result: OrchestratorResult) {
  // Only leads that have PropStream intel can score "high" on property attributes.
  const intel = await prisma.propertyIntel.findMany({
    take: 300,
    include: {
      lead: { select: { id: true, name: true, type: true, timeline: true, stage: true } },
    },
  });
  if (intel.length === 0) return;

  // First-party inbound counts for these leads (grouped, no large `in`).
  const inboundRows = await prisma.contactLog.groupBy({
    by: ["leadId"],
    where: { direction: "inbound" },
    _count: { id: true },
  });
  const inboundByLead = new Map(inboundRows.map((r) => [r.leadId, r._count.id]));

  for (const pi of intel) {
    const lead = pi.lead;
    // Don't pester leads already deep in the pipeline.
    if (["under_contract", "closed"].includes(lead.stage)) continue;

    const score = scoreSellIntent({
      equityPct: pi.equityPct,
      ownershipYears: pi.ownershipYears,
      absentee: pi.absentee,
      preForeclosure: pi.preForeclosure,
      ownerOccupied: pi.ownerOccupied,
      type: lead.type,
      timeline: lead.timeline,
      inboundCount: inboundByLead.get(lead.id) ?? 0,
      daysSinceInbound: null,
    });
    if (score.level !== "high") continue;

    const exists = await prisma.task.findFirst({
      where: { leadId: lead.id, title: { contains: MARKER.sellIntent } },
      select: { id: true },
    });
    if (exists) continue;

    const reason = score.factors.slice(0, 3).map((f) => f.label).join(", ");
    await prisma.task.create({
      data: {
        leadId: lead.id,
        title: `${MARKER.sellIntent} Likely seller — reach out to ${lead.name}`,
        description: `Sell-intent ${score.score}/100 (${reason}). Draft a soft-touch message from the contact page.`,
        dueDate: new Date(),
        priority: "normal",
      },
    });
    result.tasksCreated++;
    result.rules.high_sell_intent++;
  }
}
