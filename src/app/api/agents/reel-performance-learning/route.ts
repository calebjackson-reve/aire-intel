export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readFile, appendFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { logError, withRetry } from "@/lib/error-memory";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const STUDIO_PATH = process.env.TEARDOWN_STUDIO_PATH ?? "/Users/caleb/teardown-studio";
const LEDGER_PATH = join(process.cwd(), "src", "lib", "reel", "memory", "LEDGER.md");

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}
export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

async function run() {
  try {
    // ── Guard ─────────────────────────────────────────────────────────────────
    const lastRunRow = await prisma.setting.findUnique({ where: { key: "reel.performance.lastRun" } });
    if (lastRunRow?.value) {
      const lastRun = new Date(lastRunRow.value);
      const diffDays = (Date.now() - lastRun.getTime()) / 86_400_000;
      if (diffDays < 6) return NextResponse.json({ skipped: true, reason: `last run ${diffDays.toFixed(1)}d ago` });
    }

    const reelPerf = await prisma.contentPerformance.findMany({
      where: {
        contentProject: { type: "reel" },
        fetchedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      include: { contentProject: { select: { motionSpec: true, referenceRecipeId: true } } },
      take: 50,
    });

    if (reelPerf.length < 3) return NextResponse.json({ skipped: true, reason: `only ${reelPerf.length} reel performance rows` });

    // ── Fetch flywheel + hook patterns ───────────────────────────────────────
    const [preferences, recipes] = await Promise.all([
      prisma.contentPreference.findMany({ where: { patternType: { startsWith: "reel_" } } }),
      prisma.videoRecipe.findMany({ where: { hookPatterns: { not: undefined } }, take: 20 }),
    ]);

    // ── Load grammar for context ──────────────────────────────────────────────
    let grammarCtx = "";
    const grammarPath = join(STUDIO_PATH, "intelligence", "grammars", "real-estate-creators.md");
    if (existsSync(grammarPath)) {
      grammarCtx = (await readFile(grammarPath, "utf-8").catch(() => "")).slice(0, 2000);
    }

    // ── Analyze with Claude Sonnet ────────────────────────────────────────────
    const analysis = await withRetry(async () => {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `You are the self-improving reel intelligence for Caleb Jackson at Rêve Realtors® Baton Rouge.
Analyze performance data and identify the top-performing patterns. Output ONLY valid JSON:
{
  "topPacing": "fast|medium|slow",
  "topGrade": "boost|contrast|none",
  "topHookArchetype": string,
  "insight": string (3 sentences max, plain English, actionable)
}`,
        messages: [{
          role: "user",
          content: `Reel performance (last 30d):\n${JSON.stringify(reelPerf.slice(0, 20).map((p) => ({
            reach: p.reach, saves: p.saves, engagementRate: p.engagementRate,
            motionHint: p.contentProject?.motionSpec ? JSON.parse(p.contentProject.motionSpec)?.fingerprint : null,
          })), null, 2)}

ContentPreference flywheel (approvalRate):\n${JSON.stringify(preferences.map((p) => ({ type: p.patternType, value: p.value, rate: p.approvalRate, n: p.approvals + p.rejections })), null, 2)}

Grammar context:\n${grammarCtx.slice(0, 1000)}`,
        }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    }, { source: "reel-performance-learning" });

    // ── Update Settings ───────────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    await Promise.all([
      prisma.setting.upsert({ where: { key: "reel.topPacing" }, create: { key: "reel.topPacing", value: analysis.topPacing }, update: { value: analysis.topPacing } }),
      prisma.setting.upsert({ where: { key: "reel.topGrade" }, create: { key: "reel.topGrade", value: analysis.topGrade }, update: { value: analysis.topGrade } }),
      prisma.setting.upsert({ where: { key: "reel.topHookArchetype" }, create: { key: "reel.topHookArchetype", value: analysis.topHookArchetype }, update: { value: analysis.topHookArchetype } }),
      prisma.setting.upsert({ where: { key: "reel.performance.lastRun" }, create: { key: "reel.performance.lastRun", value: today }, update: { value: today } }),
    ]);

    // ── Notify ────────────────────────────────────────────────────────────────
    await prisma.notification.create({
      data: {
        type: "social_post",
        title: "Reel Intelligence Updated",
        body: analysis.insight ?? "Weekly reel analysis complete.",
        href: "/studio",
      },
    }).catch(() => {});

    // ── Append to LEDGER (local only) ─────────────────────────────────────────
    if (process.env.VERCEL !== "1" && existsSync(join(process.cwd(), "src", "lib", "reel", "memory"))) {
      const ledgerEntry = `\n\n### ${today}\n- topPacing: ${analysis.topPacing}\n- topGrade: ${analysis.topGrade}\n- topHookArchetype: ${analysis.topHookArchetype}\n- insight: ${analysis.insight}\n- reelCount: ${reelPerf.length}`;
      await appendFile(LEDGER_PATH, ledgerEntry).catch(() => {});
    }

    return NextResponse.json({ ok: true, analysis, reelCount: reelPerf.length });

  } catch (err) {
    await logError("ai", "agents/reel-performance-learning", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
