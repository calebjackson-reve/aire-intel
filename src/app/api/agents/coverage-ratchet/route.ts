// AIRE: loop:test-coverage-ratchet
// Vercel cron: 0 7 * * 6 (1AM CT Saturday)
// Reads coverage data written by coverage-check.sh, compares to baseline,
// updates Setting baseline on improvement, emits Notification on violation.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const METRICS = ["lines", "branches", "functions", "statements"] as const;
type Metric = (typeof METRICS)[number];
type CoverageData = Record<Metric, number>;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runCoverageRatchet();
}

export async function GET() {
  return runCoverageRatchet();
}

async function runCoverageRatchet() {
  try {
    // Dedup: skip if run within 6 days
    const lastRunRow = await prisma.setting
      .findUnique({ where: { key: "coverage.lastRun" } })
      .catch(() => null);
    if (lastRunRow?.value) {
      const daysSince =
        (Date.now() - new Date(lastRunRow.value).getTime()) / 86_400_000;
      if (daysSince < 6) {
        return Response.json({
          skipped: true,
          reason: "ran within last 6 days",
          lastRun: lastRunRow.value,
        });
      }
    }

    // Read coverage data stored by coverage-check.sh
    const latestRow = await prisma.setting
      .findUnique({ where: { key: "coverage.latest" } })
      .catch(() => null);

    if (!latestRow?.value) {
      return Response.json({
        skipped: true,
        reason: "no coverage data — run coverage-check.sh locally first",
        action: "bash loops/active/18-test-coverage-ratchet/coverage-check.sh",
      });
    }

    const latest: CoverageData = JSON.parse(latestRow.value);

    // Read or initialise baseline
    const baselineRow = await prisma.setting
      .findUnique({ where: { key: "coverage.baseline" } })
      .catch(() => null);

    if (!baselineRow?.value) {
      await upsertSetting("coverage.baseline", latestRow.value);
      await upsertLastRun();
      return Response.json({ status: "baseline_set", baseline: latest });
    }

    const baseline: CoverageData = JSON.parse(baselineRow.value);
    const violations = METRICS.filter((m) => latest[m] < baseline[m]);

    if (violations.length > 0) {
      await logError(
        "validation",
        "coverage-ratchet",
        new Error(`Coverage dropped: ${violations.join(", ")}`),
        { latest, baseline }
      );
      await prisma.notification
        .create({
          data: {
            type: "warning",
            title: "Coverage ratchet violation",
            body: `Coverage dropped in: ${violations.join(", ")}. Run coverage-check.sh to recover.`,
          },
        })
        .catch(() => null);
      return Response.json({ status: "violation", violations, latest, baseline });
    }

    // All metrics held or improved — update baseline + history
    const improved = METRICS.filter((m) => latest[m] > baseline[m]);
    await upsertSetting("coverage.baseline", latestRow.value);
    await appendHistory(latest);
    await prisma.notification
      .create({
        data: {
          type: "info",
          title: "Coverage ratchet: baseline updated",
          body: `Lines: ${latest.lines}%, Branches: ${latest.branches}%${improved.length ? ` — improved: ${improved.join(", ")}` : ""}`,
        },
      })
      .catch(() => null);
    await upsertLastRun();
    return Response.json({ status: "ok", improved, latest, baseline });
  } catch (err) {
    await logError(
      "api_failure",
      "coverage-ratchet",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Coverage ratchet failed" }, { status: 500 });
  }
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function upsertLastRun() {
  await upsertSetting("coverage.lastRun", new Date().toISOString());
}

async function appendHistory(snapshot: CoverageData) {
  const row = await prisma.setting
    .findUnique({ where: { key: "coverage.history" } })
    .catch(() => null);
  const history: Array<CoverageData & { date: string }> = row?.value
    ? JSON.parse(row.value)
    : [];
  history.push({ ...snapshot, date: new Date().toISOString() });
  if (history.length > 8) history.splice(0, history.length - 8);
  await upsertSetting("coverage.history", JSON.stringify(history));
}
