/**
 * POST /api/zillow/scrape
 *
 * Triggers a Zillow scrape for a city + status and upserts results to ZillowListing.
 * Respects 24h cache — skips if fresh data already exists unless force=true.
 *
 * Body: {
 *   city: "baton-rouge" | "zachary" | "st-francisville"
 *   status?: "for_sale" | "recently_sold"   (default: "for_sale")
 *   maxPrice?: number
 *   minPrice?: number
 *   minBeds?: number
 *   force?: boolean   // bypass cache check
 * }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — scrape jobs are slow

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { Prisma } from "@prisma/client";
import {
  runScrapeJob,
  isCacheStale,
  type SearchCity,
  type SearchStatus,
  type ZillowSearchResult,
} from "@/lib/zillow-scraper";

const VALID_CITIES: SearchCity[] = ["baton-rouge", "zachary", "st-francisville"];
const VALID_STATUSES: SearchStatus[] = ["for_sale", "recently_sold"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      city?: string;
      status?: string;
      maxPrice?: number;
      minPrice?: number;
      minBeds?: number;
      force?: boolean;
    };

    const city = (body.city ?? "baton-rouge") as SearchCity;
    const status = (body.status ?? "for_sale") as SearchStatus;

    if (!VALID_CITIES.includes(city)) {
      return NextResponse.json({ error: `Invalid city. Must be one of: ${VALID_CITIES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be: for_sale | recently_sold` }, { status: 400 });
    }

    // Cache check — skip if fresh data exists within 24h (unless force=true)
    if (!body.force) {
      const newest = await prisma.zillowListing.findFirst({
        where: {
          city: { contains: city.replace("-", " "), mode: "insensitive" },
          status,
        },
        orderBy: { scrapedAt: "desc" },
        select: { scrapedAt: true },
      });

      if (newest && !isCacheStale(newest.scrapedAt)) {
        const ageHours = Math.round((Date.now() - newest.scrapedAt.getTime()) / 3_600_000);
        return NextResponse.json({
          cached: true,
          message: `Cache fresh (${ageHours}h old). Use force=true to re-scrape.`,
          city,
          status,
        });
      }
    }

    // Run scrape
    const { results, meta } = await runScrapeJob({
      city,
      status,
      maxPrice: body.maxPrice,
      minPrice: body.minPrice,
      minBeds: body.minBeds,
      maxPages: 2,       // ~80 listings
      enrichTopN: 20,    // detail-fetch top 20 (adds priceHistory, yearBuilt)
    });

    // Upsert to DB
    const upserted = await upsertListings(results);

    return NextResponse.json({
      ok: true,
      city,
      status,
      fetched: meta.fetched,
      enriched: meta.enriched,
      upserted,
      errors: meta.errors.length > 0 ? meta.errors : undefined,
    });
  } catch (err) {
    logError("api_failure", "api/zillow/scrape", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function upsertListings(results: ZillowSearchResult[]): Promise<number> {
  let count = 0;
  const now = new Date();

  for (const r of results) {
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
      });
      count++;
    } catch {
      // Skip individual failed upserts — don't abort the whole batch
    }
  }

  return count;
}
