export const dynamic = "force-dynamic";
// AIRE: loop:content-optimizer
// Vercel cron: 0 6 * * 1 (Monday 6AM UTC = Monday 1AM CT)
// Reads approved/rejected posts from the last 30 days, extracts preference
// patterns, generates an evolved system prompt delta via Claude, and stores it
// as content.promptEvolution.v{n} in Settings.

import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache } from "@/lib/settings";
import Anthropic from "@anthropic-ai/sdk";
import { REVE_BRAND_SYSTEM } from "@/lib/reve-system-prompt";
import { logError } from "@/lib/error-memory";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSettingsCache([key]);
}

export async function POST(req: Request) {
  const auth = (req as Request & { headers: Headers }).headers.get("x-cron-secret");
  if (!verifyCronSecret(auth)) return cronUnauthorized();
  return runOptimizer();
}

export async function GET(req: Request) {
  const auth = (req as Request & { headers: Headers }).headers.get("x-cron-secret");
  if (!verifyCronSecret(auth)) return cronUnauthorized();
  return runOptimizer();
}

async function runOptimizer() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Pull feedback data
  const [approvedPosts, rejectedPosts, preferences] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { userFeedback: "approved", createdAt: { gte: since } },
      select: { caption: true, postType: true, qualityScore: true },
    }),
    prisma.scheduledPost.findMany({
      where: { userFeedback: "rejected", createdAt: { gte: since } },
      select: { caption: true, postType: true, feedbackNote: true },
    }),
    prisma.contentPreference.findMany({
      orderBy: { approvalRate: "desc" },
      take: 20,
    }),
  ]);

  if (approvedPosts.length + rejectedPosts.length < 3) {
    return Response.json({ skipped: true, reason: "not enough feedback yet — need at least 3 rated posts" });
  }

  // Build what's working / what's not
  const topPatterns = preferences.filter(p => p.approvalRate >= 0.7 && p.approvals >= 2);
  const weakPatterns = preferences.filter(p => p.approvalRate <= 0.3 && p.rejections >= 2);

  // Get current version number
  const versionRow = await prisma.setting.findUnique({ where: { key: "content.promptVersion" } }).catch(() => null);
  const version = parseInt(versionRow?.value ?? "0") + 1;

  // Ask Claude to synthesize what's working into an evolved prompt delta
  let promptDelta = "";
  try {
    const res = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `You are analyzing content performance for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.

APPROVED POSTS (${approvedPosts.length} in last 30 days):
${approvedPosts.slice(0, 5).map(p => `- [${p.postType ?? "unknown"}] "${p.caption?.slice(0, 120)}"`).join("\n")}

REJECTED POSTS (${rejectedPosts.length} in last 30 days):
${rejectedPosts.slice(0, 5).map(p => `- "${p.caption?.slice(0, 120)}" | reason: ${p.feedbackNote ?? "none given"}`).join("\n")}

TOP PERFORMING PATTERNS:
${topPatterns.map(p => `- ${p.patternType}: "${p.value}" (${Math.round(p.approvalRate * 100)}% approval, ${p.approvals} times)`).join("\n")}

WEAKEST PATTERNS:
${weakPatterns.map(p => `- ${p.patternType}: "${p.value}" (${Math.round(p.approvalRate * 100)}% approval)`).join("\n")}

Write a PROMPT DELTA — a short addition (max 150 words) to append to the existing brand system prompt that will make future posts more like the approved ones and less like the rejected ones. Focus only on what's genuinely new — don't repeat existing brand rules. Be specific: "use fragment hooks" not "write better".`,
      }],
    });
    promptDelta = res.content.find(b => b.type === "text")?.text ?? "";
  } catch (err) {
    await logError("api_failure", "content-optimizer/claude", err as Error);
    return Response.json({ error: "Claude call failed" }, { status: 500 });
  }

  // Store the evolved prompt delta
  await Promise.all([
    upsertSetting(`content.promptEvolution.v${version}`, promptDelta),
    upsertSetting("content.promptVersion", String(version)),
    upsertSetting("content.lastOptimizerRun", new Date().toISOString()),
    prisma.notification.create({
      data: {
        type: "success",
        title: `Content Engine v${version} — prompt evolved`,
        body: `Based on ${approvedPosts.length} approved / ${rejectedPosts.length} rejected posts. New delta stored.`,
        href: "/create-post",
      },
    }).catch(() => null),
  ]);

  return Response.json({
    ok: true,
    version,
    approvedPosts: approvedPosts.length,
    rejectedPosts: rejectedPosts.length,
    topPatterns: topPatterns.length,
    promptDelta: promptDelta.slice(0, 200) + "...",
  });
}
