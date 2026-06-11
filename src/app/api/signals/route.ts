export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

/**
 * Urgent signals surfaced at the top of the dashboard.
 *
 * Every signal must be actionable in a single tap. If we can't tell Caleb
 * exactly what to do, we don't surface it.
 *
 * Severity:
 *   - red    → action overdue, real deal-risk
 *   - yellow → attention needed, no immediate damage
 *   - blue   → informational change worth noticing
 */
export type SignalSeverity = "red" | "yellow" | "blue";

export interface Signal {
  id: string;
  severity: SignalSeverity;
  label: string;
  href?: string;
  count?: number;
}

export async function GET() {
  const signals: Signal[] = [];

  // ── 1. Overdue tasks ────────────────────────────────────────────────────
  const overdueCount = await prisma.task.count({
    where: { done: false, dueDate: { lt: new Date() } },
  });
  if (overdueCount > 0) {
    signals.push({
      id: "overdue-tasks",
      severity: "red",
      label: `${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`,
      href: "/contacts?filter=overdue",
      count: overdueCount,
    });
  }

  // ── 2. Integration disconnects ──────────────────────────────────────────
  // Lofty status is env-only; everything else is env-or-db
  const settingKeys = [
    "PARAGON_API_KEY",
    "META_PAGE_ACCESS_TOKEN",
    "TWILIO_AUTH_TOKEN",
    "SENDGRID_API_KEY",
    "CALENDLY_API_KEY",
    "ZAPIER_WEBHOOK_URL",
  ];
  const settings = await prisma.setting.findMany({
    where: { key: { in: settingKeys } },
  });
  const has = (key: string) =>
    !!settings.find((s) => s.key === key)?.value || !!process.env[key];

  const loftyConnected = !!process.env.LOFTY_CLIENT_ID && !!process.env.LOFTY_CLIENT_SECRET && !!process.env.LOFTY_CUSTOMER_KEY;

  if (!loftyConnected) {
    signals.push({
      id: "lofty-disconnected",
      severity: "yellow",
      label: "Lofty not connected",
      href: "/settings#lofty",
    });
  }
  if (!has("META_PAGE_ACCESS_TOKEN")) {
    signals.push({
      id: "meta-disconnected",
      severity: "yellow",
      label: "Meta not connected",
      href: "/settings#meta",
    });
  }
  if (!has("TWILIO_AUTH_TOKEN")) {
    signals.push({
      id: "twilio-disconnected",
      severity: "yellow",
      label: "Twilio SMS not connected",
      href: "/settings#twilio",
    });
  }
  if (!has("SENDGRID_API_KEY")) {
    signals.push({
      id: "sendgrid-disconnected",
      severity: "yellow",
      label: "SendGrid email not connected",
      href: "/settings#sendgrid",
    });
  }
  if (!has("PARAGON_API_KEY")) {
    signals.push({
      id: "paragon-disconnected",
      severity: "yellow",
      label: "Paragon MLS not connected",
      href: "/settings#paragon",
    });
  }
  if (!has("CALENDLY_API_KEY")) {
    signals.push({
      id: "calendly-disconnected",
      severity: "blue",
      label: "Calendly not connected",
      href: "/settings#calendly",
    });
  }
  if (!has("ZAPIER_WEBHOOK_URL")) {
    signals.push({
      id: "zapier-disconnected",
      severity: "blue",
      label: "Zapier webhook not connected",
      href: "/settings#zapier",
    });
  }

  // ── 3. TC packets pending ───────────────────────────────────────────────
  // Under-contract deals with no tc_handoff timeline log = pending
  const underContract = await prisma.lead.findMany({
    where: { stage: "under_contract" },
    select: {
      id: true,
      timeline_logs: {
        where: { method: "tc_handoff" },
        select: { id: true },
        take: 1,
      },
    },
  });
  const pendingPackets = underContract.filter((l) => l.timeline_logs.length === 0).length;
  if (pendingPackets > 0) {
    signals.push({
      id: "tc-packets-pending",
      severity: "yellow",
      label: `${pendingPackets} TC packet${pendingPackets === 1 ? "" : "s"} pending`,
      href: "/#tc-handoff",
      count: pendingPackets,
    });
  }

  // ── 4. Cold under-contract deals (no contact in 5+ days) ────────────────
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
  const coldUnderContract = await prisma.lead.count({
    where: {
      stage: "under_contract",
      OR: [{ lastContactDate: null }, { lastContactDate: { lt: fiveDaysAgo } }],
    },
  });
  if (coldUnderContract > 0) {
    signals.push({
      id: "cold-under-contract",
      severity: "red",
      label: `${coldUnderContract} under-contract deal${coldUnderContract === 1 ? "" : "s"} cold 5+ days`,
      href: "/pipeline?filter=cold_uc",
      count: coldUnderContract,
    });
  }

  return Response.json({ signals });
}
