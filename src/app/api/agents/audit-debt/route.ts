export const dynamic = "force-dynamic";
// AIRE: loop:audit-debt-burndown
// Vercel cron: 0 7 * * 0 (2AM CT Sunday)
// Scans src/ for TODO/FIXME/placeholder debt and TS errors; reports top items.

import { execSync } from "child_process";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const PROJECT_ROOT = process.cwd();

type DebtItem = {
  priority: number;
  file: string;
  line: number;
  kind: string;
  snippet: string;
};

function scanDebtItems(): DebtItem[] {
  const items: DebtItem[] = [];
  try {
    const raw = execSync(
      `grep -rn "TODO\\|FIXME\\|XXX\\|225-XXX\\|YOUR_PHONE\\|placeholder" ${PROJECT_ROOT}/src --include="*.ts" --include="*.tsx" 2>/dev/null | head -50`,
      { encoding: "utf8", timeout: 15_000 }
    );
    for (const line of raw.split("\n").filter(Boolean)) {
      const match = line.match(/^(.+):(\d+):(.+)$/);
      if (!match) continue;
      const [, filePath, lineNum, snippet] = match;
      const rel = filePath.replace(`${PROJECT_ROOT}/`, "");
      const upper = snippet.toUpperCase();
      const isPlaceholder =
        snippet.includes("225-XXX") ||
        snippet.includes("YOUR_PHONE") ||
        upper.includes("PLACEHOLDER");
      items.push({
        priority: isPlaceholder ? 1 : 4,
        file: rel,
        line: parseInt(lineNum, 10),
        kind: isPlaceholder ? "placeholder" : "todo",
        snippet: snippet.trim().slice(0, 120),
      });
    }
  } catch {
    // grep exits non-zero when no matches — not an error
  }
  return items;
}

function countTsErrors(): number {
  try {
    execSync(`npx tsc --noEmit 2>&1`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    return 0;
  } catch (err) {
    const output = (err as { stdout?: string }).stdout ?? "";
    return output.split("\n").filter((l) => l.includes(" error TS")).length;
  }
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function runAuditDebt() {
  const startedAt = Date.now();

  // Dedup: skip if run within 6 days
  const lastRunRow = await prisma.setting
    .findUnique({ where: { key: "auditdebt.lastScan" } })
    .catch(() => null);
  if (lastRunRow?.value) {
    const daysSince =
      (Date.now() - new Date(lastRunRow.value).getTime()) / 86_400_000;
    if (daysSince < 6) {
      return Response.json({
        skipped: true,
        reason: "ran within last 6 days",
        lastScan: lastRunRow.value,
      });
    }
  }

  // Read completed/blocked items to filter out already-fixed debt
  const completedRow = await prisma.setting
    .findUnique({ where: { key: "auditdebt.completedItems" } })
    .catch(() => null);
  const completedItems: string[] = completedRow?.value
    ? JSON.parse(completedRow.value)
    : [];

  // Scan for debt
  const allItems = scanDebtItems();
  const tsErrorCount = countTsErrors();

  // Filter out completed items (keyed by file:line)
  const openItems = allItems.filter(
    (item) => !completedItems.includes(`${item.file}:${item.line}`)
  );

  // Sort by priority; take top 3
  openItems.sort((a, b) => a.priority - b.priority);
  const top3 = openItems.slice(0, 3);

  const todoCount = openItems.length;
  const now = new Date().toISOString();

  // Persist scan state
  await upsertSetting("auditdebt.lastScan", now).catch(() => null);
  await upsertSetting("auditdebt.todoCount", todoCount.toString()).catch(
    () => null
  );

  // Create AgentRun record
  await prisma.agentRun
    .create({
      data: {
        agentType: "audit_debt_burndown",
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: top3.length,
        durationMs: Date.now() - startedAt,
        errorLog: {
          tsErrors: tsErrorCount,
          todoCount,
          completedItems: completedItems.length,
        },
      },
    })
    .catch(() => null);

  // Notification
  const summaryLines = top3.map(
    (item) => `${item.kind.toUpperCase()} ${item.file}:${item.line}`
  );
  const notifBody =
    top3.length > 0
      ? `Top items: ${summaryLines.join(" | ")}. TS errors: ${tsErrorCount}.`
      : `No open debt items found. TS errors: ${tsErrorCount}.`;

  await prisma.notification
    .create({
      data: {
        type: "info",
        title: `Debt scan: ${todoCount} open item${todoCount !== 1 ? "s" : ""}, ${completedItems.length} resolved`,
        body: notifBody,
        href: "/system",
      },
    })
    .catch(() => null);

  return Response.json({
    status: "ok",
    scannedAt: now,
    todoCount,
    tsErrorCount,
    completedCount: completedItems.length,
    top3,
  });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runAuditDebt();
  } catch (err) {
    await logError(
      "api_failure",
      "audit-debt-burndown",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Audit debt scan failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return await runAuditDebt();
  } catch (err) {
    await logError(
      "api_failure",
      "audit-debt-burndown",
      err instanceof Error ? err : new Error(String(err))
    );
    return Response.json({ error: "Audit debt scan failed" }, { status: 500 });
  }
}
