/**
 * Paragon MLS Integration — Black Knight RESO Web API
 *
 * GBRAR (Greater Baton Rouge Association of REALTORS) runs Black Knight's
 * Paragon Connect, which exposes a RESO-compliant OData v4 endpoint.
 *
 * Base URL pattern:
 *   https://api.paragonapi.com/api/v2/OData/<dataset>/Properties
 *
 * Where <dataset> is the MLS-specific dataset key. For GBRAR this is typically
 * `bk9` or `mlsfin`. Don't hardcode it — paste the full URL into the
 * PARAGON_API_URL env var (or /settings) once GBRAR provisions the key.
 *
 * ── OData refresher (this is NOT REST) ───────────────────────────────────────
 *   Collection query:   GET <base>?$filter=...&$top=50&$orderby=...
 *   Single entity:      GET <base>('<key>')
 *   Logical operators:  eq, ne, gt, ge, lt, le, and, or, not
 *   String functions:   contains(Field, 'value'), startswith(Field, 'value')
 *   Response envelope:  { "@odata.context": "...", "value": [ ...items ] }
 *
 * Auth: Bearer token (server token, issued by MLS admin).
 *
 * ── RESO Data Dictionary ─────────────────────────────────────────────────────
 * Field names below (ListingId, UnparsedAddress, ListPrice, etc.) come from
 * the RESO Data Dictionary v1.7+. Black Knight is a certified RESO platform,
 * so these names are stable across boards.
 *   Spec: https://ddwiki.reso.org/display/DDW17
 */

import { getParagonConfig } from "./settings";
import { withRetry, logError } from "./error-memory";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * The canonical AIRE listing shape used everywhere in the app.
 * Keep this in sync with the buyer-match logic in /api/listings/route.ts.
 */
export interface ParagonListing {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  status: string;            // RESO StandardStatus: "Active" | "Pending" | "Closed" | ...
  listDate: string;          // ISO timestamp
  photos: string[];          // all media URLs in order
  imageUrl: string;          // primary photo (first in Media array)
  mlsNumber: string;
  propertyType: string;      // RESO PropertyType: "Residential" | "ResidentialLease" | ...
  mlsStatus: string;         // board-specific status text (e.g. "Active Under Contract")
  daysOnMarket: number;
  yearBuilt: number;
  modifiedAt: string;        // RESO ModificationTimestamp — used for incremental sync
  listingAgent: string;      // RESO ListAgentFullName
  originalListPrice: number; // RESO OriginalListPrice — for price reduction detection
}

/** Alias for callers who prefer the shorter name. */
export type Listing = ParagonListing;

/** Filter options for `fetchActiveListings`. */
export interface ListingFilter {
  city?: string;
  zip?: string;        // RESO PostalCode
  minPrice?: number;
  maxPrice?: number;
  beds?: number;       // minimum bedroom count
  limit?: number;      // OData $top (default 50)
  /** Override the default `StandardStatus eq 'Active'` — pass "" to drop the status filter entirely. */
  status?: string;
  /** ISO timestamp — only return listings where ModificationTimestamp >= this value. OData v4 DateTimeOffset. */
  changedSince?: string;
}

// ─── Field mapping (RESO Data Dictionary → AIRE shape) ───────────────────────

/**
 * Map a raw RESO property record into AIRE's ParagonListing shape.
 *
 * Defensive: every field falls back through `??` chains so missing fields
 * never crash the UI. Numbers are coerced via Number() with a 0 fallback.
 */
function mapListing(raw: Record<string, unknown>): ParagonListing {
  // Address: prefer UnparsedAddress (the RESO-blessed full string).
  // If absent, compose from parts. Some boards leave UnparsedAddress null
  // for new listings until staff fill it in.
  const composed = [
    raw["StreetNumber"],
    raw["StreetName"],
    raw["StreetSuffix"],
  ]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" ");

  const address = String(
    raw["UnparsedAddress"] ??
    (composed || "") ??
    raw["StreetAddress"] ??
    raw["address"] ??
    ""
  );

  // Media is an array of { MediaURL, Order, ... } objects. First entry is the primary.
  const mediaRaw = raw["Media"];
  const media = Array.isArray(mediaRaw) ? (mediaRaw as Array<Record<string, unknown>>) : [];
  const photos = media
    .map((m) => String(m?.["MediaURL"] ?? m?.["Url"] ?? ""))
    .filter(Boolean);
  const imageUrl = photos[0] ?? "";

  // Listing id: RESO ListingId is the canonical MLS number.
  const id = String(raw["ListingId"] ?? raw["ListingKey"] ?? raw["id"] ?? "");

  return {
    id,
    mlsNumber: id,
    address,
    city: String(raw["City"] ?? raw["city"] ?? ""),
    state: String(raw["StateOrProvince"] ?? raw["state"] ?? "LA"),
    zip: String(raw["PostalCode"] ?? raw["zip"] ?? ""),
    price: Number(raw["ListPrice"] ?? raw["price"] ?? 0) || 0,
    beds: Number(raw["BedroomsTotal"] ?? raw["beds"] ?? 0) || 0,
    baths: Number(raw["BathroomsTotalInteger"] ?? raw["BathroomsTotal"] ?? raw["baths"] ?? 0) || 0,
    sqft: Number(raw["LivingArea"] ?? raw["sqft"] ?? 0) || 0,
    status: String(raw["StandardStatus"] ?? raw["status"] ?? "Active"),
    mlsStatus: String(raw["MlsStatus"] ?? raw["StandardStatus"] ?? ""),
    propertyType: String(raw["PropertyType"] ?? raw["PropertySubType"] ?? "Residential"),
    listDate: String(raw["ListingContractDate"] ?? raw["OnMarketDate"] ?? raw["listDate"] ?? ""),
    modifiedAt: String(raw["ModificationTimestamp"] ?? raw["BridgeModificationTimestamp"] ?? ""),
    daysOnMarket: Number(raw["DaysOnMarket"] ?? 0) || 0,
    yearBuilt: Number(raw["YearBuilt"] ?? 0) || 0,
    photos,
    imageUrl,
    listingAgent: String(
      raw["ListAgentFullName"] ??
      [raw["ListAgentFirstName"], raw["ListAgentLastName"]].filter(Boolean).join(" ") ??
      ""
    ),
    originalListPrice: Number(raw["OriginalListPrice"] ?? 0) || 0,
  };
}

// ─── OData query builder ─────────────────────────────────────────────────────

/**
 * Build the OData $filter clause from AIRE-shaped filter options.
 * Returns the raw filter string (no leading `$filter=`).
 *
 * Example:  buildFilter({ city: "Baton Rouge", minPrice: 300_000 })
 *        → "StandardStatus eq 'Active' and City eq 'Baton Rouge' and ListPrice ge 300000"
 */
function buildFilter(opts: ListingFilter = {}): string {
  const clauses: string[] = [];

  // Default to Active unless explicitly overridden. Empty string drops the filter.
  const statusClause = opts.status === undefined ? "Active" : opts.status;
  if (statusClause) {
    clauses.push(`StandardStatus eq '${escapeODataString(statusClause)}'`);
  }

  if (opts.city) {
    clauses.push(`City eq '${escapeODataString(opts.city)}'`);
  }
  if (opts.zip) {
    clauses.push(`PostalCode eq '${escapeODataString(opts.zip)}'`);
  }
  if (typeof opts.minPrice === "number" && Number.isFinite(opts.minPrice)) {
    clauses.push(`ListPrice ge ${Math.round(opts.minPrice)}`);
  }
  if (typeof opts.maxPrice === "number" && Number.isFinite(opts.maxPrice)) {
    clauses.push(`ListPrice le ${Math.round(opts.maxPrice)}`);
  }
  if (typeof opts.beds === "number" && Number.isFinite(opts.beds)) {
    clauses.push(`BedroomsTotal ge ${Math.round(opts.beds)}`);
  }
  if (opts.changedSince) {
    // OData v4 DateTimeOffset literal — no quotes needed
    clauses.push(`ModificationTimestamp ge ${opts.changedSince}`);
  }

  return clauses.join(" and ");
}

/** Escape single quotes in OData string literals (RFC: double the quote). */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

/**
 * Fetch active listings from Paragon.
 *
 * Usage:
 *   const config = await getParagonConfig();
 *   if (!config) return [];
 *   const listings = await fetchActiveListings(config, { city: "Baton Rouge", limit: 25 });
 *
 * Backward-compat: calling with no args still works — it loads config and
 * uses defaults (Active, top 50, ordered by ModificationTimestamp desc).
 */
export async function fetchActiveListings(
  config?: { url: string; key: string } | null,
  options: ListingFilter = {}
): Promise<ParagonListing[]> {
  const cfg = config ?? (await getParagonConfig());
  if (!cfg) return [];

  const limit = options.limit ?? 50;
  const filter = buildFilter(options);

  // OData query string. Note: $filter values are URL-encoded; the field names
  // themselves are not. We build with URLSearchParams to handle encoding.
  const params = new URLSearchParams();
  if (filter) params.set("$filter", filter);
  params.set("$top", String(limit));
  params.set("$orderby", "ModificationTimestamp desc");

  const url = `${cfg.url}?${params.toString()}`;

  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });

      // Auth failure — almost always a bad/expired key.
      if (res.status === 401) {
        throw new Error(
          "Paragon 401 Unauthorized — check PARAGON_API_KEY (Bearer token from GBRAR MLS admin)."
        );
      }

      // 404 usually means the dataset slug in PARAGON_API_URL is wrong
      // (e.g. /bk9/ vs /mlsfin/). Log and return [] so the UI still renders.
      if (res.status === 404) {
        await logError("paragon", "paragon/fetchActiveListings", new Error(
          `Paragon 404 Not Found at ${cfg.url} — likely wrong dataset path in PARAGON_API_URL.`
        ), { statusCode: 404, url: cfg.url });
        return [] as ParagonListing[];
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Paragon API error ${res.status}: ${body.slice(0, 500)}`);
      }

      // OData envelope: { "@odata.context": "...", "value": [ ... ] }
      // Some boards strip the envelope and return a bare array — handle both.
      const data = (await res.json()) as
        | { value?: unknown[]; listings?: unknown[]; results?: unknown[] }
        | unknown[];

      const items: unknown[] = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown[]>).value ??
            (data as Record<string, unknown[]>).listings ??
            (data as Record<string, unknown[]>).results ??
            []);

      return items.map((item) => mapListing(item as Record<string, unknown>));
    },
    { source: "paragon/fetchActiveListings", maxAttempts: 3, type: "paragon" }
  );
}

/**
 * Fetch a single listing by its RESO ListingId.
 *
 * OData entity addressing: GET <base>('<listingId>')
 * Note the parentheses + quoted key — this is NOT a REST-style /:id path.
 *
 * Returns null on 404 (listing not found / off-market).
 * Used by the buyer-match auto-link flow when we have a ListingId from
 * a webhook or a saved alert and want fresh details.
 */
export async function fetchListingById(
  config: { url: string; key: string } | null | undefined,
  listingId: string
): Promise<ParagonListing | null> {
  const cfg = config ?? (await getParagonConfig());
  if (!cfg || !listingId) return null;

  // OData entity key: single-quoted string, embedded in parens.
  // E.g. https://api.paragonapi.com/api/v2/OData/bk9/Properties('2024001')
  const url = `${cfg.url}('${escapeODataString(listingId)}')`;

  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 404) return null;

      if (res.status === 401) {
        throw new Error(
          "Paragon 401 Unauthorized — check PARAGON_API_KEY (Bearer token from GBRAR MLS admin)."
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Paragon API error ${res.status}: ${body.slice(0, 500)}`);
      }

      // Single-entity responses come back as the raw object (no `value` array).
      const raw = (await res.json()) as Record<string, unknown>;
      return mapListing(raw);
    },
    {
      source: "paragon/fetchListingById",
      maxAttempts: 3,
      type: "paragon",
      context: { listingId },
    }
  );
}

/**
 * Backward-compat alias for older callers. Prefer `fetchListingById`.
 * @deprecated Use `fetchListingById(config, id)` instead.
 */
export async function fetchListing(id: string): Promise<ParagonListing | null> {
  return fetchListingById(null, id);
}
