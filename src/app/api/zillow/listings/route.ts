/**
 * GET /api/zillow/listings
 *
 * Returns cached ZillowListing records. Always reads from DB — no live scrape.
 * To refresh, call POST /api/zillow/scrape first.
 *
 * Query params:
 *   city    — "baton-rouge" | "zachary" | "st-francisville" | "all"  (default: all)
 *   status  — "for_sale" | "recently_sold"                           (default: for_sale)
 *   maxPrice, minPrice, minBeds — filter params
 *   limit   — max results (default 50)
 *   zip     — filter by zip code
 *   freshOnly — "true" to return only listings scraped in last 24h
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CACHE_TTL_MS } from "@/lib/zillow-scraper";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const city = searchParams.get("city") ?? "all";
  const status = searchParams.get("status") ?? "for_sale";
  const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;
  const minPrice = searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : undefined;
  const minBeds = searchParams.get("minBeds") ? parseInt(searchParams.get("minBeds")!, 10) : undefined;
  const zip = searchParams.get("zip") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const freshOnly = searchParams.get("freshOnly") === "true";

  type WhereClause = {
    status: string;
    city?: { contains: string; mode: "insensitive" };
    zip?: string;
    price?: { gte?: number; lte?: number };
    beds?: { gte: number };
    scrapedAt?: { gte: Date };
  };

  const where: WhereClause = { status };

  // City filter — map slug to city name fragment
  if (city !== "all") {
    const cityNameMap: Record<string, string> = {
      "baton-rouge": "baton rouge",
      "zachary": "zachary",
      "st-francisville": "saint francisville",
    };
    const fragment = cityNameMap[city] ?? city.replace("-", " ");
    where.city = { contains: fragment, mode: "insensitive" };
  }

  if (zip) where.zip = zip;

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined) where.price.gte = minPrice;
    if (maxPrice !== undefined) where.price.lte = maxPrice;
  }

  if (minBeds !== undefined) {
    where.beds = { gte: minBeds };
  }

  if (freshOnly) {
    where.scrapedAt = { gte: new Date(Date.now() - CACHE_TTL_MS) };
  }

  const listings = await prisma.zillowListing.findMany({
    where,
    orderBy: status === "recently_sold"
      ? { soldDate: "desc" }
      : { daysOnMarket: "asc" },
    take: limit,
  });

  // Include cache freshness metadata
  const oldest = listings.length > 0
    ? listings.reduce((min, l) => l.scrapedAt < min ? l.scrapedAt : min, listings[0].scrapedAt)
    : null;

  return NextResponse.json({
    count: listings.length,
    status,
    city,
    cacheAge: oldest ? Math.round((Date.now() - oldest.getTime()) / 3_600_000) + "h" : null,
    listings,
  });
}
