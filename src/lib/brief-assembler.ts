// Morning Brief Assembler — pure assembly logic, no delivery side effects
// Reads all overnight agent outputs + DB state, builds 5 ranked sections,
// generates the SMS summary via Claude Haiku, upserts the DailyBrief record.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { getTodayCT } from "./brief-date";
import { getMortgageRate } from "./housing-intel";
import { buildCMASummary } from "./rentcast";
import {
  fetchRateSubagent,
  fetchMarketSubagent,
  fetchCalendarSubagent,
  fetchZillowSubagent,
  fetchLeadActivitySubagent,
} from "./brief-subagents";

export interface BriefItem {
  actionQueueId?: string;
  type: string;
  title: string;
  subtitle?: string;
  preview?: string;
  leadId?: string;
  leadName?: string;
  dueDate?: string;
  priority?: number;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export interface AssembledBrief {
  date: string;
  nonNegotiables: BriefItem[];
  goingCold: BriefItem[];
  owePeople: BriefItem[];
  contentQueued: BriefItem[];
  marketMovement: BriefItem[];
  smsSummary: string;
  agentRunId?: string;
}

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** Assemble today's Morning Brief from all overnight agent outputs. */
export async function assembleBrief(agentRunId?: string): Promise<AssembledBrief> {
  const today = getTodayCT();

  // ── 0. Parallel sub-agent fetch (each isolated, never throws) ─────────────
  const [rateResult, marketResult, calendarResult, zillowResult, leadsResult] =
    await Promise.allSettled([
      fetchRateSubagent(),
      fetchMarketSubagent("70808"),
      fetchCalendarSubagent(),
      fetchZillowSubagent(),
      fetchLeadActivitySubagent(),
    ]);

  // ── 1. Today's ActionQueue items ───────────────────────────────────────────
  const queueItems = await prisma.actionQueue.findMany({
    where: { briefDate: today, status: { in: ["pending", "approved"] } },
    include: { lead: { select: { id: true, name: true, phone: true, email: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  // ── 2. Urgent tasks due today ──────────────────────────────────────────────
  const todayStart = new Date(`${today}T00:00:00-06:00`);
  const todayEnd = new Date(`${today}T23:59:59-06:00`);

  const urgentTasks = await prisma.task.findMany({
    where: {
      done: false,
      priority: { in: ["urgent", "high"] },
      dueDate: { lte: todayEnd },
    },
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  // ── 3. DotloopLoop milestones in 48h ──────────────────────────────────────
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const upcomingClosings = await prisma.dotloopLoop.findMany({
    where: {
      status: { in: ["UNDER_CONTRACT", "PRE_OFFER"] },
      OR: [
        { closingDate: { lte: in48h, gte: new Date() } },
        { expectedClosingDate: { lte: in48h, gte: new Date() } },
      ],
    },
    include: { lead: { select: { id: true, name: true } } },
    take: 10,
  });

  // ── 4. Build sections ──────────────────────────────────────────────────────

  // NON-NEGOTIABLES: transaction deadlines + urgent tasks
  const nonNegotiables: BriefItem[] = [];

  for (const loop of upcomingClosings) {
    const closing = loop.closingDate ?? loop.expectedClosingDate;
    const hoursUntil = closing
      ? Math.round((closing.getTime() - Date.now()) / (60 * 60 * 1000))
      : null;
    nonNegotiables.push({
      type: "closing_deadline",
      title: `Closing: ${loop.streetAddress ?? loop.name}`,
      subtitle: hoursUntil !== null ? `${hoursUntil}h away` : "Today",
      dueDate: closing?.toISOString(),
      leadId: loop.leadId ?? undefined,
      leadName: loop.lead?.name,
      priority: hoursUntil !== null && hoursUntil <= 24 ? 1 : 2,
    });
  }

  for (const task of urgentTasks) {
    if (task.dueDate && task.dueDate >= todayStart && task.dueDate <= todayEnd) {
      nonNegotiables.push({
        type: "urgent_task",
        title: task.title,
        subtitle: task.lead?.name,
        dueDate: task.dueDate.toISOString(),
        leadId: task.leadId ?? undefined,
        leadName: task.lead?.name,
        priority: task.priority === "urgent" ? 1 : 2,
      });
    }
  }

  nonNegotiables.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));

  // GOING COLD: revival drafts
  const goingCold: BriefItem[] = queueItems
    .filter((q) => q.agentType === "lead_revival" || (q.agentType === "new_lead_intake" && q.type === "draft_message"))
    .map((q) => {
      const p = q.payload as Record<string, unknown>;
      return {
        actionQueueId: q.id,
        type: "draft_message",
        title: `Follow-up: ${q.lead?.name ?? (p.leadName as string) ?? "Lead"}`,
        subtitle: p.ageDays ? `${p.ageDays} days cold` : "New lead",
        preview: (p.body as string)?.slice(0, 120),
        leadId: q.leadId ?? undefined,
        leadName: q.lead?.name ?? (p.leadName as string),
        channel: p.channel as string,
        priority: q.priority,
      };
    });

  // OWE PEOPLE: client emails from watchdog + any Gmail threads (graceful fallback)
  const owePeople: BriefItem[] = queueItems
    .filter((q) => q.type === "send_client_email")
    .map((q) => {
      const p = q.payload as Record<string, unknown>;
      return {
        actionQueueId: q.id,
        type: "send_client_email",
        title: (p.subject as string) ?? `Email: ${q.lead?.name ?? "Client"}`,
        subtitle: q.lead?.name ?? (p.leadName as string),
        preview: (p.body as string)?.slice(0, 120),
        leadId: q.leadId ?? undefined,
        leadName: q.lead?.name ?? (p.leadName as string),
        dueDate: (p.closingDate as string) ?? undefined,
        priority: q.priority,
      };
    });

  // Try to surface any overdue contacts from ContactLog (leads who sent inbound but no outbound since)
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    const inboundWithNoReply = await prisma.contactLog.findMany({
      where: {
        direction: "inbound",
        createdAt: { gte: twoDaysAgo },
      },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const log of inboundWithNoReply) {
      const alreadyInQueue = owePeople.some((i) => i.leadId === log.leadId);
      if (!alreadyInQueue) {
        owePeople.push({
          type: "unanswered_inbound",
          title: `Unanswered: ${log.lead.name}`,
          subtitle: log.note?.slice(0, 80),
          leadId: log.leadId,
          leadName: log.lead.name,
          priority: 2,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // CONTENT QUEUED: content scheduler + market intel posts
  const contentQueued: BriefItem[] = queueItems
    .filter((q) => q.type === "post_content")
    .map((q) => {
      const p = q.payload as Record<string, unknown>;
      return {
        actionQueueId: q.id,
        type: "post_content",
        title: `Post: ${(p.contentType as string)?.replace(/_/g, " ") ?? "Content"}`,
        subtitle: (p.address as string) ?? undefined,
        preview: (p.caption as string)?.slice(0, 120),
        priority: q.priority,
        metadata: { platform: p.platform, agentType: q.agentType },
      };
    });

  // MARKET MOVEMENT: client-matched listing signals
  const marketMovement: BriefItem[] = queueItems
    .filter((q) => q.agentType === "market_intel" && (q.payload as Record<string, unknown>).marketSignal)
    .map((q) => {
      const p = q.payload as Record<string, unknown>;
      return {
        actionQueueId: q.id,
        type: "market_signal",
        title: `Match: ${p.listingAddress as string}`,
        subtitle: `Touches ${(p.leadName as string) ?? "active client"}'s search`,
        leadId: q.leadId ?? undefined,
        leadName: q.lead?.name ?? (p.leadName as string),
        priority: q.priority,
      };
    });

  // Also add Zillow hot listings as context items — sourced from zillowResult sub-agent
  if (zillowResult.status === "fulfilled" && zillowResult.value !== null) {
    for (const listing of zillowResult.value.listings.slice(0, 3)) {
      const alreadyIncluded = marketMovement.some(
        (i) => (i.metadata as Record<string, unknown>)?.zpid === listing.zpid
      );
      if (!alreadyIncluded) {
        marketMovement.push({
          type: "zillow_viral",
          title: `Zillow trending: ${listing.address}`,
          subtitle: listing.viewCount ? `${listing.viewCount.toLocaleString()} views` : listing.city,
          metadata: {
            zpid: listing.zpid,
            price: listing.price,
            listingUrl: listing.listingUrl,
            photoUrl: listing.photoUrl,
          },
          priority: 4,
        });
      }
    }
  }

  // ── 5a. Market pulse — sourced from sub-agents (rateResult, marketResult) ──
  // Rate alert: rateResult
  if (rateResult.status === "fulfilled" && rateResult.value !== null) {
    const r = rateResult.value;
    if (r.alert.triggered) {
      marketMovement.unshift({
        type: "rate_alert",
        title: `Rate ${r.alert.direction === "down" ? "Drop" : "Jump"}: ${r.delta > 0 ? "+" : ""}${r.delta.toFixed(3)}%`,
        subtitle: r.summary,
        priority: 1,
        metadata: { delta: r.delta, direction: r.alert.direction },
      });

      // Create blast drafts for active buyer leads with no recent outreach
      try {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
        const activeBuyers = await prisma.lead.findMany({
          where: {
            stage: { in: ["active", "new_lead"] },
            phone: { not: null },
            timeline_logs: { none: { direction: "outbound", createdAt: { gte: twoDaysAgo } } },
          },
          take: 20,
          orderBy: { lastContactDate: "asc" },
        });

        for (const lead of activeBuyers) {
          const alreadyQueued = await prisma.actionQueue.findFirst({
            where: {
              leadId: lead.id,
              type: "draft_message",
              briefDate: today,
              payload: { path: ["trigger"], equals: "rate_alert" },
            },
          });
          if (alreadyQueued) continue;

          const direction = r.alert.direction === "down" ? "dropped" : "jumped";
          const body =
            r.alert.direction === "down"
              ? `Hey ${lead.name?.split(" ")[0] ?? "there"} — rates just ${direction} to ${r.rate}%. Your monthly payment on a $300k home just got about $${Math.round(Math.abs(r.delta) * 300000 / 12 / 100)} cheaper. Wanted to make sure you heard. Worth a quick chat? — Caleb`
              : `Hey ${lead.name?.split(" ")[0] ?? "there"} — rates moved up to ${r.rate}% this week. If you've been thinking about locking in, now might be the time to talk. — Caleb`;

          await prisma.actionQueue.create({
            data: {
              type: "draft_message",
              briefDate: today,
              status: "pending",
              priority: 2,
              leadId: lead.id,
              agentType: "market_intel",
              payload: {
                trigger: "rate_alert",
                channel: "sms",
                leadName: lead.name,
                body,
                rateDelta: r.delta,
                direction: r.alert.direction,
              },
            },
          });
        }
      } catch {
        // Non-fatal — blast drafts failed, rate alert still surfaced
      }
    }
  }

  // Market stats snapshot: marketResult
  if (marketResult.status === "fulfilled" && marketResult.value !== null) {
    const m = marketResult.value;
    marketMovement.push({
      type: "market_stats",
      title: `BR Market: Median $${Math.round((m.medianPrice ?? 0) / 1000)}k`,
      subtitle: m.summary,
      priority: 5,
      metadata: { medianPrice: m.medianPrice, daysOnMarket: m.daysOnMarket, zip: "70808" },
    });
  }

  // Calendar events: calendarResult — surface next-8h appointments as non-negotiables
  if (calendarResult.status === "fulfilled" && calendarResult.value !== null) {
    const cal = calendarResult.value;
    for (const appt of cal.appointments) {
      nonNegotiables.push({
        type: "calendar_event",
        title: appt.title,
        subtitle: appt.location ?? cal.summary,
        dueDate: appt.start,
        priority: 2,
        metadata: { calendarEventId: appt.id, allDay: appt.allDay },
      });
    }
  }

  // Lead activity: leadsResult — surface hot leads as going-cold candidates
  if (leadsResult.status === "fulfilled" && leadsResult.value !== null) {
    const la = leadsResult.value;
    for (const lead of la.hotLeads) {
      const alreadyInCold = goingCold.some((i) => i.leadId === lead.id);
      if (!alreadyInCold) {
        goingCold.push({
          type: "hot_lead",
          title: `Active: ${lead.name}`,
          subtitle: leadsResult.value?.summary,
          leadId: lead.id,
          leadName: lead.name,
          priority: 3,
          metadata: { lastContactDate: lead.lastContactDate?.toISOString() },
        });
      }
    }
  }

  // ── 5b. Content flywheel — Zillow viral → auto-queue post suggestions ──────
  // Sourced from zillowResult sub-agent (top 2 listings)
  if (zillowResult.status === "fulfilled" && zillowResult.value !== null) {
    const viralListings = zillowResult.value.listings.slice(0, 2);
    for (const listing of viralListings) {
      try {
        const alreadyQueued = await prisma.actionQueue.findFirst({
          where: {
            type: "post_content",
            briefDate: today,
            payload: { path: ["zpid"], equals: listing.zpid },
          },
        });
        if (alreadyQueued) continue;

        await prisma.actionQueue.create({
          data: {
            type: "post_content",
            briefDate: today,
            status: "pending",
            priority: 3,
            agentType: "content_scheduler",
            payload: {
              contentType: "listing_spotlight",
              zpid: listing.zpid,
              address: listing.address,
              price: listing.price,
              photoUrl: listing.photoUrl,
              listingUrl: listing.listingUrl,
              viewCount: listing.viewCount,
              platform: "instagram",
              caption: `This home in Baton Rouge just hit ${(listing.viewCount ?? 0).toLocaleString()} views on Zillow — here's why the market is watching it.`,
              trigger: "zillow_viral",
            },
          },
        });
      } catch {
        // Non-fatal per listing
      }
    }
  }

  // ── 5c. Pre-appointment CMA — auto-run comps for today's scheduled appts ───
  try {
    const apptKeywords = ["appointment", "listing appt", "listing presentation", "buyer consult", "showing", "cma"];
    const apptTasks = await prisma.task.findMany({
      where: {
        done: false,
        dueDate: { gte: new Date(`${today}T00:00:00-06:00`), lte: new Date(`${today}T23:59:59-06:00`) },
        title: { contains: "appt", mode: "insensitive" },
      },
      include: { lead: { select: { id: true, name: true, address: true } } },
      take: 5,
    });

    // Also check by common appointment keywords
    const apptTasksAlt = await prisma.task.findMany({
      where: {
        done: false,
        dueDate: { gte: new Date(`${today}T00:00:00-06:00`), lte: new Date(`${today}T23:59:59-06:00`) },
        OR: apptKeywords.map(kw => ({ title: { contains: kw, mode: "insensitive" as const } })),
      },
      include: { lead: { select: { id: true, name: true, address: true } } },
      take: 5,
    });

    const allAppts = [...apptTasks, ...apptTasksAlt].filter(
      (t, i, arr) => arr.findIndex(x => x.id === t.id) === i
    );

    for (const task of allAppts) {
      if (!task.lead?.address) continue;
      const alreadyQueued = await prisma.actionQueue.findFirst({
        where: { leadId: task.leadId, briefDate: today, payload: { path: ["trigger"], equals: "pre_appt_cma" } },
      });
      if (alreadyQueued) continue;

      try {
        const cma = await buildCMASummary(task.lead.address, "Baton Rouge", "LA");
        nonNegotiables.unshift({
          type: "pre_appt_cma",
          title: `CMA Ready: ${task.lead.name}`,
          subtitle: `${task.lead.address} · AVM ${cma.avm?.price ? `$${Math.round(cma.avm.price / 1000)}k` : "pending"}`,
          leadId: task.lead.id,
          leadName: task.lead.name,
          dueDate: task.dueDate?.toISOString(),
          priority: 1,
          metadata: { cma, address: task.lead.address },
        });
      } catch {
        // CMA failed — still surface the appointment
        nonNegotiables.unshift({
          type: "pre_appt_cma",
          title: `Appt Today: ${task.lead.name}`,
          subtitle: task.lead.address,
          leadId: task.lead.id,
          leadName: task.lead.name,
          dueDate: task.dueDate?.toISOString(),
          priority: 1,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // ── 5. SMS summary via Claude Haiku ───────────────────────────────────────
  const smsSummary = await buildSmsSummary({
    nonNegotiables,
    goingCold,
    owePeople,
    contentQueued,
    marketMovement,
  });

  // ── 6. Upsert DailyBrief ──────────────────────────────────────────────────
  const brief = await prisma.dailyBrief.upsert({
    where: { date: today },
    create: {
      date: today,
      nonNegotiables: nonNegotiables as unknown as object[],
      goingCold: goingCold as unknown as object[],
      owePeople: owePeople as unknown as object[],
      contentQueued: contentQueued as unknown as object[],
      marketMovement: marketMovement as unknown as object[],
      smsSummary,
      agentRunId: agentRunId ?? null,
    },
    update: {
      nonNegotiables: nonNegotiables as unknown as object[],
      goingCold: goingCold as unknown as object[],
      owePeople: owePeople as unknown as object[],
      contentQueued: contentQueued as unknown as object[],
      marketMovement: marketMovement as unknown as object[],
      smsSummary,
      assembledAt: new Date(),
      agentRunId: agentRunId ?? undefined,
    },
  });

  return {
    date: brief.date,
    nonNegotiables,
    goingCold,
    owePeople,
    contentQueued,
    marketMovement,
    smsSummary,
    agentRunId: brief.agentRunId ?? undefined,
  };
}

async function buildSmsSummary(sections: Omit<AssembledBrief, "date" | "smsSummary" | "agentRunId">): Promise<string> {
  const totalActions =
    sections.nonNegotiables.length +
    sections.goingCold.length +
    sections.owePeople.length +
    sections.contentQueued.length +
    sections.marketMovement.length;

  const fallback = [
    sections.nonNegotiables.length > 0
      ? `${sections.nonNegotiables.length} deadline${sections.nonNegotiables.length > 1 ? "s" : ""}`
      : null,
    sections.goingCold.length > 0
      ? `${sections.goingCold.length} draft${sections.goingCold.length > 1 ? "s" : ""} to send`
      : null,
    sections.contentQueued.length > 0 ? "1 post ready" : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (totalActions === 0) {
    return "Good morning. Your pipeline is clear. Nothing urgent today.";
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `Morning brief: ${fallback || `${totalActions} items ready`}. Open AIRE to review.`;
  }

  try {
    const client = getAnthropicClient();
    const context = [
      sections.nonNegotiables.length > 0
        ? `NON-NEGOTIABLES (${sections.nonNegotiables.length}): ${sections.nonNegotiables.map((i) => i.title).join("; ")}`
        : null,
      sections.goingCold.length > 0
        ? `COLD LEADS (${sections.goingCold.length}): ${sections.goingCold.slice(0, 3).map((i) => i.leadName ?? i.title).join(", ")}`
        : null,
      sections.owePeople.length > 0
        ? `OWE REPLIES (${sections.owePeople.length}): ${sections.owePeople.slice(0, 2).map((i) => i.title).join(", ")}`
        : null,
      sections.contentQueued.length > 0 ? `CONTENT READY: ${sections.contentQueued[0].title}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Write a morning brief SMS for Caleb Jackson (REALTOR®, Rêve Realtors® Baton Rouge).
Under 280 chars. Plain text only. No emojis. Conversational, not robotic. Just the key things, in order of urgency.

Context:
${context}

SMS only — no preamble.`,
        },
      ],
    });

    return response.content.find((b) => b.type === "text")?.text?.trim() ?? fallback;
  } catch {
    return `Morning brief: ${fallback || `${totalActions} items ready`}. Open AIRE to review.`;
  }
}
