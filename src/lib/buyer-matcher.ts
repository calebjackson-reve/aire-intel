// AIRE: loop:listing-alert-buyer-match
import { prisma } from "@/lib/prisma";
import type { ParagonListing } from "@/lib/paragon";
import type { Prisma } from "@prisma/client";

// AIRE: loop:listing-alert-buyer-match
export type BuyerSearchWithLead = Prisma.BuyerSearchGetPayload<{
  include: { lead: { select: { id: true; name: true; stage: true } } };
}>;

// AIRE: loop:listing-alert-buyer-match
export async function matchListingToBuyers(
  listing: ParagonListing
): Promise<BuyerSearchWithLead[]> {
  const buyers = await prisma.buyerSearch.findMany({
    where: { active: true },
    include: {
      lead: { select: { id: true, name: true, stage: true } },
    },
  });

  const scored: Array<{ buyer: BuyerSearchWithLead; score: number }> = [];
  const TOLERANCE = 0.1;

  for (const buyer of buyers) {
    const stage = buyer.lead?.stage ?? "";
    if (stage === "closed_won" || stage === "closed_lost") continue;

    // Price range (±10% tolerance)
    if (buyer.priceMin !== null) {
      if (listing.price < buyer.priceMin * (1 - TOLERANCE)) continue;
    }
    if (buyer.priceMax !== null) {
      if (listing.price > buyer.priceMax * (1 + TOLERANCE)) continue;
    }

    // Beds minimum
    if (buyer.bedsMin !== null && listing.beds < buyer.bedsMin) continue;

    // Baths minimum
    if (buyer.bathsMin !== null && listing.baths < buyer.bathsMin) continue;

    // Area match (zip or city substring)
    if (buyer.areas) {
      const buyerAreas = buyer.areas.split(",").map((a) => a.trim().toLowerCase());
      const zip = listing.zip.toLowerCase();
      const city = listing.city.toLowerCase();
      const hit = buyerAreas.some(
        (a) => a === zip || city.includes(a) || a.includes(city)
      );
      if (!hit) continue;
    }

    // Property type match
    if (buyer.propertyTypes) {
      const types = buyer.propertyTypes.split(",").map((t) => t.trim().toLowerCase());
      const pt = listing.propertyType.toLowerCase();
      if (!types.some((t) => pt.includes(t) || t.includes(pt))) continue;
    }

    // Score = criteria count + price centrality bonus (0..1)
    let score = 0;
    if (buyer.priceMin !== null || buyer.priceMax !== null) score++;
    if (buyer.bedsMin !== null) score++;
    if (buyer.bathsMin !== null) score++;
    if (buyer.areas) score++;
    if (buyer.propertyTypes) score++;

    if (buyer.priceMin !== null && buyer.priceMax !== null) {
      const range = buyer.priceMax - buyer.priceMin;
      if (range > 0) {
        const center = (buyer.priceMin + buyer.priceMax) / 2;
        const halfRange = range / 2 + range * TOLERANCE;
        score += Math.max(0, 1 - Math.abs(listing.price - center) / halfRange);
      }
    }

    scored.push({ buyer, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.buyer);
}
