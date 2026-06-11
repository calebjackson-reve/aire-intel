export const dynamic = "force-dynamic";

// Loop 28 — Zillow Content Brief
// Cron: 0 9 * * 2,5 — Tuesday and Friday, fetches viral Zillow listings and
// queues the top 2 unused listings as post_content ActionQueue items.

import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { prisma } from "@/lib/prisma";
import { fetchViralListings, viralScore } from "@/lib/zillow";
import { getTodayCT } from "@/lib/brief-date";

const MAX_POSTS_PER_RUN = 2;

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runZillowContent();
}

export async function GET() {
  return runZillowContent();
}

async function runZillowContent() {
  const runId = await startRun("content_scheduler");
  const today = getTodayCT();

  try {
    // Zillow API key check
    if (!process.env.ZILLOW_RAPIDAPI_KEY) {
      await prisma.notification.create({
        data: {
          type: "sync_complete",
          title: "Zillow not configured",
          body: "ZILLOW_RAPIDAPI_KEY is not set — content brief skipped. Add key at /settings.",
          href: "/settings",
        },
      });
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "no_zillow_key" });
    }

    // Idempotency: skip if already queued today from this agent
    const existingToday = await prisma.actionQueue.findFirst({
      where: {
        agentType: "zillow_content",
        type: "post_content",
        briefDate: today,
      },
    });
    if (existingToday) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: "already_ran_today" });
    }

    // Fetch viral listings
    const listings = await fetchViralListings(5);

    if (listings.length === 0) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, listingsFetched: 0, newPostsQueued: 0 });
    }

    // Upsert all into ZillowHotListing table
    for (const listing of listings) {
      await prisma.zillowHotListing.upsert({
        where: { zpid: listing.zpid },
        create: {
          zpid: listing.zpid,
          address: listing.address,
          city: listing.city,
          state: listing.state,
          zip: listing.zip,
          price: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          viewCount: listing.viewCount,
          saveCount: listing.saveCount,
          daysOnMarket: listing.daysOnMarket,
          listingUrl: listing.listingUrl,
          photoUrl: listing.photoUrl,
        },
        update: {
          viewCount: listing.viewCount,
          saveCount: listing.saveCount,
          daysOnMarket: listing.daysOnMarket,
          photoUrl: listing.photoUrl,
          fetchedAt: new Date(),
        },
      });
    }

    // Query unused listings sorted by viral score
    const unusedListings = await prisma.zillowHotListing.findMany({
      where: { usedInPostId: null },
      orderBy: [{ viewCount: "desc" }],
      take: MAX_POSTS_PER_RUN * 3, // fetch extras to sort by composite score
    });

    // Sort by viralScore client-side
    const topListings = unusedListings
      .sort((a, b) => viralScore(b.viewCount, b.saveCount) - viralScore(a.viewCount, a.saveCount))
      .slice(0, MAX_POSTS_PER_RUN);

    if (topListings.length === 0) {
      await finishRun(runId, { itemsProcessed: listings.length, actionsQueued: 0 });
      return Response.json({ ok: true, listingsFetched: listings.length, newPostsQueued: 0, reason: "all_listings_used" });
    }

    // Create ActionQueue post_content items
    let actionsQueued = 0;
    const contentEntries: unknown[] = [];

    for (const listing of topListings) {
      const score = viralScore(listing.viewCount, listing.saveCount);
      const caption =
        `${listing.address}, ${listing.city} — ${listing.beds ?? "?"}bd/${listing.baths ?? "?"}ba` +
        (listing.price ? ` · $${Math.round(listing.price).toLocaleString()}` : "") +
        ` · Trending on Zillow. DM me for details. Caleb Jackson | Rêve Realtors® Baton Rouge`;

      await prisma.actionQueue.create({
        data: {
          type: "post_content",
          agentType: "zillow_content",
          priority: 3,
          briefDate: today,
          requiresApproval: true,
          payload: {
            contentType: "content_flywheel",
            zpid: listing.zpid,
            address: listing.address,
            city: listing.city,
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            listingUrl: listing.listingUrl,
            photoUrl: listing.photoUrl,
            viralScore: score,
            viewCount: listing.viewCount,
            saveCount: listing.saveCount,
            platform: "instagram",
            caption,
            zillowHotListingId: listing.id,
          },
        },
      });

      contentEntries.push({
        type: "content_flywheel",
        address: listing.address,
        city: listing.city,
        viralScore: score,
        zpid: listing.zpid,
        queued: new Date().toISOString(),
      });

      actionsQueued++;
    }

    // Update DailyBrief.contentQueued
    const existingBrief = await prisma.dailyBrief.findUnique({ where: { date: today } });
    const existingContent = (existingBrief?.contentQueued as object[]) ?? [];
    const updatedContent = [...existingContent, ...contentEntries] as object[];

    await prisma.dailyBrief.upsert({
      where: { date: today },
      create: {
        date: today,
        contentQueued: updatedContent,
      },
      update: {
        contentQueued: updatedContent,
      },
    });

    // Notification
    await prisma.notification.create({
      data: {
        type: "social_post",
        title: `Zillow content brief: ${actionsQueued} listing${actionsQueued !== 1 ? "s" : ""} queued`,
        body: topListings.map((l) => `${l.address}, ${l.city}`).join(" · "),
        href: "/pipeline",
      },
    });

    await finishRun(runId, { itemsProcessed: listings.length, actionsQueued });

    return Response.json({ ok: true, listingsFetched: listings.length, newPostsQueued: actionsQueued });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
