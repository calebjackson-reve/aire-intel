export const dynamic = "force-dynamic";

// Loop 30 — Skill Optimizer
// Cron: 0 7 * * 0 (Sunday 2AM CT = 7AM UTC)
// Picks 1 loop per week (round-robin via Setting table), scores its prompt by approval
// rate from ActionQueue, generates 3 improved variants via claude-opus-4-8, writes
// PROMPT.variants.md, creates ActionQueue skill_review item. Never auto-applies variants.

import fs from "fs";
import path from "path";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { getTodayCT } from "@/lib/brief-date";

const LOOPS_DIR = path.join(process.cwd(), "loops/active");
const TOTAL_LOOPS = 29;

// Derive ISO week string (e.g. "2026-W24") for idempotency
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Derive loop slug from directory name: "03-calendly-post-meeting-followup" → "calendly_post_meeting_followup"
function dirToSlug(dir: string): string {
  return dir.replace(/^\d+-/, "").replace(/-/g, "_");
}

// Call Anthropic to generate 3 variant prompts
async function generateVariants(slug: string, currentPrompt: string, approvalRate: number | null): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "(variants unavailable — ANTHROPIC_API_KEY not set)";
  }

  const approvalText = approvalRate !== null
    ? `${(approvalRate * 100).toFixed(0)}% approval rate (last 30 days)`
    : "no approval rate data available";

  const userMessage = `You are reviewing a weekly-cron loop prompt for the AIRE platform (an autonomous real estate operations system for Rêve Realtors® Baton Rouge).

Loop slug: ${slug}
Current approval rate: ${approvalText}

Current PROMPT.md:
---
${currentPrompt.slice(0, 3000)}
---

Generate exactly 3 improved variant prompts. For each variant provide:
1. A one-sentence hypothesis explaining why this variant will perform better
2. The full improved prompt text

Format your response as:

## Variant 1
**Hypothesis:** <one sentence>

<full prompt text>

## Variant 2
**Hypothesis:** <one sentence>

<full prompt text>

## Variant 3
**Hypothesis:** <one sentence>

<full prompt text>

Focus improvements on: specificity, edge case handling, output format clarity, and reducing ambiguity that could cause the agent to stall or require human correction.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2000,
        system: "You are an expert AI agent prompt engineer. You improve loop prompts for an autonomous real estate operations system called AIRE.",
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return `(variants unavailable — Anthropic API error ${res.status}: ${errText.slice(0, 200)})`;
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) return "(variants unavailable — empty response from claude-opus-4-8)";
    return `# PROMPT.variants.md — ${slug}\nGenerated: ${new Date().toISOString()}\n\n${text}`;
  } catch (err) {
    return `(variants unavailable — fetch error: ${String(err).slice(0, 200)})`;
  }
}

async function runSkillOptimizer() {
  const today = getTodayCT();
  const now = new Date();
  const week = isoWeek(now);

  // 1. Read and advance round-robin rank
  const rankSetting = await prisma.setting.findUnique({ where: { key: "skill_optimizer.last_loop_rank" } });
  const lastRank = rankSetting ? parseInt(rankSetting.value, 10) : 0;
  const rank = (lastRank % TOTAL_LOOPS) + 1; // 1–29
  await prisma.setting.upsert({
    where: { key: "skill_optimizer.last_loop_rank" },
    create: { key: "skill_optimizer.last_loop_rank", value: String(rank) },
    update: { value: String(rank) },
  });

  // 2. Find the loop directory for this rank
  const prefix = String(rank).padStart(2, "0");
  let loopDirs: string[] = [];
  try {
    loopDirs = fs.readdirSync(LOOPS_DIR);
  } catch (err) {
    await logError("ai", "/api/agents/skill-optimizer", err, { rank, action: "readdir" });
    return Response.json({ ok: false, error: `Cannot read loops/active: ${String(err)}` }, { status: 500 });
  }

  const dir = loopDirs.find((d) => d.startsWith(prefix + "-"));
  if (!dir) {
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: `Skill Optimizer: no loop found for rank ${rank}`,
        body: `Expected a directory starting with "${prefix}-" in loops/active/. Run skipped.`,
        href: "/system",
      },
    });
    return Response.json({ ok: false, error: `no loop directory for rank ${rank}` });
  }

  const slug = dirToSlug(dir);

  // 3. Idempotency: skip if already ran for this loop this week
  const idempotencyKey = `skill_optimizer.${slug}.last_run_week`;
  const lastRunWeek = await prisma.setting.findUnique({ where: { key: idempotencyKey } });
  if (lastRunWeek?.value === week) {
    return Response.json({ ok: true, skipped: "already_ran_this_week", slug, week });
  }

  // 4. Read the loop's PROMPT.md
  const promptPath = path.join(LOOPS_DIR, dir, "PROMPT.md");
  let currentPrompt: string;
  try {
    currentPrompt = fs.readFileSync(promptPath, "utf8");
  } catch (err) {
    await prisma.notification.create({
      data: {
        type: "sync_complete",
        title: `Skill Optimizer: cannot read PROMPT.md for ${slug}`,
        body: `Path: loops/active/${dir}/PROMPT.md — ${String(err).slice(0, 120)}`,
        href: "/system",
      },
    });
    return Response.json({ ok: false, error: `Cannot read PROMPT.md for ${dir}` });
  }

  // 5. Compute approval rate for this loop's agentType (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [approvedCount, totalCount] = await Promise.all([
    prisma.actionQueue.count({
      where: {
        agentType: slug,
        status: { in: ["approved", "executed"] },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.actionQueue.count({
      where: {
        agentType: slug,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);
  const approvalRate: number | null = totalCount > 0 ? approvedCount / totalCount : null;

  // 6. Generate 3 variants via claude-opus-4-8
  const variantsText = await generateVariants(slug, currentPrompt, approvalRate);

  // 7. Write PROMPT.variants.md to the target loop's directory
  const variantsPath = path.join(LOOPS_DIR, dir, "PROMPT.variants.md");
  try {
    fs.writeFileSync(variantsPath, variantsText, "utf8");
  } catch (err) {
    await logError("ai", "/api/agents/skill-optimizer", err, { slug, action: "writeVariants" });
    // Non-fatal: continue to create ActionQueue item
  }

  const variantsSummary = variantsText.slice(0, 300);
  const approvalRateDisplay = approvalRate !== null
    ? `${(approvalRate * 100).toFixed(0)}%`
    : "no data";

  // 8. Create ActionQueue skill_review item — requiresApproval hardcoded true
  await prisma.actionQueue.create({
    data: {
      type: "skill_review",
      agentType: "skill-optimizer",
      requiresApproval: true,
      priority: 5,
      briefDate: today,
      payload: {
        slug,
        dir,
        approvalRate,
        approvalRateDisplay,
        variantsSummary,
        promptPath: `loops/active/${dir}/PROMPT.md`,
        variantsPath: `loops/active/${dir}/PROMPT.variants.md`,
        week,
      },
    },
  });

  // 9. Create Notification
  await prisma.notification.create({
    data: {
      type: "sync_complete",
      title: `Skill Optimizer: ${slug} — 3 variants ready`,
      body: `Approval rate: ${approvalRateDisplay}. Review loops/active/${dir}/PROMPT.variants.md`,
      href: "/system",
    },
  });

  // 10. Write idempotency key
  await prisma.setting.upsert({
    where: { key: idempotencyKey },
    create: { key: idempotencyKey, value: week },
    update: { value: week },
  });

  return Response.json({ ok: true, slug, approvalRate, approvalRateDisplay, dir, week, rank });
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  try {
    return await runSkillOptimizer();
  } catch (err) {
    await logError("ai", "/api/agents/skill-optimizer", err, { route: "/api/agents/skill-optimizer", method: "POST" });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  try {
    return await runSkillOptimizer();
  } catch (err) {
    await logError("ai", "/api/agents/skill-optimizer", err, { route: "/api/agents/skill-optimizer", method: "GET" });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
