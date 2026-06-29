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
    const lastRunRow = await prisma.setting.findUnique({ where: { key: "trend.lastRun" } });
    if (lastRunRow?.value) {
      const diffDays = (Date.now() - new Date(lastRunRow.value).getTime()) / 86_400_000;
      if (diffDays < 6) return NextResponse.json({ skipped: true, reason: `last run ${diffDays.toFixed(1)}d ago` });
    }

    const currentMonth = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

    // ── Load current installed formats for cross-reference ────────────────────
    const installedRow = await prisma.setting.findUnique({ where: { key: "reel.installedFormats" } });
    const installedFormats: string[] = installedRow?.value
      ? (JSON.parse(installedRow.value) as { name: string }[]).map((f) => f.name)
      : [];

    // ── Web research: trending RE content formats ─────────────────────────────
    const research = await withRetry(async () => {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1600,
        system: `You are a social media trend researcher for real estate content. Analyze current trends in real estate Instagram Reels and TikTok content.
Current installed formats: ${installedFormats.join(", ") || "none yet"}.
Focus on: new hook formulas gaining traction, editing styles rising, formats declining, what luxury real estate creators are doing.
Output ONLY valid JSON:
{
  "newFormats": [{ "name": string, "formula": string, "signal": string, "direction": "rising|plateau|declining" }],
  "surgingFormats": [string],
  "decliningFormats": [string],
  "weeklyInsight": string (2-3 sentences, actionable for Caleb)
}`,
        messages: [{
          role: "user",
          content: `Research viral real estate reel trends for ${currentMonth}. Focus on Instagram Reels and TikTok formats working NOW for luxury/high-end real estate agents. What hook archetypes, editing styles, and content formats are gaining traction? What's declining? Cross-reference against Baton Rouge / Southern US real estate context.`,
        }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const clean = text.replace(/```json\n?|\n?```/g, "").trim();
      // Extract just the JSON object in case there's trailing prose
      const match = clean.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : JSON.parse(clean);
    }, { source: "trend-watcher-research" });

    // ── Drain URL queue ────────────────────────────────────────────────────────
    const queuedRecipes = await prisma.videoRecipe.findMany({
      where: { sourceType: "queued" },
      take: 5,
    });

    for (const recipe of queuedRecipes) {
      if (!recipe.url) continue;
      try {
        const { downloadVideoUrl, extractThumbnail, analyzeVideoFile, appendToGrammar } = await import("@/lib/studio/ingest");
        const { storeAsset } = await import("@/lib/render/storage");

        const dl = await downloadVideoUrl(recipe.url);
        const analyzed = await analyzeVideoFile(dl.localPath).catch(() => null);
        const thumbBuf = await extractThumbnail(dl.localPath);
        await dl.cleanup();

        let thumbnailUrl = recipe.thumbnailUrl;
        if (thumbBuf) {
          const stored = await storeAsset("thumb.jpg", thumbBuf, "image/jpeg").catch(() => null);
          if (stored) thumbnailUrl = stored.url;
        }

        const sourceType = recipe.url.includes("instagram.com") ? "instagram"
          : recipe.url.includes("tiktok.com") ? "tiktok" : "upload";

        await prisma.videoRecipe.update({
          where: { id: recipe.id },
          data: {
            sourceType,
            recipe: JSON.parse(JSON.stringify(analyzed ?? recipe.recipe)),
            thumbnailUrl,
          },
        });

        if (analyzed) {
          await appendToGrammar([], undefined).catch(() => {});
        }
      } catch { /* non-fatal, skip one bad URL */ }
    }

    // ── Build top formats array ───────────────────────────────────────────────
    const topFormats = [
      ...(research.surgingFormats ?? []).map((f: string) => ({ name: f, direction: "up" })),
      ...(research.newFormats ?? []).filter((f: { direction: string }) => f.direction === "rising").map((f: { name: string }) => ({ name: f.name, direction: "up" })),
    ].slice(0, 5);

    // ── Update Settings ───────────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    await Promise.all([
      prisma.setting.upsert({ where: { key: "trend.topFormats" }, create: { key: "trend.topFormats", value: JSON.stringify(topFormats) }, update: { value: JSON.stringify(topFormats) } }),
      prisma.setting.upsert({ where: { key: "trend.lastRun" }, create: { key: "trend.lastRun", value: today }, update: { value: today } }),
    ]);

    // ── Append to local grammar ───────────────────────────────────────────────
    if (process.env.VERCEL !== "1") {
      const grammarPath = join(STUDIO_PATH, "intelligence", "grammars", "real-estate-creators.md");
      if (existsSync(grammarPath) && research.newFormats?.length) {
        const block = [
          `\n\n### Trend Watcher ${today}`,
          research.weeklyInsight ?? "",
          ...(research.newFormats ?? []).map((f: { name: string; formula: string; direction: string }) =>
            `- **${f.name}** (${f.direction}): ${f.formula}`),
        ].join("\n");
        await appendFile(grammarPath, block).catch(() => {});
      }

      // Ledger
      const ledgerDir = join(process.cwd(), "loops", "active", "36-trend-watcher");
      if (existsSync(ledgerDir)) {
        const ledgerEntry = `\n\n### ${today}\n- newFormats: ${(research.newFormats ?? []).length}\n- queued drained: ${queuedRecipes.length}\n- insight: ${research.weeklyInsight}`;
        await appendFile(join(ledgerDir, "LEDGER.md"), ledgerEntry).catch(() => {});
      }
    }

    // ── Notify ────────────────────────────────────────────────────────────────
    await prisma.notification.create({
      data: {
        type: "social_post",
        title: "Weekly Trend Report",
        body: research.weeklyInsight ?? "Trend analysis complete.",
        href: "/studio",
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, topFormats, newFormats: research.newFormats?.length ?? 0, queueDrained: queuedRecipes.length });

  } catch (err) {
    await logError("ai", "agents/trend-watcher", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
