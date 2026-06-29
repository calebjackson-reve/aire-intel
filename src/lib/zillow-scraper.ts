/**
 * Zillow internal API scraper — private market research for Caleb Jackson, REALTOR®
 *
 * LEGAL NOTE: Zillow ToS prohibits scraping for republication. This implementation
 * is strictly for internal market research by a licensed REALTOR®. Data is cached
 * 24h in DB, rate-limited to 1 req/3s, and never republished.
 *
 * TECHNICAL APPROACH:
 * Zillow's own web frontend uses an internal JSON endpoint:
 *   GET https://www.zillow.com/search/GetSearchPageState.htm
 * with query params that mirror what the search page sends. We mimic a browser
 * session with realistic headers. No API key or login required.
 *
 * RESPONSE SHAPE (as of 2026):
 * {
 *   cat1: {
 *     searchResults: {
 *       listResults: [ ZillowSearchResult... ],   // first ~40 results
 *       mapResults: [ ZillowSearchResult... ],    // overlapping set
 *     },
 *     totalResultCount: number,
 *     pageNum: number,
 *   }
 * }
 *
 * Individual property detail endpoint:
 *   GET https://www.zillow.com/graphql/?
 *     operationName=ForSaleShopperPlatformFullRenderQuery
 *     &variables={"zpid":"12345678","contactFormRenderParameter":...}
 * OR simpler property endpoint:
 *   GET https://www.zillow.com/homedetails/{address-slug}/{zpid}_zpid/?
 * The /homedetails page returns __NEXT_DATA__ JSON in a script tag with full property data.
 */

export interface ZillowSearchResult {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  daysOnMarket: number | null;
  zestimate: number | null;
  rentZestimate: number | null;
  status: "for_sale" | "recently_sold" | "for_rent";
  soldPrice: number | null;
  soldDate: string | null;         // ISO date string
  listingUrl: string;
  photoUrl: string | null;
  priceHistory: PriceHistoryEntry[] | null;
  hoaFee: number | null;
  taxAnnual: number | null;
  description: string | null;
}

export interface PriceHistoryEntry {
  date: string;           // "2024-03-15"
  price: number;
  event: string;          // "Listed for sale" | "Price reduced" | "Sold" | etc.
}

// ─── Rate limiter ────────────────────────────────────────────────────────────
// Max 1 request per 3 seconds across all calls in this process
let lastRequestAt = 0;
const MIN_DELAY_MS = 3_000;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise<void>((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

// ─── Browser-like headers ─────────────────────────────────────────────────────
// These mirror what Chrome 124 sends on macOS when browsing zillow.com
function getBrowserHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.zillow.com/",
  };
}

// JSON API headers — used for the GetSearchPageState endpoint
function getJsonHeaders(): Record<string, string> {
  return {
    ...getBrowserHeaders(),
    "Accept": "application/json, text/plain, */*",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Referer": "https://www.zillow.com/baton-rouge-la/",
  };
}

// ─── City → Zillow search region params ───────────────────────────────────────
// Zillow uses regionId + regionType for location filtering.
// regionType=6 = city, regionType=7 = ZIP, regionType=4 = county
const CITY_PARAMS: Record<string, { searchQueryState: ZillowSearchQueryState }> = {
  "baton-rouge": {
    searchQueryState: {
      pagination: {},
      isMapVisible: false,
      mapBounds: { west: -91.2814, east: -90.9181, south: 30.3007, north: 30.5600 },
      regionSelection: [{ regionId: 11049, regionType: 6 }],
      filterState: {},
      isListVisible: true,
    },
  },
  zachary: {
    searchQueryState: {
      pagination: {},
      isMapVisible: false,
      mapBounds: { west: -91.2300, east: -90.9900, south: 30.5900, north: 30.7500 },
      regionSelection: [{ regionId: 29053, regionType: 6 }],
      filterState: {},
      isListVisible: true,
    },
  },
  "st-francisville": {
    searchQueryState: {
      pagination: {},
      isMapVisible: false,
      mapBounds: { west: -91.4500, east: -91.3200, south: 30.7200, north: 30.8800 },
      regionSelection: [{ regionId: 32073, regionType: 6 }],
      filterState: {},
      isListVisible: true,
    },
  },
};

interface ZillowSearchQueryState {
  pagination: Record<string, unknown>;
  isMapVisible: boolean;
  mapBounds: { west: number; east: number; south: number; north: number };
  regionSelection: Array<{ regionId: number; regionType: number }>;
  filterState: ZillowFilterState;
  isListVisible: boolean;
  currentPage?: number;
}

interface ZillowFilterState {
  // Status
  isForSale?: { value: boolean };
  isRecentlySold?: { value: boolean };
  isForRent?: { value: boolean };
  isAllHomes?: { value: boolean };
  // Price
  price?: { min?: number; max?: number };
  // Beds
  beds?: { min?: number };
  // Baths
  baths?: { min?: number };
  // Sqft
  sqft?: { min?: number };
  // Property type
  isSingleFamily?: { value: boolean };
  isCondo?: { value: boolean };
  isTownhouse?: { value: boolean };
  isLand?: { value: boolean };
  // Sort
  sortSelection?: { value: string }; // "days" | "globalrelevanceex" | "price" | "pricedown"
}

// ─── Raw Zillow API response types ────────────────────────────────────────────
// These match what GetSearchPageState actually returns
interface ZillowRawListResult {
  zpid: string | number;
  statusType: string;              // "FOR_SALE" | "RECENTLY_SOLD" | "FOR_RENT"
  address: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZipcode: string;
  price: string | number | null;   // "$450,000" or 450000 — varies by response
  unformattedPrice: number | null;
  beds: number | null;
  baths: number | null;
  area: number | null;             // sqft
  lotAreaValue: number | null;
  lotAreaUnit: string | null;      // "sqft" | "acres"
  imgSrc: string | null;
  detailUrl: string;
  daysOnZillow: number | null;
  zestimate: number | null;
  rentZestimate: number | null;
  soldPrice: number | null;
  dateSold: string | null;         // "2025-11-15"
  latLong: { latitude: number; longitude: number } | null;
  variableData?: {
    type: string;
    text: string;
  };
}

interface ZillowSearchPageState {
  cat1?: {
    searchResults?: {
      listResults?: ZillowRawListResult[];
      mapResults?: ZillowRawListResult[];
    };
    totalResultCount?: number;
    pageNum?: number;
  };
  cat2?: {
    searchResults?: {
      listResults?: ZillowRawListResult[];
    };
  };
}

// ─── Raw detail page __NEXT_DATA__ types ──────────────────────────────────────
// Zillow detail pages embed the full property object in a <script id="__NEXT_DATA__"> tag
interface ZillowDetailData {
  props?: {
    pageProps?: {
      componentProps?: {
        gdpClientCache?: string; // JSON string with property data
      };
      initialData?: {
        building?: ZillowDetailBuilding;
      };
    };
  };
}

interface ZillowDetailBuilding {
  zpid?: string | number;
  price?: number;
  zestimate?: number;
  rentZestimate?: number;
  yearBuilt?: number;
  lotAreaValue?: number;
  lotAreaUnit?: string;
  homeType?: string;           // "SINGLE_FAMILY" | "CONDO" | "TOWNHOUSE" | "LOT" | "MULTI_FAMILY"
  hoaFee?: number;
  annualHomeownersInsurance?: number;
  taxAnnualAmount?: number;
  description?: string;
  priceHistory?: Array<{
    date: string;
    price: number;
    event: string;
    pricePerSquareFoot?: number;
    time?: number;
  }>;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  address?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    zipcode?: string;
  };
}

// ─── Main search function ─────────────────────────────────────────────────────

export type SearchCity = "baton-rouge" | "zachary" | "st-francisville";
export type SearchStatus = "for_sale" | "recently_sold";

export interface SearchOptions {
  city: SearchCity;
  status: SearchStatus;
  maxPrice?: number;
  minPrice?: number;
  minBeds?: number;
  page?: number;
}

/**
 * Search Zillow using their internal GetSearchPageState endpoint.
 * This is exactly what their own browser frontend calls.
 *
 * URL: https://www.zillow.com/search/GetSearchPageState.htm
 * Method: GET
 * Query params:
 *   searchQueryState — JSON-encoded search state
 *   wants            — JSON specifying which result sets to return
 *   requestId        — incrementing integer (we use 1)
 *   isDebugRequest   — false
 */
export async function searchZillow(opts: SearchOptions): Promise<ZillowSearchResult[]> {
  const cityConfig = CITY_PARAMS[opts.city];
  if (!cityConfig) throw new Error(`Unknown city: ${opts.city}`);

  // Build filter state based on status + filters
  const filterState: ZillowFilterState = {};

  if (opts.status === "for_sale") {
    filterState.isForSale = { value: true };
    filterState.isAllHomes = { value: true };
  } else if (opts.status === "recently_sold") {
    filterState.isRecentlySold = { value: true };
    filterState.isAllHomes = { value: true };
  }

  if (opts.maxPrice) filterState.price = { ...filterState.price, max: opts.maxPrice };
  if (opts.minPrice) filterState.price = { ...filterState.price, min: opts.minPrice };
  if (opts.minBeds) filterState.beds = { min: opts.minBeds };

  filterState.sortSelection = { value: opts.status === "recently_sold" ? "globalrelevanceex" : "days" };

  const searchQueryState: ZillowSearchQueryState = {
    ...cityConfig.searchQueryState,
    filterState,
    currentPage: opts.page ?? 1,
  };

  // wants: { cat1: ["listResults", "mapResults"], cat2: ["total"] }
  // cat1 = primary results, cat2 = alternative results (e.g. recently sold when browsing for sale)
  const wants = JSON.stringify({ cat1: ["listResults", "mapResults"], cat2: ["total"] });

  const url = new URL("https://www.zillow.com/search/GetSearchPageState.htm");
  url.searchParams.set("searchQueryState", JSON.stringify(searchQueryState));
  url.searchParams.set("wants", wants);
  url.searchParams.set("requestId", "1");
  url.searchParams.set("isDebugRequest", "false");

  await rateLimit();

  const res = await fetch(url.toString(), {
    headers: getJsonHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zillow search failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as ZillowSearchPageState;

  // Combine listResults + mapResults, dedup by zpid
  const rawResults: ZillowRawListResult[] = [];
  const seenZpids = new Set<string>();

  for (const r of [
    ...(data.cat1?.searchResults?.listResults ?? []),
    ...(data.cat1?.searchResults?.mapResults ?? []),
  ]) {
    const zpid = String(r.zpid);
    if (!seenZpids.has(zpid)) {
      seenZpids.add(zpid);
      rawResults.push(r);
    }
  }

  return rawResults.map((r) => parseSearchResult(r, opts.status));
}

function parseSearchResult(r: ZillowRawListResult, status: SearchStatus): ZillowSearchResult {
  // Price can come as "$450,000" string or 450000 number
  let price: number | null = null;
  if (r.unformattedPrice != null) {
    price = r.unformattedPrice;
  } else if (typeof r.price === "number") {
    price = r.price;
  } else if (typeof r.price === "string") {
    price = parseFloat(r.price.replace(/[$,]/g, "")) || null;
  }

  // Lot area normalization
  let lotSqft: number | null = null;
  if (r.lotAreaValue != null) {
    if (r.lotAreaUnit === "acres") {
      lotSqft = Math.round(r.lotAreaValue * 43560);
    } else {
      lotSqft = r.lotAreaValue;
    }
  }

  const detailPath = r.detailUrl?.startsWith("http")
    ? r.detailUrl
    : `https://www.zillow.com${r.detailUrl ?? ""}`;

  return {
    zpid: String(r.zpid),
    address: r.addressStreet ?? r.address ?? "",
    city: r.addressCity ?? "",
    state: r.addressState ?? "LA",
    zip: r.addressZipcode ?? "",
    price,
    beds: r.beds ?? null,
    baths: r.baths ?? null,
    sqft: r.area ?? null,
    lotSqft,
    yearBuilt: null,                // not in search results — populated by detail fetch
    propertyType: null,             // not in search results — populated by detail fetch
    daysOnMarket: r.daysOnZillow ?? null,
    zestimate: r.zestimate ?? null,
    rentZestimate: r.rentZestimate ?? null,
    status,
    soldPrice: r.soldPrice ?? null,
    soldDate: r.dateSold ?? null,
    listingUrl: detailPath,
    photoUrl: r.imgSrc ?? null,
    priceHistory: null,             // populated by detail fetch
    hoaFee: null,
    taxAnnual: null,
    description: null,
  };
}

// ─── Detail page scraper ──────────────────────────────────────────────────────
// For recently_sold comps we want priceHistory + yearBuilt.
// Only called for the top N listings to avoid hammering.

/**
 * Fetch a Zillow property detail page and extract __NEXT_DATA__.
 * Returns partial ZillowSearchResult fields that aren't in search results.
 */
export async function fetchPropertyDetail(zpid: string, listingUrl: string): Promise<Partial<ZillowSearchResult>> {
  await rateLimit();

  const res = await fetch(listingUrl, {
    headers: getBrowserHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return {};

  const html = await res.text();

  // Extract __NEXT_DATA__ JSON from <script id="__NEXT_DATA__" type="application/json">
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!match?.[1]) return {};

  let nextData: ZillowDetailData;
  try {
    nextData = JSON.parse(match[1]) as ZillowDetailData;
  } catch {
    return {};
  }

  // The gdpClientCache is a JSON string containing the property object keyed by zpid
  const gdpRaw = nextData.props?.pageProps?.componentProps?.gdpClientCache;
  let building: ZillowDetailBuilding | null = null;

  if (gdpRaw) {
    try {
      const gdpCache = JSON.parse(gdpRaw) as Record<string, { property?: ZillowDetailBuilding }>;
      // Key is like "ForSaleDoubleScrollFullRenderQuery{"zpid":"12345678",...}"
      // Find the entry that contains our zpid
      for (const val of Object.values(gdpCache)) {
        if (val?.property?.zpid && String(val.property.zpid) === zpid) {
          building = val.property;
          break;
        }
      }
      // Fallback: take first property
      if (!building) {
        const first = Object.values(gdpCache)[0];
        if (first?.property) building = first.property;
      }
    } catch {
      // ignore parse error
    }
  }

  // Also try initialData path
  if (!building && nextData.props?.pageProps?.initialData?.building) {
    building = nextData.props.pageProps.initialData.building;
  }

  if (!building) return {};

  const priceHistory: PriceHistoryEntry[] | null = building.priceHistory
    ? building.priceHistory.map((h) => ({
        date: h.date,
        price: h.price,
        event: h.event,
      }))
    : null;

  let lotSqft: number | null = null;
  if (building.lotAreaValue != null) {
    if (building.lotAreaUnit === "Acres") {
      lotSqft = Math.round(building.lotAreaValue * 43560);
    } else {
      lotSqft = building.lotAreaValue;
    }
  }

  // homeType: "SINGLE_FAMILY" → "SingleFamily"
  const propertyTypeMap: Record<string, string> = {
    SINGLE_FAMILY: "SingleFamily",
    CONDO: "Condo",
    TOWNHOUSE: "Townhouse",
    LOT: "Land",
    MULTI_FAMILY: "MultiFamily",
    MANUFACTURED: "Manufactured",
  };
  const propertyType = building.homeType ? (propertyTypeMap[building.homeType] ?? building.homeType) : null;

  return {
    yearBuilt: building.yearBuilt ?? null,
    lotSqft: lotSqft ?? undefined,
    propertyType,
    priceHistory,
    hoaFee: building.hoaFee ?? null,
    taxAnnual: building.taxAnnualAmount ?? null,
    description: building.description?.slice(0, 1000) ?? null,   // cap to avoid huge DB rows
    zestimate: building.zestimate ?? null,
    rentZestimate: building.rentZestimate ?? null,
  };
}

// ─── Bulk scrape with DB upsert ───────────────────────────────────────────────

export interface ScrapeJobOptions {
  city: SearchCity;
  status: SearchStatus;
  maxPrice?: number;
  minPrice?: number;
  minBeds?: number;
  /** Max pages to fetch. Each page = ~40 results. Default 2 (80 listings). */
  maxPages?: number;
  /** Enrich top N listings with detail page fetch (yearBuilt, priceHistory). Default 20. */
  enrichTopN?: number;
}

export interface ScrapeJobResult {
  city: string;
  status: string;
  fetched: number;
  enriched: number;
  errors: string[];
}

/**
 * Full scrape job: search multiple pages, optionally enrich top N with detail data.
 * Returns raw results — caller upserts to DB.
 */
export async function runScrapeJob(opts: ScrapeJobOptions): Promise<{
  results: ZillowSearchResult[];
  meta: ScrapeJobResult;
}> {
  const maxPages = opts.maxPages ?? 2;
  const enrichTopN = opts.enrichTopN ?? 20;
  const allResults: ZillowSearchResult[] = [];
  const errors: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const pageResults = await searchZillow({
        city: opts.city,
        status: opts.status,
        maxPrice: opts.maxPrice,
        minPrice: opts.minPrice,
        minBeds: opts.minBeds,
        page,
      });

      allResults.push(...pageResults);

      // Stop if we got fewer results than a full page
      if (pageResults.length < 20) break;
    } catch (err) {
      errors.push(`Page ${page}: ${String(err)}`);
      break;
    }
  }

  // Enrich top N with detail data
  let enriched = 0;
  const toEnrich = allResults.slice(0, enrichTopN);

  for (const listing of toEnrich) {
    try {
      const detail = await fetchPropertyDetail(listing.zpid, listing.listingUrl);
      Object.assign(listing, detail);
      enriched++;
    } catch (err) {
      errors.push(`Detail ${listing.zpid}: ${String(err)}`);
    }
  }

  return {
    results: allResults,
    meta: {
      city: opts.city,
      status: opts.status,
      fetched: allResults.length,
      enriched,
      errors,
    },
  };
}

// ─── Cache staleness check ────────────────────────────────────────────────────

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isCacheStale(scrapedAt: Date): boolean {
  return Date.now() - scrapedAt.getTime() > CACHE_TTL_MS;
}
