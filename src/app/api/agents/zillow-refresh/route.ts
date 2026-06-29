/**
 * GET/POST /api/agents/zillow-refresh
 *
 * Nightly cron agent — refreshes Zillow market data for all three markets.
 * Runs sequentially to stay within rate limits (1 req/3s).
 *
 * Scrapes:
 *   - Baton Rouge: for_sale + recently_sold (90d comps)
 *   - Zachary: for_sale + recently_sold
 *   - St. Francisville: for_sale + recently_sold
 *
 * Protected by CRON_SECRET. Vercel cron fires nightly at 2am CT.
 * Runtime up to 300s (Vercel Pro plan).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { runScrapeJob, type SearchCity, type SearchStatus } from "@/lib/zillow-scraper";
import { verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";

const JOBS: Array<{ city: SearchCity; status: SearchStatus }> = [
  { city: "baton-rouge", status: "for_sale" },
  { city: "baton-rouge", status: "recently_sold" },
  { city: "zachary", status: "for_sale" },
  { city: "zachary", status: "recently_sold" },
  { city: "st-francisville", status: "for_sale" },
  { city: "st-francisville", status: "recently_sold" },
];

export async function GET(req: NextRequest) {
  if (!verifyCronOrInternal(req)) return cronUnauthorized();
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentRun = await prisma.agentRun.create({
    data: { agentType: "zillow_refresh", status: "running" },
  });

  const results: Array<{
    city: string;
    status: string;
    fetched: number;
    upserted: number;
    errors: string[];
  }> = [];

  let totalFetched = 0;
  let totalUpserted = 0;
  const allErrors: string[] = [];
  const startMs = Date.now();

  for (const job of JOBS) {
    try {
      const { results: listings, meta } = await runScrapeJob({
        city: job.city,
        status: job.status,
        maxPages: 2,
        enrichTopN: job.status === "recently_sold" ? 30 : 15, // more detail for comps
      });

      // Upsert to DB
      let upserted = 0;
      const now = new Date();

      for (const r of listings) {
        try {
          await prisma.zillowListing.upsert({
            where: { zpid: r.zpid },
            create: {
              zpid: r.zpid,
              address: r.address,
              city: r.city,
              state: r.state,
              zip: r.zip,
              price: r.price ?? undefined,
              beds: r.beds ?? undefined,
              baths: r.baths ?? undefined,
              sqft: r.sqft ?? undefined,
              lotSqft: r.lotSqft ?? undefined,
              yearBuilt: r.yearBuilt ?? undefined,
              propertyType: r.propertyType ?? undefined,
              daysOnMarket: r.daysOnMarket ?? undefined,
              zestimate: r.zestimate ?? undefined,
              rentZestimate: r.rentZestimate ?? undefined,
              status: r.status,
              soldPrice: r.soldPrice ?? undefined,
              soldDate: r.soldDate ? new Date(r.soldDate) : undefined,
              listingUrl: r.listingUrl,
              photoUrl: r.photoUrl ?? undefined,
              priceHistory: r.priceHistory ? (r.priceHistory as unknown as Prisma.InputJsonValue) : undefined,
              hoaFee: r.hoaFee ?? undefined,
              taxAnnual: r.taxAnnual ?? undefined,
              description: r.description ?? undefined,
              scrapedAt: now,
            },
            update: {
              price: r.price ?? undefined,
              beds: r.beds ?? undefined,
              baths: r.baths ?? undefined,
              sqft: r.sqft ?? undefined,
              lotSqft: r.lotSqft ?? undefined,
              yearBuilt: r.yearBuilt ?? undefined,
              propertyType: r.propertyType ?? undefined,
              daysOnMarket: r.daysOnMarket ?? undefined,
              zestimate: r.zestimate ?? undefined,
              rentZestimate: r.rentZestimate ?? undefined,
              soldPrice: r.soldPrice ?? undefined,
              soldDate: r.soldDate ? new Date(r.soldDate) : undefined,
              priceHistory: r.priceHistory ? (r.priceHistory as unknown as Prisma.InputJsonValue) : undefined,
              hoaFee: r.hoaFee ?? undefined,
              taxAnnual: r.taxAnnual ?? undefined,
              description: r.description ?? undefined,
              scrapedAt: now,
            },
          });
          upserted++;
        } catch {
          // Skip individual failures
        }
      }

      totalFetched += meta.fetched;
      totalUpserted += upserted;
      if (meta.errors.length) allErrors.push(...meta.errors);

      results.push({
        city: job.city,
        status: job.status,
        fetched: meta.fetched,
        upserted,
        errors: meta.errors,
      });
    } catch (err) {
      const msg = `${job.city}/${job.status}: ${String(err)}`;
      allErrors.push(msg);
      logError("api_failure", "agents/zillow-refresh", err as Error, { city: job.city, status: job.status });

      results.push({
        city: job.city,
        status: job.status,
        fetched: 0,
        upserted: 0,
        errors: [msg],
      });
    }
  }

  const durationMs = Date.now() - startMs;

  await prisma.agentRun.update({
    where: { id: agentRun.id },
    data: {
      status: allErrors.length > 0 && totalFetched === 0 ? "failed" : "completed",
      completedAt: new Date(),
      itemsProcessed: totalFetched,
      actionsQueued: totalUpserted,
      durationMs,
      errorLog: allErrors.length > 0 ? allErrors : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    totalFetched,
    totalUpserted,
    durationMs,
    results,
    errors: allErrors.length > 0 ? allErrors : undefined,
  });
}
