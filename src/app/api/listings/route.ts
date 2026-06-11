export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Paragon MLS integration
// Real data: configure PARAGON_API_URL + PARAGON_API_KEY in .env
// Falls back to curated demo data so the UI always has something to show

const PARAGON_API_URL = process.env.PARAGON_API_URL || "";
const PARAGON_API_KEY = process.env.PARAGON_API_KEY || "";

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

  // Try real Paragon data first
  const paragonData = await fetchParagonListings();
  if (paragonData && Array.isArray(paragonData) && paragonData.length > 0) {
    const listings = paragonData.slice(0, 30).map(mapParagonListing);

    // Check buyer search matches and create alerts
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

async function checkBuyerMatches(listings: ReturnType<typeof mapParagonListing>[]) {
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
