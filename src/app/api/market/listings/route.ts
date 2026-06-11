export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { fetchActiveListings } from "@/lib/paragon";
import { fetchViralListings, type ZillowProperty } from "@/lib/zillow";
import { logError } from "@/lib/error-memory";

// Shape that the market page expects
interface Listing {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string;
  daysOnMarket: number | null;
  photos: string[];
  mlsNumber: string;
  propertyType: string | null;
  listingAgent: string | null;
  source: "paragon" | "zillow";
  listingUrl?: string;
}

function zillowToListing(z: ZillowProperty): Listing {
  return {
    id: `zillow-${z.zpid}`,
    address: z.address,
    city: z.city,
    state: z.state,
    zip: z.zip,
    price: z.price,
    beds: z.beds,
    baths: z.baths,
    sqft: z.sqft,
    status: "Active",
    daysOnMarket: z.daysOnMarket,
    photos: z.photoUrl ? [z.photoUrl] : [],
    mlsNumber: z.zpid,
    propertyType: null,
    listingAgent: null,
    source: "zillow",
    listingUrl: z.listingUrl,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minPrice = searchParams.get("priceMin") ? Number(searchParams.get("priceMin")) : undefined;
  const maxPrice = searchParams.get("priceMax") ? Number(searchParams.get("priceMax")) : undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);

  try {
    // Try Paragon first (real MLS data with full photo arrays)
    let paragonListings: Listing[] = [];
    try {
      const raw = await fetchActiveListings(undefined, { minPrice, maxPrice, limit });
      paragonListings = raw.map(l => ({ ...l, source: "paragon" as const }));
    } catch {
      // Paragon not configured — fall through to Zillow
    }

    let listings: Listing[] = paragonListings;

    // If Paragon returned nothing, pull from Zillow RapidAPI (real photos guaranteed)
    if (listings.length === 0 && process.env.ZILLOW_RAPIDAPI_KEY) {
      try {
        const zillowRaw = await fetchViralListings(limit);
        let filtered = zillowRaw.map(zillowToListing);

        if (minPrice) filtered = filtered.filter(l => l.price == null || l.price >= minPrice);
        if (maxPrice) filtered = filtered.filter(l => l.price == null || l.price <= maxPrice);

        listings = filtered.slice(0, limit);
      } catch (zErr) {
        logError("api_failure", "api/market/listings/zillow-fallback", zErr as Error);
      }
    }

    const prices = listings.filter(l => l.price).map(l => l.price as number).sort((a, b) => a - b);
    const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    const doms = listings.filter(l => l.daysOnMarket != null).map(l => l.daysOnMarket as number);
    const avgDom = doms.length ? doms.reduce((a, b) => a + b, 0) / doms.length : null;

    return Response.json({
      listings,
      stats: { totalActive: listings.length, medianPrice, avgDom },
    });
  } catch (err) {
    logError("api_failure", "api/market/listings", err as Error);
    return Response.json({ listings: [], stats: null, error: "Failed to fetch listings" }, { status: 500 });
  }
}
