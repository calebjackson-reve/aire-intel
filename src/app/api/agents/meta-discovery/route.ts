export const dynamic = "force-dynamic";
// AIRE: loop:monthly-meta-discovery
// Vercel cron: 0 5 28 * * (11PM CT 27th = 5AM UTC 28th)
// Reads REGISTRY.md, pulls AgentRun/ActionQueue metrics per loop, classifies green/yellow/red.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/error-memory";
import { invalidateSettingsCache } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

function parseRegistry(content: string): Array<{ slug: string; status: string }> {
  const rows: Array<{ slug: string; status: string }> = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\|\s*\d+\s*\|\s*\[([^\]]+)\]\([^)]+\)\s*\|.+\|\s*([\w-]+)\s*\|/);
    if (match) {
      rows.push({ slug: match[1].trim(), status: match[2].trim() });
    }
  }
  return rows;
}

function slugToAgentType(slug: string): string {
  return slug.replace(/-/g, "_");
}

interface LoopMetrics {
  slug: string;
  agentType: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  actionsQueued: number;
  approvalRate: number;
  status: "green" | "yellow" | "red";
}

async function getMetricsForLoop(slug: string, since: Date): Promise<LoopMetrics> {
  const agentType = slugToAgentType(slug);

  const runs = await prisma.agentRun
    .findMany({
      where: { agentType, startedAt: { gte: since } },
      select: { status: true, durationMs: true },
    })
    .catch(() => []);

  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === "completed").length;
  const successRate = totalRuns > 0 ? successRuns / totalRuns : 0;
  const avgDurationMs =
    totalRuns > 0
      ? Math.round(runs.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / totalRuns)
      : 0;

  const actions = await prisma.actionQueue
    .findMany({
      where: { agentType, createdAt: { gte: since } },
      select: { approvedAt: true },
    })
    .catch(() => []);

  const actionsQueued = actions.length;
  const approved = actions.filter((a) => a.approvedAt !== null).length;
  const approvalRate = actionsQueued > 0 ? approved / actionsQueued : 0;

  let loopStatus: "green" | "yellow" | "red";
  if (successRate >= 0.9 && actionsQueued > 0) {
    loopStatus = "green";
  } else if (successRate >= 0.7) {
    loopStatus = "yellow";
  } else {
    loopStatus = "red";
  }

  return { slug, agentType, totalRuns, successRate, avgDurationMs, actionsQueued, approvalRate, status: loopStatus };
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

async function runMetaDiscovery() {
  const startedAt = Date.now();

  const disabledRow = await prisma.setting
    .findUnique({ where: { key: "loop.monthly_meta_discovery.disabled" } })
    .catch(() => null);
  if (disabledRow?.value === "true") {
    return Response.json({ skipped: true, reason: "loop disabled" });
  }

  const lastRunRow = await prisma.setting
    .findUnique({ where: { key: "loops.lastMetaDiscovery" } })
    .catch(() => null);
  if (lastRunRow?.value) {
    const daysSince = (Date.now() - new Date(lastRunRow.value).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 20) {
      return Response.json({ skipped: true, reason: "already ran within 20 days", lastRun: lastRunRow.value });
    }
  }

  const registryPath = path.join(process.cwd(), "loops", "REGISTRY.md");
  let registryContent: string;
  try {
    registryContent = fs.readFileSync(registryPath, "utf-8");
  } catch {
    return Response.json({ skipped: true, reason: "loops directory not available in production" });
  }

  const loops = parseRegistry(registryContent).filter((l) =>
    ["active", "scaffolded", "deployed"].includes(l.status)
  );

  if (loops.length === 0) {
    return Response.json({ skipped: true, reason: "no eligible loops found in REGISTRY.md" });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const results: LoopMetrics[] = await Promise.all(loops.map((l) => getMetricsForLoop(l.slug, since)));

  const greenCount = results.filter((r) => r.status === "green").length;
  const yellowCount = results.filter((r) => r.status === "yellow").length;
  const redCount = results.filter((r) => r.status === "red").length;

  const topPerformer = results.reduce(
    (best, r) => (r.successRate > best.successRate ? r : best),
    results[0]
  );

  const now = new Date().toISOString();
  await Promise.all([
    upsertSetting("loops.deployedRoiMetrics", JSON.stringify(results)),
    upsertSetting("loops.lastMetaDiscovery", now),
  ]);

  await prisma.notification
    .create({
      data: {
        type: "info",
        title: "Monthly Loop ROI Report",
        body: `Monthly loop ROI: ${greenCount} green, ${yellowCount} yellow, ${redCount} red. Top performer: ${topPerformer.slug}.`,
        href: "/system",
      },
    })
    .catch(() => null);

  await prisma.agentRun
    .create({
      data: {
        agentType: "monthly_meta_discovery",
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: loops.length,
        actionsQueued: 0,
        durationMs: Date.now() - startedAt,
      },
    })
    .catch(() => null);

  return Response.json({ ok: true, loopsEvaluated: loops.length, green: greenCount, yellow: yellowCount, red: redCount, topPerformer: topPerformer.slug, results });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runMetaDiscovery();
  } catch (err) {
    await logError("api_failure", "meta-discovery", err instanceof Error ? err : new Error(String(err)));
    return Response.json({ error: "Meta discovery failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  try {
    return await runMetaDiscovery();
  } catch (err) {
    await logError("api_failure", "meta-discovery", err instanceof Error ? err : new Error(String(err)));
    return Response.json({ error: "Meta discovery failed" }, { status: 500 });
  }
}
