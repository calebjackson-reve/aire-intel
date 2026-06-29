export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSaleListings, type SaleListing } from "@/lib/rentcast";

// Listings source priority:
//   1. RentCast — licensed, commercial-legal API (RENTCAST_API_KEY). PRIMARY.
//   2. Paragon MLS — only if PARAGON_API_URL + PARAGON_API_KEY are set (dormant;
//      Caleb is not currently authorized on the GBRAR feed). Kept as a seam.
//   3. Curated demo data — so the UI always has something to show.
//
// RentCast is city-based (not county-based like Paragon), so we query Caleb's
// core markets and merge. Add cities here as the territory grows.
const RENTCAST_CITIES: Array<{ city: string; state: string }> = [
  { city: "Baton Rouge", state: "LA" },
  { city: "New Roads", state: "LA" }, // False River / Pointe Coupee
];

const PARAGON_API_URL = process.env.PARAGON_API_URL || "";
const PARAGON_API_KEY = process.env.PARAGON_API_KEY || "";

// Map a RentCast SaleListing into the shape the board/buyer-match expects.
function mapRentcastListing(l: SaleListing) {
  return {
    mlsNumber: l.mlsNumber || l.id,
    address: l.address,
    city: l.city,
    price: l.price ?? 0,
    beds: l.beds ?? 0,
    baths: l.baths ?? 0,
    sqft: l.sqft ?? 0,
    dom: l.daysOnMarket ?? 0,
    // Fresh listings (<= 2 days) get the "New" badge; older stay "Active".
    status: ((l.daysOnMarket ?? 99) <= 2 ? "New" : "Active") as "New" | "Active",
    photoUrl: undefined as string | undefined, // RentCast doesn't return media
    listingUrl: undefined as string | undefined, // nor a public listing URL
    listedAt: l.listedDate ?? new Date().toISOString(),
  };
}

async function fetchRentcastListings() {
  if (!process.env.RENTCAST_API_KEY) return null;
  try {
    const perCity = await Promise.all(
      RENTCAST_CITIES.map(({ city, state }) =>
        fetchSaleListings(city, state, { limit: 25 }).catch(() => [] as SaleListing[])
      )
    );
    const merged = perCity.flat().map(mapRentcastListing);
    // Newest first
    merged.sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());
    return merged.length > 0 ? merged : null;
  } catch {
    return null;
  }
}

async function fetchParagonListings() {
  if (!PARAGON_API_URL || !PARAGON_API_KEY) return null;

  try {
    // Paragon RETS/REST endpoint — queries for new listings in EBR, West Feliciana, Pointe Coupee
    // listed in the last 24 hours, sorted by price
    const url = new URL(`${PARAGON_API_URL}/v1/listings`);
    url.searchParams.set("status", "Active");
    url.searchParams.set("daysOnMarket", "0");
    url.searchParams.set("counties", "East Baton Rouge,West Feliciana,Pointe Coupee");
    url.searchParams.set("limit", "50");
    url.searchParams.set("sort", "-ListDate");

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${PARAGON_API_KEY}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.value ?? data.listings ?? null;
  } catch {
    return null;
  }
}

function mapParagonListing(raw: Record<string, unknown>) {
  return {
    mlsNumber: String(raw.ListingId ?? raw.MlsNumber ?? raw.id ?? ""),
    address: `${raw.UnparsedAddress ?? raw.StreetAddress ?? ""}`,
    city: String(raw.City ?? "Baton Rouge"),
    price: Number(raw.ListPrice ?? raw.Price ?? 0),
    beds: Number(raw.BedroomsTotal ?? raw.Bedrooms ?? 0),
    baths: Number(raw.BathroomsTotalInteger ?? raw.Bathrooms ?? 0),
    sqft: Number(raw.LivingArea ?? raw.SquareFeet ?? 0),
    dom: Number(raw.DaysOnMarket ?? 0),
    status: "New" as const,
    photoUrl: Array.isArray(raw.Media) ? String((raw.Media[0] as Record<string,unknown>)?.MediaURL ?? "") : undefined,
    listingUrl: raw.ListingURL ? String(raw.ListingURL) : undefined,
    listedAt: String(raw.ListingContractDate ?? new Date().toISOString()),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fresh = searchParams.get("fresh") === "1";

  // 1. RentCast — primary, licensed source
  const rentcastData = await fetchRentcastListings();
  if (rentcastData && rentcastData.length > 0) {
    const listings = rentcastData.slice(0, 30);
    await checkBuyerMatches(listings);
    return Response.json({ listings, source: "rentcast", count: listings.length });
  }

  // 2. Paragon — dormant seam (only if authorized + configured)
  const paragonData = await fetchParagonListings();
  if (paragonData && Array.isArray(paragonData) && paragonData.length > 0) {
    const listings = paragonData.slice(0, 30).map(mapParagonListing);
    await checkBuyerMatches(listings);
    return Response.json({ listings, source: "paragon", count: listings.length });
  }

  // Return demo data (swapped in for live connection)
  const today = new Date();
  const demoListings = [
    {
      mlsNumber: "2024001",
      address: "4521 Perkins Rd",
      city: "Baton Rouge",
      price: 485000,
      beds: 4, baths: 3, sqft: 2850, dom: 0,
      status: "New" as const,
      listedAt: today.toISOString(),
      listingUrl: "https://mlsbox.paragonrels.com",
    },
    {
      mlsNumber: "2024002",
      address: "1832 Highland Rd",
      city: "Baton Rouge",
      price: 672000,
      beds: 5, baths: 4, sqft: 3600, dom: 0,
      status: "New" as const,
      listedAt: today.toISOString(),
      listingUrl: "https://mlsbox.paragonrels.com",
    },
    {
      mlsNumber: "2024003",
      address: "3305 Government St",
      city: "Baton Rouge",
      price: 325000,
      beds: 3, baths: 2, sqft: 1900, dom: 0,
      status: "Price Drop" as const,
      listedAt: today.toISOString(),
      listingUrl: "https://mlsbox.paragonrels.com",
    },
    {
      mlsNumber: "2024004",
      address: "7708 O'Neal Ln",
      city: "Baton Rouge",
      price: 415000,
      beds: 4, baths: 3.5, sqft: 2400, dom: 1,
      status: "New" as const,
      listedAt: today.toISOString(),
      listingUrl: "https://mlsbox.paragonrels.com",
    },
    {
      mlsNumber: "2024005",
      address: "112 False River Dr",
      city: "New Roads",
      price: 595000,
      beds: 4, baths: 3, sqft: 3100, dom: 0,
      status: "New" as const,
      listedAt: today.toISOString(),
      listingUrl: "https://mlsbox.paragonrels.com",
    },
  ];

  return Response.json({ listings: demoListings, source: "demo", count: demoListings.length });
}

// Common shape across all sources — only the fields buyer-matching needs.
type MatchableListing = {
  mlsNumber: string;
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  listingUrl?: string;
};

async function checkBuyerMatches(listings: MatchableListing[]) {
  try {
    const searches = await prisma.buyerSearch.findMany({
      where: { active: true },
      include: { lead: { select: { id: true, name: true, email: true } } },
    });

    for (const search of searches) {
      for (const listing of listings) {
        // Check if already alerted
        const exists = await prisma.listingAlert.findFirst({
          where: { buyerSearchId: search.id, mlsNumber: listing.mlsNumber },
        });
        if (exists) continue;

        // Match logic
        const priceOk = (!search.priceMin || listing.price >= search.priceMin) &&
                        (!search.priceMax || listing.price <= search.priceMax);
        const bedsOk  = !search.bedsMin || listing.beds >= search.bedsMin;

        if (priceOk && bedsOk) {
          await prisma.listingAlert.create({
            data: {
              buyerSearchId: search.id,
              mlsNumber: listing.mlsNumber,
              address: listing.address,
              price: listing.price,
              beds: listing.beds,
              baths: listing.baths,
              sqft: listing.sqft,
              listingUrl: listing.listingUrl,
            },
          });

          // Create notification
          await prisma.notification.create({
            data: {
              type: "listing_match",
              title: `New match for ${search.lead?.name ?? search.name}`,
              body: `${listing.address} — ${listing.price >= 1_000_000 ? `$${(listing.price/1_000_000).toFixed(2)}M` : `$${(listing.price/1000).toFixed(0)}K`} · ${listing.beds}bd`,
              href: `/buyers`,
            },
          });
        }
      }
    }
  } catch {
    // Non-critical — don't break the listings fetch
  }
}
