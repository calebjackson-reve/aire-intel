import { prisma } from "@/lib/prisma";
import { fetchViralListings, viralScore } from "@/lib/zillow";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";

// Market Intelligence Agent — runs at 3:00 AM CT (09:00 UTC) via Vercel cron
// 1. Fetch Zillow viral listings → store in ZillowHotListing
// 2. Cross-reference listings against active Lead search areas
// 3. Generate post content for top viral listing
// 4. Write to DailyBrief marketMovement section via ActionQueue

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runMarketIntel();
}

export async function GET() {
  return runMarketIntel();
}

async function runMarketIntel() {
  const runId = await startRun("market_intel");
  const today = getTodayCT();
  const errors: unknown[] = [];
  let itemsProcessed = 0;
  let actionsQueued = 0;

  try {
    // --- 1. Zillow viral listings ---
    let viralListings: Awaited<ReturnType<typeof fetchViralListings>> = [];

    try {
      viralListings = await fetchViralListings(5);
    } catch (err) {
      errors.push({ step: "zillow_fetch", error: String(err) });
    }

    // Upsert into ZillowHotListing cache
    const storedListings = [];
    for (const listing of viralListings) {
      try {
        const stored = await prisma.zillowHotListing.upsert({
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
        storedListings.push(stored);
        itemsProcessed++;
      } catch (err) {
        errors.push({ step: "zillow_upsert", zpid: listing.zpid, error: String(err) });
      }
    }

    // --- 2. Cross-reference with active leads ---
    const activeLeads = await prisma.lead.findMany({
      where: {
        stage: { in: ["active", "showing", "new_lead"] },
        areas: { not: null },
      },
      select: { id: true, name: true, areas: true },
    });

    const matchSignals: Array<{ listingAddress: string; leadName: string; leadId: string }> = [];

    for (const listing of storedListings) {
      const listingCity = listing.city.toLowerCase();
      const listingZip = listing.zip;

      for (const lead of activeLeads) {
        const areas = (lead.areas ?? "")
          .split(",")
          .map((a) => a.trim().toLowerCase());
        const matches = areas.some(
          (area) => listingCity.includes(area) || area.includes(listingCity) || listingZip === area
        );
        if (matches) {
          matchSignals.push({
            listingAddress: listing.address,
            leadName: lead.name,
            leadId: lead.id,
          });
        }
      }
    }

    // --- 3. Generate post for top viral listing ---
    const topListing = storedListings.sort(
      (a, b) =>
        viralScore(b.viewCount, b.saveCount) - viralScore(a.viewCount, a.saveCount)
    )[0];

    if (topListing) {
      const caption = await generateViralCaption(topListing);

      await prisma.actionQueue.create({
        data: {
          type: "post_content",
          agentType: "market_intel",
          priority: 3,
          briefDate: today,
          requiresApproval: true,
          payload: {
            contentType: "listing_spotlight",
            address: topListing.address,
            city: topListing.city,
            price: topListing.price,
            beds: topListing.beds,
            baths: topListing.baths,
            viewCount: topListing.viewCount,
            saveCount: topListing.saveCount,
            viralScore: viralScore(topListing.viewCount, topListing.saveCount),
            listingUrl: topListing.listingUrl,
            photoUrl: topListing.photoUrl,
            caption: caption.slice(0, 200),
            platform: "instagram",
            zillowHotListingId: topListing.id,
          },
        },
      });
      actionsQueued++;
    }

    // --- 4. Queue market signal items for client matches ---
    for (const signal of matchSignals.slice(0, 5)) {
      await prisma.actionQueue.create({
        data: {
          type: "send_client_email",
          agentType: "market_intel",
          leadId: signal.leadId,
          priority: 4,
          briefDate: today,
          requiresApproval: true,
          payload: {
            leadName: signal.leadName,
            leadId: signal.leadId,
            marketSignal: true,
            listingAddress: signal.listingAddress,
            note: `New listing in ${signal.leadName}'s search area: ${signal.listingAddress}`,
          },
        },
      });
      actionsQueued++;
    }

    await finishRun(runId, { itemsProcessed, actionsQueued, errorLog: errors });

    return Response.json({
      ok: true,
      runId,
      viralListingsFound: storedListings.length,
      clientMatches: matchSignals.length,
      actionsQueued,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

async function generateViralCaption(listing: {
  address: string;
  city: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  viewCount: number | null;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return `🔥 ${listing.address} — ${listing.city} | Rêve Realtors® Baton Rouge`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Write a 2-sentence Instagram caption for this viral Zillow listing in Baton Rouge.
Listing: ${listing.address}, ${listing.city}
Price: $${listing.price?.toLocaleString() ?? "TBD"}
${listing.beds ?? "?"}bd/${listing.baths ?? "?"}ba
Zillow views this week: ${listing.viewCount ?? "high"}

Make it feel exclusive — like you noticed something the masses are already circling.
Caleb Jackson | Rêve Realtors® Baton Rouge.
Caption only, no preamble.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return `${listing.address}, ${listing.city} — trending on Zillow | Rêve Realtors®`;

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}
