// Zillow RapidAPI integration — fetches most-viewed/saved listings for viral content
// Uses the Zillow-com1 RapidAPI endpoint (~$10/mo for ~500 req/day)
// Env: ZILLOW_RAPIDAPI_KEY

export interface ZillowProperty {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  viewCount: number | null;
  saveCount: number | null;
  daysOnMarket: number | null;
  listingUrl: string;
  photoUrl: string | null;
}

const BATON_ROUGE_ZIPS = [
  "70808", "70809", "70810", "70806", "70816",
  "70817", "70820", "70706", "70726", "70714",
];

const RAPIDAPI_HOST = "zillow-com1.p.rapidapi.com";

function getApiKey(): string {
  const key = process.env.ZILLOW_RAPIDAPI_KEY;
  if (!key) throw new Error("ZILLOW_RAPIDAPI_KEY not set");
  return key;
}

/** Search Zillow for active listings in a ZIP code, sorted by views. */
async function searchByZip(zip: string, page = 1): Promise<ZillowProperty[]> {
  const apiKey = getApiKey();

  const url = `https://${RAPIDAPI_HOST}/propertySearch?location=${zip}&status_type=ForSale&sort=days_on_zillow&page=${page}`;

  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Zillow API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    props?: Array<{
      zpid: string | number;
      address: string;
      city: string;
      state: string;
      zipcode: string;
      price: number | null;
      bedrooms: number | null;
      bathrooms: number | null;
      livingArea: number | null;
      imgSrc: string | null;
      detailUrl: string;
      daysOnZillow: number | null;
    }>;
  };

  if (!data.props) return [];

  return data.props.map((p) => ({
    zpid: String(p.zpid),
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "LA",
    zip: p.zipcode ?? zip,
    price: p.price ?? null,
    beds: p.bedrooms ?? null,
    baths: p.bathrooms ?? null,
    sqft: p.livingArea ?? null,
    viewCount: null,
    saveCount: null,
    daysOnMarket: p.daysOnZillow ?? null,
    listingUrl: p.detailUrl?.startsWith("http")
      ? p.detailUrl
      : `https://www.zillow.com${p.detailUrl ?? ""}`,
    photoUrl: p.imgSrc ?? null,
  }));
}

/** Get property details including view/save counts for a single zpid. */
async function getPropertyDetails(zpid: string): Promise<{ viewCount: number | null; saveCount: number | null }> {
  const apiKey = getApiKey();

  const res = await fetch(`https://${RAPIDAPI_HOST}/property?zpid=${zpid}`, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return { viewCount: null, saveCount: null };

  const data = await res.json() as {
    props?: { viewCount?: number; favoriteCount?: number };
    viewCount?: number;
    favoriteCount?: number;
  };

  const viewCount = data.props?.viewCount ?? data.viewCount ?? null;
  const saveCount = data.props?.favoriteCount ?? data.favoriteCount ?? null;

  return { viewCount, saveCount };
}

/** Viral score: views + (saves × 3). Higher = more likely to generate interest. */
export function viralScore(viewCount: number | null, saveCount: number | null): number {
  return (viewCount ?? 0) + (saveCount ?? 0) * 3;
}

/**
 * Fetch top viral listings across Baton Rouge ZIP codes.
 * Returns the top N listings ranked by viral score.
 * Caps API calls — fetches from the first few ZIPs then ranks.
 */
export async function fetchViralListings(topN = 5): Promise<ZillowProperty[]> {
  const targetZips = BATON_ROUGE_ZIPS.slice(0, 4); // 4 ZIPs = 4 API calls max
  const results: ZillowProperty[] = [];

  for (const zip of targetZips) {
    try {
      const listings = await searchByZip(zip);
      results.push(...listings.slice(0, 10)); // top 10 per ZIP
    } catch {
      // Skip failed ZIP — don't abort the whole run
    }
  }

  // Deduplicate by zpid
  const seen = new Set<string>();
  const unique = results.filter((l) => {
    if (seen.has(l.zpid)) return false;
    seen.add(l.zpid);
    return true;
  });

  // Enrich top candidates with view/save counts (limited to save API calls)
  const toEnrich = unique.slice(0, topN * 3);
  const enriched = await Promise.allSettled(
    toEnrich.map(async (l) => {
      const { viewCount, saveCount } = await getPropertyDetails(l.zpid);
      return { ...l, viewCount, saveCount };
    })
  );

  const withCounts = enriched
    .filter((r): r is PromiseFulfilledResult<ZillowProperty> => r.status === "fulfilled")
    .map((r) => r.value);

  // Sort by viral score, return top N
  return withCounts
    .sort((a, b) => viralScore(b.viewCount, b.saveCount) - viralScore(a.viewCount, a.saveCount))
    .slice(0, topN);
}
