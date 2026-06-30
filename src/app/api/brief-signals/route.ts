export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getRateAlert } from "@/lib/housing-intel";

/**
 * Mission Control brief signals — STRICTLY READ-ONLY.
 *
 * Mission Control is a read-only projection (Caleb OS Sprint 1). This route
 * composes the few TRUE signals the morning brief is allowed to show. It:
 *   - WRITES NOTHING (no second writer of "today's actions" — one-writer-per-fact)
 *   - never touches the action-queue table, the brief-assembler, or the
 *     daily-brief writer (read-only projection only)
 *   - is 5xx-proof: any upstream failure degrades to a null field, never a crash.
 *
 * Honesty rule (design constitution P10): only signals with a real source of
 * truth appear. "Hours returned" has NO source of truth and is intentionally
 * absent — the brief shows forward-leverage (move count) instead, in the UI.
 *
 * Clerk middleware gates this route automatically (user-facing).
 */
export async function GET() {
  const [rate, owe] = await Promise.all([safeRate(), safeOwe()]);
  return Response.json({ rate, owe });
}

// 30-yr mortgage rate — only surfaced when it ACTUALLY moved (|delta| >= 0.125%).
async function safeRate() {
  try {
    const alert = await getRateAlert();
    if (!alert.triggered) return null; // never fabricate a rate move
    return { message: alert.message, direction: alert.direction, delta: alert.delta };
  } catch {
    return null;
  }
}

// People who messaged Caleb in the last 2 days and haven't gotten a reply since.
// Derived from real ContactLog rows (direction inbound vs outbound). No SLA field
// exists, so the UI says "is waiting on a reply" — never an invented deadline.
async function safeOwe() {
  try {
    const since = new Date(Date.now() - 2 * 86_400_000);

    const inbound = await prisma.contactLog.findMany({
      where: { direction: "inbound", touchedAt: { gte: since } },
      orderBy: { touchedAt: "desc" },
      include: { lead: { select: { id: true, name: true, doNotContact: true } } },
    });
    if (inbound.length === 0) return null;

    // Most-recent inbound per lead (skip do-not-contact + orphaned logs).
    const latestInbound = new Map<string, { name: string; at: number }>();
    for (const log of inbound) {
      if (!log.lead || log.lead.doNotContact) continue;
      if (!latestInbound.has(log.leadId)) {
        latestInbound.set(log.leadId, { name: log.lead.name, at: new Date(log.touchedAt).getTime() });
      }
    }
    if (latestInbound.size === 0) return null;

    // Most-recent outbound per lead within the same window.
    const outbound = await prisma.contactLog.findMany({
      where: { direction: "outbound", leadId: { in: [...latestInbound.keys()] }, touchedAt: { gte: since } },
      orderBy: { touchedAt: "desc" },
      select: { leadId: true, touchedAt: true },
    });
    const latestOutbound = new Map<string, number>();
    for (const log of outbound) {
      if (!latestOutbound.has(log.leadId)) latestOutbound.set(log.leadId, new Date(log.touchedAt).getTime());
    }

    // Owed = inbound with no later outbound reply.
    const owed: string[] = [];
    for (const [leadId, { name, at }] of latestInbound) {
      const repliedAt = latestOutbound.get(leadId);
      if (!repliedAt || repliedAt < at) owed.push(name);
    }
    if (owed.length === 0) return null;

    const firstNames = owed.map((n) => n.split(" ")[0]).filter(Boolean);
    return { count: owed.length, names: firstNames.slice(0, 3) };
  } catch {
    return null;
  }
}
