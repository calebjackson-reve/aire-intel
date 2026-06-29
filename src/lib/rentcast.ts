import { withRetry } from "@/lib/error-memory";

const BASE_URL = "https://api.rentcast.io/v1";

export interface AVMResult {
  price: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  latitude: number | null;
  longitude: number | null;
}

export interface RentalComp {
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number;
  pricePerSqft: number | null;
  daysOnMarket: number | null;
  distance: number | null;
}

export interface RentalAVMResult {
  rent: number;
  rentRangeLow: number;
  rentRangeHigh: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  grossYield: number | null; // as a percentage, e.g. 8.2
}

export interface MarketStats {
  averageRent: number | null;
  medianRent: number | null;
  averagePrice: number | null;
  medianPrice: number | null;
  averageDaysOnMarket: number | null;
  totalListings: number | null;
}

function headers() {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) throw new Error("RENTCAST_API_KEY not set");
  return { "X-Api-Key": key };
}

// RentCast's AVM endpoints don't return a confidence score, so derive one from
// how tight the estimate's range is: a narrow band implies a more certain value.
function deriveConfidence(estimate: number, low: number, high: number): "HIGH" | "MEDIUM" | "LOW" {
  if (!estimate || !low || !high || high <= low) return "LOW";
  const spread = (high - low) / estimate;
  if (spread < 0.15) return "HIGH";
  if (spread < 0.30) return "MEDIUM";
  return "LOW";
}

// Sale AVM — what a property is worth to buy
export async function getAVM(
  address: string,
  city?: string,
  state?: string
): Promise<AVMResult> {
  return withRetry(async () => {
    const fullAddress = [address, city, state].filter(Boolean).join(", ");
    const params = new URLSearchParams({ address: fullAddress, propertyType: "Single Family" });
    const res = await fetch(`${BASE_URL}/avm/value?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`Rentcast AVM failed: ${res.status}`);
    const data = await res.json();
    const price = data.price ?? data.priceEstimate ?? 0;
    const low = data.priceLow ?? data.priceRangeLow ?? 0;
    const high = data.priceHigh ?? data.priceRangeHigh ?? 0;
    return {
      price,
      priceRangeLow: low,
      priceRangeHigh: high,
      confidence: data.confidence ?? deriveConfidence(price, low, high),
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    };
  }, { maxAttempts: 2, source: "rentcast/getAVM" });
}

// Rental AVM — what a property would rent for, with gross yield calculation
export async function getRentalAVM(
  address: string,
  salePrice?: number
): Promise<RentalAVMResult> {
  return withRetry(async () => {
    const params = new URLSearchParams({ address, propertyType: "Single Family" });
    const res = await fetch(`${BASE_URL}/avm/rent/long-term?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`Rentcast rental AVM failed: ${res.status}`);
    const data = await res.json();
    const rent = data.rent ?? data.rentEstimate ?? 0;
    const low = data.rentLow ?? data.rentRangeLow ?? 0;
    const high = data.rentHigh ?? data.rentRangeHigh ?? 0;
    const grossYield = salePrice && salePrice > 0
      ? Number(((rent * 12 / salePrice) * 100).toFixed(2))
      : null;
    return {
      rent,
      rentRangeLow: low,
      rentRangeHigh: high,
      confidence: data.confidence ?? deriveConfidence(rent, low, high),
      grossYield,
    };
  }, { maxAttempts: 2, source: "rentcast/getRentalAVM" });
}

// Sale comps — comparable sold properties
export async function getSaleComps(
  address: string,
  radiusMiles = 0.5,
  limit = 5
): Promise<RentalComp[]> {
  return withRetry(async () => {
    const params = new URLSearchParams({
      address,
      radius: String(radiusMiles),
      limit: String(limit),
      propertyType: "Single Family",
    });
    const res = await fetch(`${BASE_URL}/avm/value/report?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`Rentcast comps failed: ${res.status}`);
    const data = await res.json();
    const comps = data.comparables ?? data.properties ?? [];
    return comps.map((c: Record<string, unknown>) => ({
      address: (c.formattedAddress ?? c.address ?? "") as string,
      city: (c.city ?? "") as string,
      state: (c.state ?? "") as string,
      zip: (c.zipCode ?? c.zip ?? "") as string,
      beds: (c.bedrooms ?? c.beds ?? null) as number | null,
      baths: (c.bathrooms ?? c.baths ?? null) as number | null,
      sqft: (c.squareFootage ?? c.sqft ?? null) as number | null,
      price: (c.price ?? 0) as number,
      pricePerSqft: c.pricePerSquareFoot ? Number(c.pricePerSquareFoot) : null,
      daysOnMarket: (c.daysOnMarket ?? null) as number | null,
      distance: (c.distance ?? null) as number | null,
    }));
  }, { maxAttempts: 2, source: "rentcast/getSaleComps" });
}

// Market stats for a ZIP code
export async function getMarketStats(zipCode: string): Promise<MarketStats> {
  return withRetry(async () => {
    const params = new URLSearchParams({ zipCode, propertyType: "Single Family", dataType: "All" });
    const res = await fetch(`${BASE_URL}/markets?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`Rentcast market stats failed: ${res.status}`);
    const data = await res.json();
    // RentCast nests stats under saleData / rentalData — not flat on the root.
    const sale = data.saleData ?? {};
    const rental = data.rentalData ?? {};
    return {
      averageRent: rental.averageRent ?? null,
      medianRent: rental.medianRent ?? null,
      averagePrice: sale.averagePrice ?? null,
      medianPrice: sale.medianPrice ?? null,
      // Prefer sale DOM/listing counts; fall back to rental side if sale is absent.
      averageDaysOnMarket: sale.averageDaysOnMarket ?? rental.averageDaysOnMarket ?? null,
      totalListings: sale.totalListings ?? rental.totalListings ?? null,
    };
  }, { maxAttempts: 2, source: "rentcast/getMarketStats" });
}

// Active sale listings for a ZIP code (basic tier endpoint)
export interface RentcastListing {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  price: number | null;
  daysOnMarket: number | null;
  propertyType: string | null;
  listingAgent: string | null;
  status: string;
}

export async function fetchSaleListings(
  zipCode: string,
  limit = 50
): Promise<RentcastListing[]> {
  return withRetry(async () => {
    const params = new URLSearchParams({ zipCode, status: "Active", limit: String(limit) });
    const res = await fetch(`${BASE_URL}/listings/sale?${params}`, { headers: headers() });
    if (!res.ok) throw new Error(`Rentcast listings failed: ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.listings ?? data.data ?? []);
    return items.map((l: Record<string, unknown>) => ({
      id: (l.id ?? l.zpid ?? l.mlsNumber ?? "") as string,
      formattedAddress: (l.formattedAddress ?? l.address ?? "") as string,
      addressLine1: (l.addressLine1 ?? l.address ?? "") as string,
      city: (l.city ?? "") as string,
      state: (l.state ?? "") as string,
      zipCode: (l.zipCode ?? l.zip ?? "") as string,
      bedrooms: (l.bedrooms ?? l.beds ?? null) as number | null,
      bathrooms: (l.bathrooms ?? l.baths ?? null) as number | null,
      squareFootage: (l.squareFootage ?? l.sqft ?? null) as number | null,
      price: (l.price ?? l.listPrice ?? null) as number | null,
      daysOnMarket: (l.daysOnMarket ?? null) as number | null,
      propertyType: (l.propertyType ?? null) as string | null,
      // RentCast returns listingAgent as an object {name, phone, email}; extract the name.
      listingAgent: (typeof l.listingAgent === "object" && l.listingAgent
        ? (l.listingAgent as { name?: string }).name ?? null
        : (l.listingAgent ?? null)) as string | null,
      status: (l.status ?? "Active") as string,
    }));
  }, { maxAttempts: 2, source: "rentcast/fetchSaleListings" });
}

// Convenience: full CMA summary for an address
export async function buildCMASummary(
  address: string,
  city = "Baton Rouge",
  state = "LA",
  askingPrice?: number
): Promise<{
  avm: AVMResult;
  rentalAVM: RentalAVMResult;
  comps: RentalComp[];
  summary: string;
}> {
  const [avm, rentalAVM, comps] = await Promise.all([
    getAVM(address, city, state),
    getRentalAVM(address, askingPrice),
    getSaleComps(address),
  ]);

  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const summary = [
    `Estimated value: ${fmt(avm.price)} (${fmt(avm.priceRangeLow)}–${fmt(avm.priceRangeHigh)}, ${avm.confidence} confidence)`,
    `Rental potential: ${fmt(rentalAVM.rent)}/mo${rentalAVM.grossYield ? ` · ${rentalAVM.grossYield}% gross yield` : ""}`,
    comps.length > 0
      ? `${comps.length} nearby comps, avg ${fmt(Math.round(comps.reduce((s, c) => s + c.price, 0) / comps.length))}`
      : "No nearby comps found",
  ].join("\n");

  return { avm, rentalAVM, comps, summary };
}
