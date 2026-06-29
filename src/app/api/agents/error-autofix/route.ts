export const dynamic = "force-dynamic";
// AIRE: loop:error-memory-autofix
// Nightly autofix: reads recurring error patterns, applies targeted fixes, oracle-gates each one.

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { logError, detectPatterns, getHealthScore } from "@/lib/error-memory";
import { getSetting, invalidateSettingsCache } from "@/lib/settings";

const PROJECT_ROOT = process.cwd();

// ─── Source file resolution ───────────────────────────────────────────────────
// Maps the ErrorLog `source` field (e.g. "/api/lofty/sync", "src/lib/lofty") to an
// absolute file path. Returns null if no readable file is found.
function resolveSourceFile(source: string): string | null {
  const candidates: string[] = [];

  if (source.startsWith("src/")) {
    candidates.push(
      path.join(PROJECT_ROOT, source),
      path.join(PROJECT_ROOT, source + ".ts"),
      path.join(PROJECT_ROOT, source + ".tsx"),
    );
  }

  if (source.includes("/api/")) {
    const apiPart = source.includes("/api/") ? source.slice(source.indexOf("/api/")) : source;
    const rel = apiPart.startsWith("/") ? apiPart.slice(1) : apiPart;
    candidates.push(
      path.join(PROJECT_ROOT, "src/app", rel, "route.ts"),
      path.join(PROJECT_ROOT, "src", rel + ".ts"),
    );
  }

  // Fallback: src/lib/<basename>.ts
  candidates.push(path.join(PROJECT_ROOT, "src/lib", path.basename(source) + ".ts"));

  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      // try next
    }
  }
  return null;
}

// ─── Fix classification ───────────────────────────────────────────────────────
type FixType = "null_guard" | "undefined_guard" | "skip";

function classifyFix(message: string): FixType {
  const m = message.toLowerCase();
  // Auth and infrastructure failures require human — never autofix
  if (
    m.includes("401") ||
    m.includes("unauthorized") ||
    m.includes("expired") ||
    m.includes("econnrefused") ||
    m.includes("rate limit") ||
    m.includes("p2002")
  ) {
    return "skip";
  }
  if (
    m.includes("cannot read properties of undefined") ||
    m.includes("cannot read properties of null")
  ) {
    return "null_guard";
  }
  if (m.includes("is not a function") || m.includes("is undefined")) {
    return "undefined_guard";
  }
  return "skip";
}

// ─── Fix application ──────────────────────────────────────────────────────────
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Adds optional chaining to the first unguarded `.propName` access in the file.
// Targets only the first occurrence to minimize blast radius.
function applyNullGuard(content: string, message: string): string {
  const match = message.match(/reading '([^']+)'/);
  if (!match) return content;

  const prop = match[1];
  const re = new RegExp(`(?<!\\?)\\.(${escapeRegex(prop)})(?=[\\s;,)\\].])`, "");
  const lines = content.split("\n");
  let patched = false;

  const result = lines.map((line) => {
    if (patched) return line;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return line;
    if (re.test(line)) {
      patched = true;
      return line.replace(re, `?.${prop}`);
    }
    return line;
  });

  return result.join("\n");
}

function applyFix(content: string, message: string, fixType: FixType): string {
  if (fixType === "null_guard" || fixType === "undefined_guard") {
    return applyNullGuard(content, message);
  }
  return content;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  invalidateSettingsCache([key]);
}

// ─── Core autofix logic ───────────────────────────────────────────────────────
async function runAutofix() {
  const runStart = Date.now();

  const disabled = await getSetting("autofix.disabled");
  if (disabled === "true") {
    return Response.json({ ok: true, skipped: true, reason: "autofix.disabled=true" });
  }

  const health = await getHealthScore();
  if (health.score > 85) {
    await upsertSetting("autofix.lastRun", new Date().toISOString());
    return Response.json({
      ok: true,
      skipped: true,
      reason: "health_score_healthy",
      score: health.score,
      summary: health.summary,
    });
  }

  const skippedRaw = await getSetting("autofix.skippedPatterns");
  const skipped: string[] = skippedRaw
    ? (JSON.parse(skippedRaw) as string[]).filter(Boolean)
    : [];

  // detectPatterns() groups at ≥2; filter to ≥3 per spec
  const allPatterns = await detectPatterns();
  const qualifying = allPatterns
    .filter((p) => p.count >= 3)
    .filter((p) => !skipped.includes(`${p.type}::${p.source}`))
    .slice(0, 3);

  const run = await prisma.agentRun.create({
    data: { agentType: "error_autofix", status: "running" },
  });

  const results: Array<{
    pattern: string;
    status: "fixed" | "reverted" | "skipped" | "no_file";
    errorsResolved?: number;
  }> = [];

  let fixedCount = 0;

  try {
    for (const pattern of qualifying) {
      const patternKey = `${pattern.type}::${pattern.source}`;

      const fixType = classifyFix(pattern.message);
      if (fixType === "skip") {
        results.push({ pattern: patternKey, status: "skipped" });
        continue;
      }

      const filePath = resolveSourceFile(pattern.source);
      if (!filePath) {
        results.push({ pattern: patternKey, status: "no_file" });
        continue;
      }

      let original: string;
      try {
        original = readFileSync(filePath, "utf8");
      } catch {
        results.push({ pattern: patternKey, status: "no_file" });
        continue;
      }

      const fixed = applyFix(original, pattern.message, fixType);
      if (fixed === original) {
        results.push({ pattern: patternKey, status: "skipped" });
        continue;
      }

      let writeOk = false;
      try {
        writeFileSync(filePath, fixed, "utf8");
        writeOk = true;
      } catch {
        results.push({ pattern: patternKey, status: "skipped" });
        continue;
      }

      if (!writeOk) continue;

      let oraclePassed = false;
      try {
        execSync("npx tsc --noEmit", {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
          timeout: 120_000,
        });
        oraclePassed = true;
      } catch {
        // Oracle failed — revert immediately
        try {
          writeFileSync(filePath, original, "utf8");
        } catch {
          // Revert failed — log but continue
        }
      }

      if (oraclePassed) {
        const toResolve = pattern.errorIds.slice(0, 3);
        await prisma.errorLog.updateMany({
          where: { id: { in: toResolve } },
          data: { resolved: true, resolution: "autofix", resolvedAt: new Date() },
        });

        await prisma.notification.create({
          data: {
            type: "sync_complete",
            title: `Autofix resolved ${toResolve.length} recurring error${toResolve.length !== 1 ? "s" : ""}`,
            body: `${patternKey} — ${pattern.message.slice(0, 80)}`,
            href: "/system",
          },
        });

        fixedCount += toResolve.length;
        results.push({ pattern: patternKey, status: "fixed", errorsResolved: toResolve.length });
      } else {
        const newSkipped = [...skipped, patternKey];
        await upsertSetting("autofix.skippedPatterns", JSON.stringify(newSkipped));
        skipped.push(patternKey);

        await prisma.notification.create({
          data: {
            type: "sync_complete",
            title: `Autofix attempted ${pattern.source} — could not fix, escalated`,
            body: `${patternKey} reverted after oracle failure. Manual review needed.`,
            href: "/system",
          },
        });

        await logError("ai", "error-autofix", new Error(`Oracle failed for ${patternKey}`), {
          route: "/api/agents/error-autofix",
        });

        results.push({ pattern: patternKey, status: "reverted" });
      }
    }

    await upsertSetting("autofix.lastRun", new Date().toISOString());

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: fixedCount,
        actionsQueued: 0,
        durationMs: Date.now() - runStart,
      },
    });

    return Response.json({
      ok: true,
      runId: run.id,
      healthScore: health.score,
      healthTrend: health.trend,
      patternsChecked: qualifying.length,
      results,
      fixedCount,
    });
  } catch (err) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorLog: [{ error: String(err) }],
        durationMs: Date.now() - runStart,
      },
    });
    throw err;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────
export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runAutofix();
  } catch (err) {
    await logError("ai", "/api/agents/error-autofix", err, {
      route: "/api/agents/error-autofix",
      method: "POST",
    });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  try {
    return await runAutofix();
  } catch (err) {
    await logError("ai", "/api/agents/error-autofix", err, {
      route: "/api/agents/error-autofix",
      method: "GET",
    });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
