import { NextRequest } from "next/server";
import { fetchActiveListings } from "@/lib/paragon";
import { logError } from "@/lib/error-memory";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minPrice = searchParams.get("priceMin") ? Number(searchParams.get("priceMin")) : undefined;
  const maxPrice = searchParams.get("priceMax") ? Number(searchParams.get("priceMax")) : undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);

  try {
    const listings = await fetchActiveListings(undefined, {
      minPrice,
      maxPrice,
      limit,
    });

    const prices = listings.filter(l => l.price).map(l => l.price as number).sort((a, b) => a - b);
    const medianPrice = prices.length
      ? prices[Math.floor(prices.length / 2)]
      : null;
    const doms = listings.filter(l => l.daysOnMarket != null).map(l => l.daysOnMarket as number);
    const avgDom = doms.length ? doms.reduce((a, b) => a + b, 0) / doms.length : null;

    return Response.json({
      listings,
      stats: {
        totalActive: listings.length,
        medianPrice,
        avgDom,
      },
    });
  } catch (err) {
    logError("api_failure", "api/market/listings", err as Error);
    return Response.json({ listings: [], stats: null, error: "Failed to fetch listings" }, { status: 500 });
  }
}
