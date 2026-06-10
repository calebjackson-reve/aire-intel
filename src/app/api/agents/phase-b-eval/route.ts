// AIRE: loop:phase-b-graduation
// Vercel cron: 0 15 15 * * (9AM CT on the 15th of each month)
// Analyzes ActionQueue history by action type — reports Phase B graduation candidates. Never flips requiresApproval.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/error-memory";
import { invalidateSettingsCache } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

const ACTION_TYPES = [
  "draft_message",
  "post_content",
  "create_lofty_task",
  "send_client_email",
  "follow_up_text",
] as const;

// send_client_email never graduates — AI-generated emails require permanent human review
const NEVER_GRADUATE = new Set(["send_client_email"]);

const GRADUATION_THRESHOLD = {
  approvalRate: 0.9,
  successRate: 0.95,
  minItems: 20,
};

const IDEMPOTENCY_DAYS = 20;

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

async function runPhaseBEval() {
  // Idempotency: skip if run within the last IDEMPOTENCY_DAYS
  const lastEvalRecord = await prisma.setting.findUnique({
    where: { key: "phaseb.lastEvaluation" },
  });
  if (lastEvalRecord?.value) {
    const lastRun = new Date(lastEvalRecord.value);
    const daysSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < IDEMPOTENCY_DAYS) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: `Last evaluation was ${daysSince.toFixed(1)} days ago — next run in ${(IDEMPOTENCY_DAYS - daysSince).toFixed(1)} days`,
      });
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all ActionQueue items in the last 30 days
  const items = await prisma.actionQueue.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { type: true, status: true },
  });

  // Aggregate counts per type
  const statsByType: Record<
    string,
    { totalItems: number; approvedCount: number; executedCount: number; failedCount: number }
  > = {};
  for (const type of ACTION_TYPES) {
    statsByType[type] = { totalItems: 0, approvedCount: 0, executedCount: 0, failedCount: 0 };
  }

  for (const item of items) {
    const stats = statsByType[item.type];
    if (!stats) continue;
    stats.totalItems++;
    if (item.status === "approved" || item.status === "executed") stats.approvedCount++;
    if (item.status === "executed") stats.executedCount++;
    if (item.status === "failed") stats.failedCount++;
  }

  // Build graduation candidates
  const candidates = ACTION_TYPES.map((type) => {
    const { totalItems, approvedCount, executedCount, failedCount } = statsByType[type];
    const approvalRate = approvedCount / Math.max(totalItems, 1);
    const successRate = executedCount / Math.max(approvedCount, 1);

    const meetsThreshold =
      !NEVER_GRADUATE.has(type) &&
      approvalRate >= GRADUATION_THRESHOLD.approvalRate &&
      successRate >= GRADUATION_THRESHOLD.successRate &&
      totalItems >= GRADUATION_THRESHOLD.minItems;

    return {
      type,
      totalItems,
      approvedCount,
      executedCount,
      failedCount,
      approvalRate: Math.round(approvalRate * 1000) / 1000,
      successRate: Math.round(successRate * 1000) / 1000,
      eligible: meetsThreshold,
      neverGraduates: NEVER_GRADUATE.has(type),
    };
  });

  const eligible = candidates.filter((c) => c.eligible);

  // Update Setting with candidates JSON
  await upsertSetting("phaseb.graduationCandidates", JSON.stringify(candidates));
  await upsertSetting("phaseb.lastEvaluation", new Date().toISOString());

  // Build notification
  const notifBody =
    eligible.length > 0
      ? `Eligible for Phase B (auto-execute): ${eligible.map((c) => c.type).join(", ")}. Review metrics in Settings → Phase B and enable manually.`
      : "No action types have met graduation criteria yet. Check back next month.";

  await prisma.notification
    .create({
      data: {
        type: "info",
        title: `Phase B Evaluation — ${eligible.length} type${eligible.length === 1 ? "" : "s"} eligible`,
        body: notifBody,
        href: "/settings",
      },
    })
    .catch(() => null);

  return Response.json({ ok: true, eligible: eligible.map((c) => c.type), candidates });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runPhaseBEval();
  } catch (err) {
    await logError(
      "api_failure",
      "phase-b-eval",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Phase B evaluation failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runPhaseBEval();
  } catch (err) {
    await logError(
      "api_failure",
      "phase-b-eval",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Phase B evaluation failed" }, { status: 500 });
  }
}
