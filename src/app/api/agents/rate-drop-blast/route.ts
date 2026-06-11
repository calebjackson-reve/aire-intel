export const dynamic = "force-dynamic";

// Loop 23 — Rate Drop SMS Blast
// Cron: 0 12 * * * — Checks FRED mortgage rates daily. If rates drop >= 0.125%,
// queues follow_up_text ActionQueue items for qualified leads (pending Caleb approval).

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { getMortgageRate } from "@/lib/housing-intel";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { getTodayCT } from "@/lib/brief-date";

const RATE_DROP_THRESHOLD = 0.125; // percentage points
const MAX_LEADS_PER_BLAST = 50;
const DAYS_SINCE_LAST_CONTACT = 14;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runRateDropBlast();
}

export async function GET() {
  return runRateDropBlast();
}

async function runRateDropBlast() {
  const runId = await startRun("market_intel");
  const today = getTodayCT();

  try {
    // Fetch current mortgage rate data from FRED
    const rateData = await getMortgageRate();
    const { current, priorWeek, delta } = rateData;

    // Only blast if rates dropped by threshold or more
    if (delta > -RATE_DROP_THRESHOLD) {
      await finishRun(runId, { itemsProcessed: 1, actionsQueued: 0 });
      return Response.json({
        ok: true,
        triggered: false,
        delta,
        rate: current,
        message: `Rate change ${delta > 0 ? "+" : ""}${delta.toFixed(3)}% — below blast threshold of -${RATE_DROP_THRESHOLD}%`,
      });
    }

    // Idempotency: one blast per calendar day
    const lastBlastDate = await getSetting("rate_alert.last_blast_date");
    if (lastBlastDate === today) {
      await finishRun(runId, { itemsProcessed: 1, actionsQueued: 0 });
      return Response.json({
        ok: true,
        triggered: false,
        skipped: "already_blasted_today",
        date: today,
      });
    }

    // Query qualified leads
    const cutoffDate = new Date(Date.now() - DAYS_SINCE_LAST_CONTACT * 24 * 60 * 60 * 1000);
    const leads = await prisma.lead.findMany({
      where: {
        stage: { in: ["active", "new_lead"] },
        phone: { not: null },
        OR: [
          { lastContactDate: null },
          { lastContactDate: { lt: cutoffDate } },
        ],
      },
      select: { id: true, name: true, phone: true },
      take: MAX_LEADS_PER_BLAST,
    });

    // Build SMS body
    const rateStr = current.toFixed(2);
    const dropStr = Math.abs(delta).toFixed(3);
    const smsBody =
      `Rates just dropped ${dropStr}% to ${rateStr}% — now may be the perfect time to lock in. ` +
      `Want me to connect you with a lender? Reply YES. -Caleb @ Rêve Realtors®`;

    // Create ActionQueue items (approval required)
    let actionsQueued = 0;
    for (const lead of leads) {
      if (!lead.phone) continue;
      await prisma.actionQueue.create({
        data: {
          type: "follow_up_text",
          agentType: "rate_drop_blast",
          leadId: lead.id,
          priority: 1,
          briefDate: today,
          requiresApproval: true,
          payload: {
            to: lead.phone,
            body: smsBody,
            leadId: lead.id,
            leadName: lead.name,
            rateCurrent: current,
            ratePrior: priorWeek,
            rateDelta: delta,
          },
        },
      });
      actionsQueued++;
    }

    // Write idempotency key
    await prisma.setting.upsert({
      where: { key: "rate_alert.last_blast_date" },
      create: { key: "rate_alert.last_blast_date", value: today },
      update: { value: today },
    });
    invalidateSettingsCache(["rate_alert.last_blast_date"]);

    // Summary notification
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: `Rate drop blast queued — ${actionsQueued} leads`,
        body: `30-yr rate dropped ${dropStr}% to ${rateStr}%. ${actionsQueued} text messages queued for approval.`,
        href: "/pipeline",
      },
    });

    await finishRun(runId, { itemsProcessed: leads.length, actionsQueued });

    return Response.json({
      ok: true,
      triggered: true,
      rateCurrent: current,
      ratePrior: priorWeek,
      delta,
      leadsQueued: actionsQueued,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
