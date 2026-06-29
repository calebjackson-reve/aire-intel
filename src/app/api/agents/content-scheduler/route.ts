export const dynamic = "force-dynamic";
export const maxDuration = 120;
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";
import { logError } from "@/lib/error-memory";
import { getSetting, getParagonConfig } from "@/lib/settings";
import { fetchActiveListings } from "@/lib/paragon";
import { generateUntilPasses, GateResult } from "@/lib/content-gate";
import { QualityFlag } from "@/lib/content-quality";
import { getLearnedStyleGuidance } from "@/lib/content-preferences";

// Content Scheduler Agent — runs at 4:00 AM CT (10:00 UTC) via Vercel cron
// Determines today's content type, generates a post, queues for approval

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

const SCHEDULE: Record<number, string> = {
  0: "client_story",
  1: "market_update",
  2: "listing_spotlight",
  3: "educational",
  4: "market_update",
  5: "listing_spotlight",
  6: "reel",
};

const CAPTION_PROMPTS: Record<string, string> = {
  market_update:       "Write a 2-sentence Instagram caption for a Baton Rouge real estate market update. Be specific, professional, use one data point. No hashtag spam.",
  listing_spotlight:   "Write a punchy 2-sentence Instagram caption for a listing spotlight. Lead with the lifestyle, not specs. Mention Rêve Realtors® subtly.",
  educational:         "Write a 2-sentence educational Instagram caption for Baton Rouge home buyers/sellers. Make the insight feel exclusive. Direct, not fluffy.",
  client_story:        "Write a warm, brief 2-sentence Instagram caption celebrating a client closing. Genuine, not canned.",
  reel:                "Write a 1-sentence hook for a real estate Reel. It should stop the scroll. No emojis in the hook.",
  client_story_repost: "Write a 2-sentence Instagram caption for a client story repost.",
};

async function callHaiku(prompt: string): Promise<string> {
  const res = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.find((b): b is Anthropic.Messages.TextBlock => b.type === "text")?.text?.trim() ?? "";
}

function escalationSuffix(lastScore: number, lastFlags: QualityFlag[]): string {
  if (!lastFlags.length) return "";
  return `\n\nPrevious attempt scored ${lastScore}/100. Fix specifically:\n${lastFlags.map(f => `- ${f.detail}`).join("\n")}\nOutput corrected caption only.`;
}

async function generateCaptionGated(contentType: string, brief: string, learnedGuidance = ""): Promise<GateResult> {
  const systemPrompt = CAPTION_PROMPTS[contentType] ?? CAPTION_PROMPTS.market_update;
  const guidanceBlock = learnedGuidance ? `\n\n${learnedGuidance}` : "";
  return generateUntilPasses(
    async (attempt, lastScore, lastFlags) => {
      const suffix = attempt > 1 && lastScore && lastFlags ? escalationSuffix(lastScore, lastFlags) : "";
      return callHaiku(`${systemPrompt}${guidanceBlock}\n\nContext: ${brief}${suffix}\n\nCaption only — no preamble.`);
    },
    { outputType: "caption" }
  );
}

async function generateReelHookGated(address: string, price: number, feature: string, learnedGuidance = ""): Promise<GateResult> {
  const context = `${address}, $${price.toLocaleString()}, ${feature}`;
  const guidanceBlock = learnedGuidance ? `\n\n${learnedGuidance}` : "";
  return generateUntilPasses(
    async (attempt, lastScore, lastFlags) => {
      const suffix = attempt > 1 && lastScore && lastFlags ? escalationSuffix(lastScore, lastFlags) : "";
      return callHaiku(`Write one punchy Instagram Reel hook (< 125 chars) for this listing: ${context}. Start with a number or a question.${guidanceBlock}${suffix}\n\nReturn the hook only.`);
    },
    { outputType: "reel_hook" }
  );
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) return cronUnauthorized();
  return runContentScheduler();
}

export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runContentScheduler();
}

async function runContentScheduler() {
  const runId = await startRun("content_scheduler");
  const today = getTodayCT();

  try {
    const existing = await prisma.actionQueue.findFirst({
      where: { agentType: "content_scheduler", briefDate: today },
      select: { id: true },
    });
    if (existing) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: true, reason: "Already ran today" });
    }

    const ctDayOfWeek = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
    }).format(new Date());
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const ctDay = dayMap[ctDayOfWeek] ?? 1;
    const contentType = SCHEDULE[ctDay] ?? "market_update";

    // Bias generation toward Caleb's historically-approved patterns (empty until the flywheel has signal).
    const learnedGuidance = await getLearnedStyleGuidance();

    let captionGate: GateResult | null = null;
    let brief = "";
    let trendSignalId: string | undefined;
    let listingPostsQueued = 0;

    if (contentType === "educational") {
      const trend = await prisma.trendSignal.findFirst({
        where: { status: "new" },
        orderBy: { score: "desc" },
        select: { id: true, topic: true, hook: true, detail: true },
      });
      if (trend) {
        trendSignalId = trend.id;
        brief = `Educational post about: ${trend.topic}. Hook: ${trend.hook ?? ""}. ${trend.detail ?? ""}`;
        captionGate = await generateCaptionGated(contentType, brief, learnedGuidance);
        await prisma.trendSignal.update({ where: { id: trend.id }, data: { status: "queued" } });
      }
    } else if (contentType === "listing_spotlight") {
      const zillow = await prisma.zillowHotListing.findFirst({
        where: { usedInPostId: null },
        orderBy: [{ viewCount: "desc" }, { fetchedAt: "desc" }],
        select: { id: true, address: true, city: true, price: true, beds: true, baths: true, viewCount: true },
      });
      if (zillow) {
        brief = `Listing spotlight: ${zillow.address}, ${zillow.city}. Price: $${zillow.price?.toLocaleString() ?? "TBD"}. ${zillow.beds ?? "?"}bd/${zillow.baths ?? "?"}ba. Zillow views: ${zillow.viewCount ?? 0}`;
        captionGate = await generateCaptionGated(contentType, brief, learnedGuidance);
      }
    } else if (contentType === "client_story") {
      const closed = await prisma.lead.findFirst({
        where: { stage: "closed" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, address: true, type: true },
      });
      if (closed) {
        brief = `Client story: ${closed.type === "buyer" ? "Buyers" : "Sellers"} closing on ${closed.address ?? "their dream home"}`;
        captionGate = await generateCaptionGated(contentType, brief, learnedGuidance);
      }
    } else {
      brief = `${contentType.replace("_", " ")} for Baton Rouge real estate market — Rêve Realtors`;
      captionGate = await generateCaptionGated(contentType, brief, learnedGuidance);
    }

    if (!captionGate) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: true, reason: "No content source available for today's type" });
    }

    // Gate check: skip sub-60 content entirely
    if (captionGate.quality.score < 60) {
      await logError("validation", "content-scheduler/caption-gate",
        new Error(`Caption gate failed — score ${captionGate.quality.score}/100`),
        { contentType, score: captionGate.quality.score, flags: captionGate.quality.flags }
      );
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: true, reason: `Caption score too low (${captionGate.quality.score}/100)` });
    }

    const caption = captionGate.content;
    // Passed but not clean → needs human review before publishing
    const projectStatus = captionGate.passed ? "drafting" : "needs_review";

    const project = await prisma.contentProject.create({
      data: {
        type: contentType,
        status: projectStatus,
        brief,
        captionDraft: caption,
        platform: "instagram,facebook",
        trendSignalId: trendSignalId ?? null,
      },
    });

    await prisma.actionQueue.create({
      data: {
        type: "post_content",
        agentType: "content_scheduler",
        priority: 3,
        briefDate: today,
        requiresApproval: true,
        payload: {
          contentProjectId: project.id,
          contentType,
          caption: caption.slice(0, 200),
          platform: "instagram,facebook",
          brief,
          gateAttempts: captionGate.attempts,
          gateScore: captionGate.quality.score,
          gatePassed: captionGate.passed,
        },
      },
    });

    // ── Listing content pass — AIRE: loop:listing-content-production ─────────
    const maxListingPostsSetting = await getSetting("content.maxListingPostsPerDay");
    const maxListingPosts = parseInt(maxListingPostsSetting ?? "3", 10);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayListingCount = await prisma.contentProject.count({
      where: { type: "listing_spotlight", mlsId: { not: null }, createdAt: { gte: since24h } },
    });

    if (todayListingCount < maxListingPosts) {
      const paragonCfg = await getParagonConfig();
      if (paragonCfg) {
        let listings: Awaited<ReturnType<typeof fetchActiveListings>> = [];
        try {
          listings = await fetchActiveListings(paragonCfg, { status: "Active", limit: 10 });
        } catch (err) {
          await logError("paragon", "content-scheduler/listing-pass", err as Error);
        }

        for (const listing of listings) {
          if (listingPostsQueued + todayListingCount >= maxListingPosts) break;
          if (!listing.mlsNumber) continue;

          const existingProject = await prisma.contentProject.findFirst({
            where: { mlsId: listing.mlsNumber },
            select: { id: true },
          });
          if (existingProject) continue;

          const listingBrief = `Listing spotlight: ${listing.address}, ${listing.city}. Price: $${listing.price.toLocaleString()}. ${listing.beds}bd/${listing.baths}ba, ${listing.sqft.toLocaleString()} sqft.`;

          const [listingCaptionGate, reelHookGate] = await Promise.all([
            generateCaptionGated("listing_spotlight", listingBrief, learnedGuidance),
            generateReelHookGated(listing.address, listing.price, `${listing.beds}bd/${listing.baths}ba`, learnedGuidance),
          ]);

          // Skip listings where caption quality is below floor
          if (listingCaptionGate.quality.score < 60) {
            await logError("validation", "content-scheduler/listing-caption-gate",
              new Error(`Listing caption too low: ${listingCaptionGate.quality.score}`),
              { address: listing.address }
            );
            continue;
          }

          const listingStatus = listingCaptionGate.passed ? "draft" : "needs_review";

          const listingProject = await prisma.contentProject.create({
            data: {
              type: "listing_spotlight",
              status: listingStatus,
              mlsId: listing.mlsNumber,
              brief: listingBrief,
              captionDraft: listingCaptionGate.content,
              listingAddress: listing.address,
              price: listing.price,
              platform: "instagram,facebook",
              slideSpec: {
                slides: [
                  { index: 1, type: "hero", headline: listing.address, subline: `$${listing.price.toLocaleString()} · ${listing.beds}bd/${listing.baths}ba` },
                  { index: 2, type: "feature", headline: "Living Space", subline: `${listing.sqft.toLocaleString()} sqft` },
                  { index: 3, type: "feature", headline: listing.city, subline: listing.propertyType },
                  { index: 4, type: "feature", headline: listing.daysOnMarket === 0 ? "Just Listed" : `${listing.daysOnMarket} days on market` },
                  { index: 5, type: "cta", headline: "Book a Showing", subline: "caleb.jackson@reverealtors.com" },
                ],
              },
              motionSpec: reelHookGate.content || undefined,
            },
          });

          await prisma.actionQueue.create({
            data: {
              type: "post_content",
              agentType: "content_scheduler",
              priority: 3,
              briefDate: today,
              requiresApproval: true,
              payload: {
                contentProjectId: listingProject.id,
                mlsId: listing.mlsNumber,
                address: listing.address,
                contentType: "listing_spotlight",
                caption: listingCaptionGate.content.slice(0, 200),
                reelHook: reelHookGate.content,
                gateAttempts: listingCaptionGate.attempts,
                gateScore: listingCaptionGate.quality.score,
                gatePassed: listingCaptionGate.passed,
              },
            },
          });

          listingPostsQueued++;
        }
      }
    }
    // ── end listing content pass ──────────────────────────────────────────────

    await finishRun(runId, { itemsProcessed: 1 + listingPostsQueued, actionsQueued: 1 + listingPostsQueued });

    return Response.json({
      ok: true,
      runId,
      contentType,
      contentProjectId: project.id,
      captionPreview: caption.slice(0, 100),
      gateAttempts: captionGate.attempts,
      gatePassed: captionGate.passed,
      gateScore: captionGate.quality.score,
      listingPostsQueued,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
