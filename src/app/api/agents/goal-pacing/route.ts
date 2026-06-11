export const dynamic = "force-dynamic";
// AIRE: loop:goal-pacing-alert
// Vercel cron: 0 13 * * 1 (7AM CT Monday)
// Compares leads, outbound contacts, and closings against Setting targets; writes pacing Notification.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/error-memory";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

function getWindowBounds() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { sevenDaysAgo, monthStart, monthEnd };
}

function pacingStatus(pct: number): string {
  if (pct >= 85) return "green";
  if (pct >= 60) return "yellow";
  return "red";
}

function overallNotifType(statuses: string[]): "info" | "warning" | "error" {
  if (statuses.includes("red")) return "error";
  if (statuses.includes("yellow")) return "warning";
  return "info";
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

async function runGoalPacing() {
  const { sevenDaysAgo, monthStart, monthEnd } = getWindowBounds();

  const [leadsPerWeekStr, closingsPerMonthStr, outboundPerWeekStr] = await Promise.all([
    getSetting("goal.leadsPerWeek"),
    getSetting("goal.closingsPerMonth"),
    getSetting("goal.outboundContactsPerWeek"),
  ]);

  const leadsTarget = parseInt(leadsPerWeekStr ?? "0", 10);
  const closingsTarget = parseInt(closingsPerMonthStr ?? "0", 10);
  const outboundTarget = parseInt(outboundPerWeekStr ?? "0", 10);

  const [newLeads, outboundContacts, closingsThisMonth] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.contactLog.count({
      where: { direction: "outbound", createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.lead.count({
      where: {
        stage: "closing",
        closingDate: { gte: monthStart, lte: monthEnd },
      },
    }),
  ]);

  const leadsPct = (newLeads / Math.max(leadsTarget, 1)) * 100;
  const outboundPct = (outboundContacts / Math.max(outboundTarget, 1)) * 100;
  const closingsPct = (closingsThisMonth / Math.max(closingsTarget, 1)) * 100;

  const leadsStatus = pacingStatus(leadsPct);
  const outboundStatus = pacingStatus(outboundPct);
  const closingsStatus = pacingStatus(closingsPct);
  const notifType = overallNotifType([leadsStatus, outboundStatus, closingsStatus]);

  const title = `Weekly pacing — leads: ${leadsStatus} (${newLeads}/${leadsTarget}), contacts: ${outboundStatus} (${outboundContacts}/${outboundTarget}), closings: ${closingsStatus} (${closingsThisMonth}/${closingsTarget})`;
  const body = [
    `Leads 7d: ${newLeads} / ${leadsTarget} (${leadsPct.toFixed(0)}%)`,
    `Outbound: ${outboundContacts} / ${outboundTarget} (${outboundPct.toFixed(0)}%)`,
    `Closings MTD: ${closingsThisMonth} / ${closingsTarget} (${closingsPct.toFixed(0)}%)`,
  ].join(" | ");

  await prisma.notification
    .create({ data: { type: notifType, title, body, href: "/pipeline" } })
    .catch(() => null);

  await upsertSetting("goal.lastPacingCheck", new Date().toISOString()).catch(() => null);

  return Response.json({
    ok: true,
    leads: { actual: newLeads, target: leadsTarget, pct: leadsPct, status: leadsStatus },
    outbound: { actual: outboundContacts, target: outboundTarget, pct: outboundPct, status: outboundStatus },
    closings: { actual: closingsThisMonth, target: closingsTarget, pct: closingsPct, status: closingsStatus },
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runGoalPacing();
  } catch (err) {
    await logError(
      "api_failure",
      "goal-pacing",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Goal pacing check failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runGoalPacing();
  } catch (err) {
    await logError(
      "api_failure",
      "goal-pacing",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Goal pacing check failed" }, { status: 500 });
  }
}
