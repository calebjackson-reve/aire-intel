import { prisma } from "@/lib/prisma";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";
import { logError } from "@/lib/error-memory";
import { getSetting, getParagonConfig } from "@/lib/settings";
import { fetchActiveListings } from "@/lib/paragon";

// Content Scheduler Agent — runs at 4:00 AM CT (10:00 UTC) via Vercel cron
// Determines today's content type, generates a post, queues for approval

const SCHEDULE: Record<number, string> = {
  0: "client_story",      // Sunday
  1: "market_update",     // Monday
  2: "listing_spotlight", // Tuesday
  3: "educational",       // Wednesday
  4: "market_update",     // Thursday
  5: "listing_spotlight", // Friday
  6: "reel",              // Saturday
};

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runContentScheduler();
}

export async function GET() {
  return runContentScheduler();
}

async function runContentScheduler() {
  const runId = await startRun("content_scheduler");
  const today = getTodayCT();

  try {
    // Idempotency — if already ran today, return existing
    const existing = await prisma.actionQueue.findFirst({
      where: { agentType: "content_scheduler", briefDate: today },
      select: { id: true },
    });
    if (existing) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: true, reason: "Already ran today" });
    }

    const dayOfWeek = new Date(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    ).getDay();

    // Determine today's content type from schedule
    const ctDayOfWeek = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
    }).format(new Date());
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const ctDay = dayMap[ctDayOfWeek] ?? dayOfWeek;
    const contentType = SCHEDULE[ctDay] ?? "market_update";

    let caption = "";
    let brief = "";
    let trendSignalId: string | undefined;
    let listingPostsQueued = 0;

    if (contentType === "educational") {
      // Pull from TrendSignal table
      const trend = await prisma.trendSignal.findFirst({
        where: { status: "new" },
        orderBy: { score: "desc" },
        select: { id: true, topic: true, hook: true, detail: true },
      });
      if (trend) {
        trendSignalId = trend.id;
        brief = `Educational post about: ${trend.topic}. Hook: ${trend.hook ?? ""}. ${trend.detail ?? ""}`;
        caption = await generateCaption(contentType, brief);
        await prisma.trendSignal.update({ where: { id: trend.id }, data: { status: "queued" } });
      }
    } else if (contentType === "listing_spotlight") {
      // Pull a recent active listing or Zillow hot listing
      const zillow = await prisma.zillowHotListing.findFirst({
        where: { usedInPostId: null },
        orderBy: [{ viewCount: "desc" }, { fetchedAt: "desc" }],
        select: { id: true, address: true, city: true, price: true, beds: true, baths: true, viewCount: true },
      });
      if (zillow) {
        brief = `Listing spotlight: ${zillow.address}, ${zillow.city}. Price: $${zillow.price?.toLocaleString() ?? "TBD"}. ${zillow.beds ?? "?"}bd/${zillow.baths ?? "?"}ba. Zillow views: ${zillow.viewCount ?? 0}`;
        caption = await generateCaption(contentType, brief);
      }
    } else if (contentType === "client_story") {
      // Pull a recently closed lead
      const closed = await prisma.lead.findFirst({
        where: { stage: "closed" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, address: true, type: true },
      });
      if (closed) {
        brief = `Client story: ${closed.type === "buyer" ? "Buyers" : "Sellers"} closing on ${closed.address ?? "their dream home"}`;
        caption = await generateCaption(contentType, brief);
      }
    } else {
      brief = `${contentType.replace("_", " ")} for Baton Rouge real estate market — Rêve Realtors`;
      caption = await generateCaption(contentType, brief);
    }

    if (!caption) {
      caption = `${contentType.replace(/_/g, " ")} — Caleb Jackson | Rêve Realtors® Baton Rouge`;
    }

    // Create ContentProject
    const project = await prisma.contentProject.create({
      data: {
        type: contentType,
        status: "drafting",
        brief,
        captionDraft: caption,
        platform: "instagram,facebook",
        trendSignalId: trendSignalId ?? null,
      },
    });

    // Queue for approval
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

          // Dedup: skip if ContentProject already exists for this MLS ID
          const existingProject = await prisma.contentProject.findFirst({
            where: { mlsId: listing.mlsNumber },
            select: { id: true },
          });
          if (existingProject) continue;

          const listingBrief = `Listing spotlight: ${listing.address}, ${listing.city}. Price: $${listing.price.toLocaleString()}. ${listing.beds}bd/${listing.baths}ba, ${listing.sqft.toLocaleString()} sqft.`;
          const [listingCaption, reelHook] = await Promise.all([
            generateCaption("listing_spotlight", listingBrief),
            generateReelHook(listing.address, listing.price, `${listing.beds}bd/${listing.baths}ba`),
          ]);

          const listingProject = await prisma.contentProject.create({
            data: {
              type: "listing_spotlight",
              status: "draft",
              mlsId: listing.mlsNumber,
              brief: listingBrief,
              captionDraft: listingCaption,
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
              motionSpec: reelHook || undefined,
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
                caption: listingCaption.slice(0, 200),
                reelHook,
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
      listingPostsQueued,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// AIRE: loop:listing-content-production
async function generateReelHook(address: string, price: number, feature: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Write one punchy Instagram Reel hook (< 125 chars) for this listing: ${address}, $${price.toLocaleString()}, ${feature}. Start with a number or a question. Return the hook only.`,
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return "";
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}

async function generateCaption(contentType: string, brief: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  const prompts: Record<string, string> = {
    market_update: "Write a 2-sentence Instagram caption for a Baton Rouge real estate market update. Be specific, professional, use one data point. No hashtag spam.",
    listing_spotlight: "Write a punchy 2-sentence Instagram caption for a listing spotlight. Lead with the lifestyle, not specs. Mention Rêve Realtors® subtly.",
    educational: "Write a 2-sentence educational Instagram caption for Baton Rouge home buyers/sellers. Make the insight feel exclusive. Direct, not fluffy.",
    client_story: "Write a warm, brief 2-sentence Instagram caption celebrating a client closing. Genuine, not canned.",
    reel: "Write a 1-sentence hook for a real estate Reel. It should stop the scroll. No emojis in the hook.",
    client_story_repost: "Write a 2-sentence Instagram caption for a client story repost.",
  };

  const systemPrompt = prompts[contentType] ?? prompts.market_update;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: `${systemPrompt}\n\nContext: ${brief}\n\nCaption only — no preamble.` }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return "";
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}
