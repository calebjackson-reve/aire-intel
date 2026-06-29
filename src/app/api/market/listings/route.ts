export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { fetchActiveListings } from "@/lib/paragon";
import { fetchSaleListings } from "@/lib/rentcast";
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
  source: "paragon" | "rentcast";
  listingUrl?: string;
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

    // If Paragon returned nothing, pull from Rentcast (real MLS-sourced listings for Baton Rouge)
    if (listings.length === 0 && process.env.RENTCAST_API_KEY) {
      try {
        const rcRaw = await fetchSaleListings("Baton Rouge", "LA", { limit, minPrice, maxPrice });
        listings = rcRaw.map(r => ({
          ...r,
          photos: [],
          source: "rentcast" as const,
        }));
      } catch (rcErr) {
        logError("api_failure", "api/market/listings/rentcast-fallback", rcErr as Error);
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
