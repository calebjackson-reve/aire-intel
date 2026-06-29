export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";
import { logError } from "@/lib/error-memory";

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity Detector — runs daily at 8:00 AM CT via Vercel cron
//
// Signals detected:
//   1. hot_window      — 3+ ContactLog entries in last 7d, no outbound contact in 7d
//   2. fsbo_timing     — FSBO source, lastContactDate at 30 / 60 / 90 day windows
//   3. stale_active    — stage=active, no contact in 14+ days
//   4. closing_nudge   — under_contract, closingDate within 7 days
//   5. win_back        — closed leads, closing anniversary within 30 days
// ─────────────────────────────────────────────────────────────────────────────

export type OpportunitySignal =
  | "hot_window"
  | "fsbo_timing"
  | "stale_active"
  | "closing_nudge"
  | "win_back";

export interface DetectedOpportunity {
  signalType: OpportunitySignal;
  leadId: string;
  leadName: string;
  stage: string;
  recommendedAction: string;
  urgencyLabel: string;
  detail: string;
  actionQueueId?: string;
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runDetector();
}

// GET available for manual/cron trigger — guarded by cron secret
export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  // Support ?query=true to return today's detected opportunities without re-running
  const url = new URL(request.url);
  if (url.searchParams.get("query") === "true") {
    return getOpportunities();
  }
  return runDetector();
}

// ─── Jarvis tool handler — called from /api/chat executeTool ─────────────────
export async function getOpportunities(): Promise<Response> {
  const today = getTodayCT();
  const items = await prisma.actionQueue.findMany({
    where: {
      agentType: "opportunity_detector",
      briefDate: today,
      status: "pending",
    },
    include: { lead: { select: { id: true, name: true, stage: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 20,
  });

  if (!items.length) {
    return Response.json({ ok: true, opportunities: [], message: "No opportunities detected today." });
  }

  const opportunities = items.map((item) => {
    const payload = item.payload as Record<string, unknown>;
    return {
      id: item.id,
      signalType: payload.signalType as string,
      leadId: item.leadId,
      leadName: item.lead?.name ?? (payload.leadName as string) ?? "Unknown",
      stage: item.lead?.stage ?? (payload.stage as string) ?? "",
      recommendedAction: payload.recommendedAction as string,
      urgencyLabel: payload.urgencyLabel as string,
      detail: payload.detail as string,
      priority: item.priority,
      createdAt: item.createdAt,
    };
  });

  return Response.json({ ok: true, count: opportunities.length, opportunities });
}

// ─── Main detection pass ──────────────────────────────────────────────────────
async function runDetector() {
  const runId = await startRun("opportunity_detector");
  const today = getTodayCT();
  const errors: unknown[] = [];
  let itemsProcessed = 0;
  let actionsQueued = 0;

  try {
    const now = new Date();
    const results: DetectedOpportunity[] = [];

    // ── 1. Hot window leads ──────────────────────────────────────────────────
    // 3+ ContactLog entries in last 7d (any direction) but no OUTBOUND contact
    // in the same window — they're active but you haven't reached out.
    try {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

      // Leads with 3+ contact log entries in last 7 days
      const frequentContacts = await prisma.contactLog.groupBy({
        by: ["leadId"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { id: true },
        having: { id: { _count: { gte: 3 } } },
      });

      for (const entry of frequentContacts) {
        itemsProcessed++;
        // Check that no outbound contact happened in the window
        const outboundCount = await prisma.contactLog.count({
          where: {
            leadId: entry.leadId,
            direction: "outbound",
            createdAt: { gte: sevenDaysAgo },
          },
        });
        if (outboundCount > 0) continue;

        const lead = await prisma.lead.findUnique({
          where: { id: entry.leadId },
          select: { id: true, name: true, stage: true, phone: true, email: true },
        });
        if (!lead) continue;

        // Idempotency: don't create duplicate items for today
        const existing = await prisma.actionQueue.findFirst({
          where: { leadId: lead.id, agentType: "opportunity_detector", briefDate: today, status: "pending" },
        });
        if (existing) continue;

        const opp: DetectedOpportunity = {
          signalType: "hot_window",
          leadId: lead.id,
          leadName: lead.name,
          stage: lead.stage,
          recommendedAction: "Reach out now — high inbound activity with no outbound response.",
          urgencyLabel: "Hot",
          detail: `${entry._count.id} contact log entries in the last 7 days but zero outbound from you.`,
        };

        const aqItem = await prisma.actionQueue.create({
          data: {
            type: "follow_up_text",
            agentType: "opportunity_detector",
            leadId: lead.id,
            priority: 1,
            briefDate: today,
            requiresApproval: true,
            payload: {
              ...opp,
              stage: lead.stage,
              phone: lead.phone,
              email: lead.email,
              contactCount: entry._count.id,
            },
          },
        });
        opp.actionQueueId = aqItem.id;
        results.push(opp);
        actionsQueued++;
      }
    } catch (err) {
      errors.push({ signal: "hot_window", error: String(err) });
      await logError("api_failure", "opportunity-detector/hot-window", err);
    }

    // ── 2. FSBO timing windows ───────────────────────────────────────────────
    // FSBO sellers go stale on their own listing at 30, 60, and 90 days.
    // These are the highest-probability re-engagement windows.
    try {
      const fsboBuckets = [
        { days: 30, label: "30-day", urgency: "High" },
        { days: 60, label: "60-day", urgency: "Urgent" },
        { days: 90, label: "90-day", urgency: "Urgent" },
      ];

      for (const bucket of fsboBuckets) {
        const windowStart = new Date(now.getTime() - (bucket.days + 3) * 86400000);
        const windowEnd = new Date(now.getTime() - (bucket.days - 3) * 86400000);

        const leads = await prisma.lead.findMany({
          where: {
            source: { contains: "fsbo", mode: "insensitive" },
            lastContactDate: { gte: windowStart, lte: windowEnd },
            stage: { notIn: ["closed", "dead"] },
          },
          select: { id: true, name: true, stage: true, lastContactDate: true, phone: true, email: true, address: true },
        });

        for (const lead of leads) {
          itemsProcessed++;
          const existing = await prisma.actionQueue.findFirst({
            where: { leadId: lead.id, agentType: "opportunity_detector", briefDate: today, status: "pending" },
          });
          if (existing) continue;

          const daysSince = Math.floor((now.getTime() - (lead.lastContactDate?.getTime() ?? 0)) / 86400000);
          const opp: DetectedOpportunity = {
            signalType: "fsbo_timing",
            leadId: lead.id,
            leadName: lead.name,
            stage: lead.stage,
            recommendedAction: `${bucket.label} FSBO re-engagement — sellers at this window often shift to listing-ready.`,
            urgencyLabel: bucket.urgency,
            detail: `FSBO lead — last contacted ${daysSince} days ago. Prime conversion window.`,
          };

          const aqItem = await prisma.actionQueue.create({
            data: {
              type: "follow_up_text",
              agentType: "opportunity_detector",
              leadId: lead.id,
              priority: bucket.days === 30 ? 2 : 1,
              briefDate: today,
              requiresApproval: true,
              payload: {
                ...opp,
                phone: lead.phone,
                email: lead.email,
                address: lead.address,
                daysSinceContact: daysSince,
                fsboBucket: bucket.label,
              },
            },
          });
          opp.actionQueueId = aqItem.id;
          results.push(opp);
          actionsQueued++;
        }
      }
    } catch (err) {
      errors.push({ signal: "fsbo_timing", error: String(err) });
      await logError("api_failure", "opportunity-detector/fsbo-timing", err);
    }

    // ── 3. Stale actives ─────────────────────────────────────────────────────
    // stage=active with no contact in 14+ days — pipeline rot.
    try {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

      const staleLeads = await prisma.lead.findMany({
        where: {
          stage: "active",
          OR: [
            { lastContactDate: null },
            { lastContactDate: { lt: fourteenDaysAgo } },
          ],
        },
        select: { id: true, name: true, stage: true, lastContactDate: true, phone: true, email: true, pricePoint: true },
        orderBy: [{ lastContactDate: "asc" }],
        take: 25,
      });

      for (const lead of staleLeads) {
        itemsProcessed++;
        const existing = await prisma.actionQueue.findFirst({
          where: { leadId: lead.id, agentType: "opportunity_detector", briefDate: today, status: "pending" },
        });
        if (existing) continue;

        const daysSince = lead.lastContactDate
          ? Math.floor((now.getTime() - lead.lastContactDate.getTime()) / 86400000)
          : null;

        const opp: DetectedOpportunity = {
          signalType: "stale_active",
          leadId: lead.id,
          leadName: lead.name,
          stage: lead.stage,
          recommendedAction: "Re-engage before this lead goes cold — check in with a personal touch.",
          urgencyLabel: daysSince && daysSince >= 30 ? "Urgent" : "High",
          detail: daysSince !== null
            ? `Active lead with no contact in ${daysSince} days.`
            : "Active lead — never contacted.",
        };

        const aqItem = await prisma.actionQueue.create({
          data: {
            type: "follow_up_text",
            agentType: "opportunity_detector",
            leadId: lead.id,
            priority: daysSince && daysSince >= 30 ? 1 : 2,
            briefDate: today,
            requiresApproval: true,
            payload: {
              ...opp,
              phone: lead.phone,
              email: lead.email,
              pricePoint: lead.pricePoint,
              daysSinceContact: daysSince,
            },
          },
        });
        opp.actionQueueId = aqItem.id;
        results.push(opp);
        actionsQueued++;
      }
    } catch (err) {
      errors.push({ signal: "stale_active", error: String(err) });
      await logError("api_failure", "opportunity-detector/stale-active", err);
    }

    // ── 4. Closing momentum nudge ────────────────────────────────────────────
    // under_contract leads with closingDate in next 7 days — send pre-closing
    // checklist nudge if ActionQueue doesn't already have one from today.
    try {
      const in7Days = new Date(now.getTime() + 7 * 86400000);

      const closingLeads = await prisma.lead.findMany({
        where: {
          stage: "under_contract",
          closingDate: { gte: now, lte: in7Days },
        },
        select: { id: true, name: true, stage: true, closingDate: true, phone: true, email: true, address: true },
      });

      for (const lead of closingLeads) {
        itemsProcessed++;
        const existing = await prisma.actionQueue.findFirst({
          where: { leadId: lead.id, agentType: "opportunity_detector", briefDate: today, status: "pending" },
        });
        if (existing) continue;

        const daysToClose = Math.ceil((lead.closingDate!.getTime() - now.getTime()) / 86400000);
        const isToday = daysToClose <= 1;

        const opp: DetectedOpportunity = {
          signalType: "closing_nudge",
          leadId: lead.id,
          leadName: lead.name,
          stage: lead.stage,
          recommendedAction: isToday
            ? "Closing today — confirm wire, ID, and title company logistics."
            : `Closing in ${daysToClose} days — send pre-closing checklist (ID, wire, walkthrough).`,
          urgencyLabel: isToday ? "Closing Today" : daysToClose <= 3 ? "Urgent" : "High",
          detail: `Closing ${isToday ? "today" : `in ${daysToClose} days`} on ${lead.address ?? "property"}.`,
        };

        const aqItem = await prisma.actionQueue.create({
          data: {
            type: "send_client_email",
            agentType: "opportunity_detector",
            leadId: lead.id,
            priority: isToday ? 1 : daysToClose <= 3 ? 1 : 2,
            briefDate: today,
            requiresApproval: true,
            payload: {
              ...opp,
              phone: lead.phone,
              email: lead.email,
              address: lead.address,
              closingDate: lead.closingDate?.toISOString(),
              daysToClose,
              checklist: [
                "Government-issued photo ID",
                "Wire confirmation / cashier's check",
                "Final walkthrough completed",
                "Utility transfer scheduled",
                "Keys / garage openers from seller",
              ],
            },
          },
        });
        opp.actionQueueId = aqItem.id;
        results.push(opp);
        actionsQueued++;
      }
    } catch (err) {
      errors.push({ signal: "closing_nudge", error: String(err) });
      await logError("api_failure", "opportunity-detector/closing-nudge", err);
    }

    // ── 5. Win-back — closing anniversary ────────────────────────────────────
    // Leads with stage=closed whose closingDate anniversary falls within 30 days.
    // Referral generation window — personal check-in or market update.
    try {
      const closedLeads = await prisma.lead.findMany({
        where: { stage: "closed", closingDate: { not: null } },
        select: { id: true, name: true, stage: true, closingDate: true, phone: true, email: true, address: true },
      });

      for (const lead of closedLeads) {
        itemsProcessed++;
        if (!lead.closingDate) continue;

        // Calculate this year's anniversary date
        const anniversary = new Date(lead.closingDate);
        anniversary.setFullYear(now.getFullYear());
        // If this year's date already passed, look at next year
        if (anniversary < now) anniversary.setFullYear(now.getFullYear() + 1);

        const daysToAnniversary = Math.ceil((anniversary.getTime() - now.getTime()) / 86400000);
        if (daysToAnniversary > 30) continue;

        const existing = await prisma.actionQueue.findFirst({
          where: { leadId: lead.id, agentType: "opportunity_detector", briefDate: today, status: "pending" },
        });
        if (existing) continue;

        const yearsOwned = now.getFullYear() - lead.closingDate.getFullYear();
        const isToday = daysToAnniversary <= 1;

        const opp: DetectedOpportunity = {
          signalType: "win_back",
          leadId: lead.id,
          leadName: lead.name,
          stage: lead.stage,
          recommendedAction: isToday
            ? `Closing anniversary — today is year ${yearsOwned}. Personal check-in for referrals.`
            : `Closing anniversary in ${daysToAnniversary} days (year ${yearsOwned}). Queue a personal touch.`,
          urgencyLabel: isToday ? "Today" : daysToAnniversary <= 7 ? "High" : "Normal",
          detail: `Closed ${lead.address ?? "property"} ${yearsOwned} year${yearsOwned !== 1 ? "s" : ""} ago. Anniversary ${isToday ? "today" : `in ${daysToAnniversary} days`}.`,
        };

        const aqItem = await prisma.actionQueue.create({
          data: {
            type: "follow_up_text",
            agentType: "opportunity_detector",
            leadId: lead.id,
            priority: isToday ? 2 : daysToAnniversary <= 7 ? 3 : 4,
            briefDate: today,
            requiresApproval: true,
            payload: {
              ...opp,
              phone: lead.phone,
              email: lead.email,
              address: lead.address,
              closingDate: lead.closingDate.toISOString(),
              yearsOwned,
              anniversaryDate: anniversary.toISOString(),
              daysToAnniversary,
            },
          },
        });
        opp.actionQueueId = aqItem.id;
        results.push(opp);
        actionsQueued++;
      }
    } catch (err) {
      errors.push({ signal: "win_back", error: String(err) });
      await logError("api_failure", "opportunity-detector/win-back", err);
    }

    // ── Notification: surface total count in dashboard ────────────────────────
    if (results.length > 0) {
      const urgentCount = results.filter((r) =>
        ["Hot", "Urgent", "Closing Today", "Today"].includes(r.urgencyLabel)
      ).length;

      await prisma.notification.create({
        data: {
          type: "task_due",
          title: `${results.length} opportunit${results.length === 1 ? "y" : "ies"} detected today`,
          body: urgentCount > 0
            ? `${urgentCount} urgent signal${urgentCount !== 1 ? "s" : ""} require immediate attention.`
            : "Review your opportunity queue in Jarvis.",
          href: "/pipeline",
        },
      });
    }

    await finishRun(runId, { itemsProcessed, actionsQueued, errorLog: errors });

    return Response.json({
      ok: true,
      runId,
      date: today,
      itemsProcessed,
      actionsQueued,
      signalBreakdown: {
        hot_window: results.filter((r) => r.signalType === "hot_window").length,
        fsbo_timing: results.filter((r) => r.signalType === "fsbo_timing").length,
        stale_active: results.filter((r) => r.signalType === "stale_active").length,
        closing_nudge: results.filter((r) => r.signalType === "closing_nudge").length,
        win_back: results.filter((r) => r.signalType === "win_back").length,
      },
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
