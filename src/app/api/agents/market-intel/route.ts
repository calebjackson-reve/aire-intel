export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { fetchViralListings, viralScore } from "@/lib/zillow";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";
import { matchListingToBuyers, type BuyerSearchWithLead } from "@/lib/buyer-matcher"; // AIRE: loop:listing-alert-buyer-match
import { fetchActiveListings, type ParagonListing } from "@/lib/paragon"; // AIRE: loop:listing-alert-buyer-match
import { getSetting, invalidateSettingsCache, getParagonConfig } from "@/lib/settings"; // AIRE: loop:listing-alert-buyer-match
import { logError } from "@/lib/error-memory"; // AIRE: loop:listing-alert-buyer-match
import { checkTokenExpiry } from "@/lib/meta"; // AIRE: loop:meta-token-refresh-alert
import { getTwilioConfig, sendSMS } from "@/lib/twilio"; // AIRE: loop:meta-token-refresh-alert

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
    // --- 0. Meta token expiry check --- AIRE: loop:meta-token-refresh-alert
    try {
      const lastChecked = await getSetting("meta.token.lastChecked");
      const lastCheckedMs = lastChecked ? new Date(lastChecked).getTime() : 0;
      const stale = isNaN(lastCheckedMs) || Date.now() - lastCheckedMs > 23 * 60 * 60 * 1000;
      if (stale) {
        const { daysRemaining, expiresAt } = await checkTokenExpiry();
        const now = new Date().toISOString();

        await prisma.setting.upsert({
          where: { key: "meta.token.lastChecked" },
          create: { key: "meta.token.lastChecked", value: now },
          update: { value: now },
        });
        if (expiresAt) {
          await prisma.setting.upsert({
            where: { key: "meta.token.expiresAt" },
            create: { key: "meta.token.expiresAt", value: expiresAt.toISOString() },
            update: { value: expiresAt.toISOString() },
          });
        }

        const tokenStatus = daysRemaining <= 0 ? "expired" : daysRemaining <= 7 ? "critical" : daysRemaining <= 14 ? "warning" : "healthy";
        await prisma.setting.upsert({
          where: { key: "meta.token.status" },
          create: { key: "meta.token.status", value: tokenStatus },
          update: { value: tokenStatus },
        });
        invalidateSettingsCache(["meta.token.lastChecked", "meta.token.expiresAt", "meta.token.status"]);

        if (daysRemaining <= 0) {
          await prisma.setting.upsert({
            where: { key: "agent.content_scheduler.paused" },
            create: { key: "agent.content_scheduler.paused", value: "true" },
            update: { value: "true" },
          });
          invalidateSettingsCache(["agent.content_scheduler.paused"]);
          await prisma.notification.create({
            data: {
              type: "critical",
              title: "Meta token expired — content scheduler paused",
              body: "Your Meta Page access token has expired. All queued posts are paused until you refresh it in /settings.",
              href: "/settings",
            },
          });
          await sendMetaSmsAlert(daysRemaining, expiresAt);
        } else if (daysRemaining <= 7) {
          await prisma.notification.create({
            data: {
              type: "warning",
              title: `Meta token expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} — refresh now`,
              body: `Token expires on ${expiresAt?.toDateString() ?? "soon"}. Refresh in /settings before it expires.`,
              href: "/settings",
            },
          });
          await sendMetaSmsAlert(daysRemaining, expiresAt);
        } else if (daysRemaining <= 14) {
          await prisma.notification.create({
            data: {
              type: "warning",
              title: `Meta token expires in ${daysRemaining} days — refresh soon`,
              body: `Token expires on ${expiresAt?.toDateString() ?? "soon"}. Refresh in /settings before the 7-day window.`,
              href: "/settings",
            },
          });
        }
      }
    } catch (err) {
      errors.push({ step: "meta_token_check", error: String(err) });
    }

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

    // --- 5. Buyer match pass (BuyerSearch × Paragon listings) --- AIRE: loop:listing-alert-buyer-match
    try {
      const lastRunDate = await getSetting("buyermatch.lastRunDate");
      if (lastRunDate !== today) {
        const maxAlertsRaw = await getSetting("buyer_match.maxAlertsPerRun");
        const maxAlerts = maxAlertsRaw ? parseInt(maxAlertsRaw, 10) : 5;

        const paragonConfig = await getParagonConfig();
        const paragonListings = paragonConfig
          ? await fetchActiveListings(paragonConfig, { limit: 50 })
          : [];

        // Filter to new/price-changed in last 24h
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentListings = paragonListings.filter((l) => {
          if (!l.modifiedAt) return true;
          const mod = new Date(l.modifiedAt);
          return !isNaN(mod.getTime()) && mod >= cutoff;
        });

        let buyerAlertsQueued = 0;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        for (const listing of recentListings) {
          if (buyerAlertsQueued >= maxAlerts) break;

          let matches: BuyerSearchWithLead[];
          try {
            matches = await matchListingToBuyers(listing);
          } catch (err) {
            logError("api_failure", "market-intel/buyer-match", err as Error, { mlsId: listing.mlsNumber });
            continue;
          }

          for (const buyer of matches) {
            if (buyerAlertsQueued >= maxAlerts) break;
            if (!buyer.leadId) continue;

            // Dedup 1: ActionQueue — same leadId + mlsId in last 7 days
            const recentActions = await prisma.actionQueue.findMany({
              where: {
                leadId: buyer.leadId,
                agentType: "market_intel",
                type: "draft_message",
                createdAt: { gte: sevenDaysAgo },
              },
              select: { payload: true },
            });
            const alreadyQueued = recentActions.some(
              (a) => (a.payload as { mlsId?: string }).mlsId === listing.mlsNumber
            );
            if (alreadyQueued) continue;

            // Dedup 2: ContactLog — outbound contact for same lead in last 24h
            const recentContact = await prisma.contactLog.findFirst({
              where: {
                leadId: buyer.leadId,
                direction: "outbound",
                createdAt: { gte: oneDayAgo },
              },
            });
            if (recentContact) continue;

            await prisma.actionQueue.create({
              data: {
                type: "draft_message",
                agentType: "market_intel",
                leadId: buyer.leadId,
                priority: 3,
                briefDate: today,
                requiresApproval: true,
                payload: {
                  leadId: buyer.leadId,
                  leadName: buyer.lead?.name ?? "",
                  mlsId: listing.mlsNumber,
                  listingAddress: listing.address,
                  listingPrice: listing.price,
                  listingBeds: listing.beds,
                  listingBaths: listing.baths,
                  matchReason: buildBuyerMatchReason(listing, buyer),
                  draftBody: `New listing at ${listing.address} — ${listing.beds}bd/${listing.baths}ba $${listing.price.toLocaleString()} — matches what you're looking for. Want to schedule a showing?`,
                },
              },
            });
            buyerAlertsQueued++;
            actionsQueued++;
          }
        }

        itemsProcessed += recentListings.length;

        await prisma.setting.upsert({
          where: { key: "buyermatch.lastRunDate" },
          create: { key: "buyermatch.lastRunDate", value: today },
          update: { value: today },
        });
        invalidateSettingsCache(["buyermatch.lastRunDate"]);
      }
    } catch (err) {
      errors.push({ step: "buyer_match", error: String(err) });
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

// AIRE: loop:meta-token-refresh-alert
async function sendMetaSmsAlert(daysRemaining: number, expiresAt?: Date | null) {
  try {
    const [lastSms, twilioConfig, calebPhone] = await Promise.all([
      getSetting("meta.token.lastSmsSent"),
      getTwilioConfig(),
      getSetting("CALEB_PHONE"),
    ]);
    if (!twilioConfig || !calebPhone) return;
    if (lastSms && !isNaN(new Date(lastSms).getTime()) && Date.now() - new Date(lastSms).getTime() < 24 * 60 * 60 * 1000) return;

    const message = daysRemaining <= 0
      ? "AIRE ALERT: Meta token expired. Queued posts paused. Refresh at /settings."
      : `AIRE ALERT: Meta token expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}${expiresAt ? ` on ${expiresAt.toDateString()}` : ""}. Refresh in /settings.`;

    await sendSMS(calebPhone, message, twilioConfig);
    const sentAt = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: "meta.token.lastSmsSent" },
      create: { key: "meta.token.lastSmsSent", value: sentAt },
      update: { value: sentAt },
    });
    invalidateSettingsCache(["meta.token.lastSmsSent"]);
  } catch {
    // SMS failure never crashes the agent
  }
}

// AIRE: loop:listing-alert-buyer-match
function buildBuyerMatchReason(listing: ParagonListing, buyer: BuyerSearchWithLead): string {
  const reasons: string[] = [];
  if (buyer.priceMin !== null || buyer.priceMax !== null) {
    reasons.push(`price $${listing.price.toLocaleString()}`);
  }
  if (buyer.bedsMin !== null) reasons.push(`${listing.beds}bd ≥ ${buyer.bedsMin}bd min`);
  if (buyer.bathsMin !== null) reasons.push(`${listing.baths}ba ≥ ${buyer.bathsMin}ba min`);
  if (buyer.areas) reasons.push("area match");
  if (buyer.propertyTypes) reasons.push("property type");
  return reasons.join(", ") || "criteria match";
}
