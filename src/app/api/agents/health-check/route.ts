export const dynamic = "force-dynamic";
// AIRE: loop:agent-health-monitor
// Daily 6:30 AM CT cron. Checks AgentRun records for all 6 inner agent types in the last 24h,
// computes a health score, alerts on failures, and verifies DailyBrief was assembled.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { getTwilioConfig, sendSMS } from "@/lib/twilio";
import { logError, withRetry } from "@/lib/error-memory";

// AIRE: loop:agent-health-monitor
const AGENT_TYPES = [
  "morning_brief",
  "new_lead_intake",
  "lead_revival",
  "transaction_watchdog",
  "content_scheduler",
  "market_intel",
] as const;

type MonitoredAgentType = (typeof AGENT_TYPES)[number];

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runHealthCheck();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runHealthCheck();
}

async function upsertSetting(key: string, value: string) {
  // AIRE: loop:agent-health-monitor
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettingsCache([key]);
}

async function runHealthCheck() {
  // AIRE: loop:agent-health-monitor
  const monitorRun = await prisma.agentRun.create({
    data: { agentType: "health_monitor", status: "running" },
  });
  const runStart = Date.now();

  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query all AgentRun records for the 6 monitored types in the last 24h
    const recentRuns = await withRetry(
      () =>
        prisma.agentRun.findMany({
          where: {
            agentType: { in: [...AGENT_TYPES] },
            startedAt: { gte: since },
          },
          orderBy: { startedAt: "desc" },
        }),
      { source: "/api/agents/health-check", type: "api_failure" },
    );

    // Per-type health analysis
    type AgentHealthSummary = {
      agentType: MonitoredAgentType;
      successCount: number;
      failCount: number;
      totalRuns: number;
      lastRunAt: Date | null;
      lastStatus: string | null;
      typeScore: number;
    };

    const agentHealthSummaries: AgentHealthSummary[] = [];
    const failedOrMissingAgents: MonitoredAgentType[] = [];
    let notificationsCreated = 0;

    for (const type of AGENT_TYPES) {
      const runs = recentRuns.filter((r) => r.agentType === type);
      const successCount = runs.filter((r) => r.status === "completed" || r.status === "partial").length;
      const failCount = runs.filter((r) => r.status === "failed").length;
      const totalRuns = runs.length;
      const lastRun = runs[0] ?? null; // already ordered desc
      const lastRunAt = lastRun?.startedAt ?? null;
      const lastStatus = lastRun?.status ?? null;
      const typeScore = 100 - (failCount / Math.max(totalRuns, 1)) * 100;

      agentHealthSummaries.push({ agentType: type, successCount, failCount, totalRuns, lastRunAt, lastStatus, typeScore });

      if (totalRuns === 0 || lastStatus === "failed") {
        failedOrMissingAgents.push(type);
        const label = type.replace(/_/g, " ");
        const statusLabel = totalRuns === 0 ? "missing — cron may not have fired" : "failed last night";
        const items = lastRun?.itemsProcessed ?? 0;
        const queued = lastRun?.actionsQueued ?? 0;

        await prisma.notification.create({
          data: {
            type: "critical",
            title: `Agent failure: ${label}`,
            body: `${label} ${statusLabel} — ${items} items processed, ${queued} queued before failure`,
            href: "/agents",
          },
        });
        notificationsCreated++;
      }
    }

    // Health score: average of per-type scores (100 - failRate × 100)
    const healthScore = Math.round(
      agentHealthSummaries.reduce((sum, s) => sum + s.typeScore, 0) / AGENT_TYPES.length,
    );

    await Promise.all([
      upsertSetting("agents.healthScore", healthScore.toString()),
      upsertSetting("agents.lastChecked", now.toISOString()),
    ]);

    // Unit B: DailyBrief freshness check
    const today = now.toISOString().slice(0, 10);
    const dailyBrief = await prisma.dailyBrief.findFirst({ where: { date: today } });
    let briefStatus: "ok" | "missing" | "not_assembled";

    if (!dailyBrief || !dailyBrief.assembledAt) {
      briefStatus = dailyBrief ? "not_assembled" : "missing";
      await prisma.notification.create({
        data: {
          type: "warning",
          title: "DailyBrief not assembled today",
          body: "Morning Brief was not assembled — agents may need attention. Check /agents for details.",
          href: "/agents",
        },
      });
      notificationsCreated++;
    } else {
      briefStatus = "ok";
    }

    // SMS Caleb if health score is below alert threshold
    const thresholdRaw = await getSetting("health.alertThreshold");
    const threshold = parseInt(thresholdRaw ?? "50", 10);
    let smsSent = false;

    if (healthScore < threshold) {
      const [twilioConfig, calebPhone] = await Promise.all([
        getTwilioConfig(),
        getSetting("CALEB_PHONE"),
      ]);

      if (twilioConfig && calebPhone) {
        const failedNames = failedOrMissingAgents.map((t) => t.replace(/_/g, " ")).join(", ");
        const briefNote = briefStatus !== "ok" ? " Morning brief not assembled." : "";
        const msg = `AIRE: Agent health ${healthScore}/100.${briefNote} Failed: ${failedNames || "none"}. Check /agents.`;

        await withRetry(
          () => sendSMS(calebPhone, msg, twilioConfig),
          { source: "/api/agents/health-check", type: "twilio" },
        );
        smsSent = true;
      }
    }

    await prisma.agentRun.update({
      where: { id: monitorRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: AGENT_TYPES.length,
        actionsQueued: notificationsCreated,
        durationMs: Date.now() - runStart,
      },
    });

    return Response.json({
      ok: true,
      runId: monitorRun.id,
      date: today,
      healthScore,
      agentHealthSummaries,
      briefStatus,
      briefAssembledAt: dailyBrief?.assembledAt ?? null,
      failedOrMissingCount: failedOrMissingAgents.length,
      notificationsCreated,
      smsSent,
    });
  } catch (err) {
    await logError("api_failure", "/api/agents/health-check", err);
    await prisma.agentRun.update({
      where: { id: monitorRun.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorLog: [{ error: String(err) }],
        durationMs: Date.now() - runStart,
      },
    });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
