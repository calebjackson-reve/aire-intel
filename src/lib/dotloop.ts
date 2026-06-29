import { prisma } from "./prisma";
import { withRetry } from "./error-memory";

/**
 * Dotloop v2 API integration.
 *
 * API root:   https://api-gateway.dotloop.com/public/v2
 * Auth:       OAuth 2.0 (3-legged auth-code flow). There are NO Personal Access
 *             Tokens. Register an app at info.dotloop.com/developers (~5-7 biz
 *             days) for a client_id/secret, then run scripts/dotloop-auth.mjs
 *             once to get a refresh token. See getDotloopConfig() below.
 *             Scopes: loop:read (folders/documents/details) + loop:write (upload).
 *
 * Endpoints we use:
 *   GET /profile                               → list profiles for current user
 *   GET /profile/{profileId}/loop?...          → list loops (paginated)
 *   GET /profile/{profileId}/loop/{loopId}     → loop details
 *   GET /profile/{profileId}/loop/{loopId}/participant
 *   GET /profile/{profileId}/loop/{loopId}/activity
 *   GET /profile/{profileId}/loop/{loopId}/folder
 */

const DOTLOOP_BASE = "https://api-gateway.dotloop.com/public/v2";
const DOTLOOP_AUTH_BASE = "https://auth.dotloop.com/oauth";

// ─── Settings glue ───────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting
    .upsert({ where: { key }, update: { value }, create: { key, value } })
    .catch(() => null);
}

export interface DotloopConfig {
  accessToken: string;
  profileId: string;
}

/**
 * Dotloop v2 is OAuth 2.0 only (3-legged auth-code flow) — there are NO
 * Personal Access Tokens. Register an app at info.dotloop.com/developers to get
 * DOTLOOP_CLIENT_ID + DOTLOOP_CLIENT_SECRET, then run the one-time auth flow
 * (scripts/dotloop-auth.mjs) to obtain a refresh token. Access tokens last 12h
 * and are refreshed + cached here, mirroring the Lofty integration.
 *
 * Resolution order:
 *   1. DOTLOOP_ACCESS_TOKEN set directly  → use as-is (manual / testing override)
 *   2. client_id + client_secret + refresh_token → refresh into a 12h access token
 * Profile id: DOTLOOP_PROFILE_ID, else the default profile from /profile.
 */

let _tokenCache: { accessToken: string; expiresAt: number } | null = null;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // seconds
  token_type?: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Exchange a refresh token for a fresh access token. Persists a rotated refresh
 * token back to Settings if dotloop returns one.
 */
async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) return _tokenCache.accessToken;

  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const res = await fetch(`${DOTLOOP_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Dotloop token refresh ${res.status}: ${t.slice(0, 200) || res.statusText}`);
  }
  const data = (await res.json()) as TokenResponse;
  _tokenCache = { accessToken: data.access_token, expiresAt: now + (data.expires_in ?? 43_200) * 1000 };
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await setSetting("DOTLOOP_REFRESH_TOKEN", data.refresh_token);
  }
  return data.access_token;
}

/**
 * One-time: exchange an OAuth authorization code (from the consent redirect) for
 * the initial access + refresh tokens. Used by scripts/dotloop-auth.mjs.
 */
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${DOTLOOP_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Dotloop code exchange ${res.status}: ${t.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function getDotloopConfig(): Promise<DotloopConfig | null> {
  const [direct, clientId, clientSecret, refreshToken, profileIdSetting] = await Promise.all([
    getSetting("DOTLOOP_ACCESS_TOKEN"),
    getSetting("DOTLOOP_CLIENT_ID"),
    getSetting("DOTLOOP_CLIENT_SECRET"),
    getSetting("DOTLOOP_REFRESH_TOKEN"),
    getSetting("DOTLOOP_PROFILE_ID"),
  ]);

  let accessToken: string | null = direct;
  if (!accessToken && clientId && clientSecret && refreshToken) {
    accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
  }
  if (!accessToken) return null;

  // Resolve profile id: explicit setting, else the default profile.
  let profileId = profileIdSetting;
  if (!profileId) {
    const profiles = await fetchProfiles(accessToken).catch(() => [] as DotloopProfile[]);
    const def = profiles.find((p) => p.default) ?? profiles[0];
    if (def) {
      profileId = String(def.id);
      await setSetting("DOTLOOP_PROFILE_ID", profileId);
    }
  }
  if (!profileId) return null;

  return { accessToken, profileId };
}

// ─── Low-level fetch helper with friendly errors ─────────────────────────────

async function dotloopFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${DOTLOOP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Translate common errors to actionable messages.
    if (res.status === 401) {
      throw new Error(
        "Dotloop returned 401. Two likely causes:\n" +
        "  1. Access token expired or wrong — regenerate at dotloop.com → Account → Integrations → API Access Tokens.\n" +
        "  2. Your Rêve Realtors brokerage admin hasn't enabled API access on your profile. " +
        "Email support or your broker to request 'Public API access' for your account.",
      );
    }
    if (res.status === 403) {
      throw new Error(
        "Dotloop 403 Forbidden. Your token doesn't include the scopes needed for this endpoint. " +
        "Generate a new Personal Access Token from dotloop.com and check 'Read' permissions are enabled.",
      );
    }
    if (res.status === 404) {
      throw new Error(`Dotloop 404 — resource not found at ${path}. Check profileId and loopId.`);
    }
    throw new Error(`Dotloop ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ─── Profile discovery ───────────────────────────────────────────────────────

export interface DotloopProfile {
  id: number;
  type: string; // INDIVIDUAL | TEAM | BROKERAGE
  name: string;
  default: boolean;
}

/**
 * Lists profiles for the authenticated user. Used during onboarding to help
 * Caleb find his Profile ID — it's the `id` of the default profile.
 */
export async function fetchProfiles(accessToken: string): Promise<DotloopProfile[]> {
  const data = await dotloopFetch<{ data?: DotloopProfile[] }>("/profile", accessToken);
  return data.data ?? [];
}

// ─── Loops ───────────────────────────────────────────────────────────────────

export interface DotloopLoop {
  id: number;
  name: string;
  status: string;
  loopType?: string;
  streetName?: string;
  streetNumber?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  acceptanceDate?: string;
  closingDate?: string;
  expectedClosingDate?: string;
  contractDate?: string;
  salePrice?: number;
  commission?: number;
  createdDate?: string;
  updatedDate?: string;
}

export interface LoopListResponse {
  data: DotloopLoop[];
  meta?: { total: number; size: number; offset: number };
}

export async function fetchLoops(
  config: DotloopConfig,
  options: { batchSize?: number; offset?: number; filter?: string } = {},
): Promise<LoopListResponse> {
  const params = new URLSearchParams({
    batch_size: String(options.batchSize ?? 50),
    batch_number: String(Math.floor((options.offset ?? 0) / (options.batchSize ?? 50)) + 1),
    sort: "ACCEPTANCE_DATE,desc",
  });
  if (options.filter) params.set("filter", options.filter);

  return dotloopFetch<LoopListResponse>(
    `/profile/${config.profileId}/loop?${params}`,
    config.accessToken,
  );
}

export async function fetchAllLoops(config: DotloopConfig): Promise<DotloopLoop[]> {
  const all: DotloopLoop[] = [];
  const batchSize = 100;
  let offset = 0;

  while (true) {
    const page = await fetchLoops(config, { batchSize, offset });
    all.push(...page.data);
    if (page.data.length < batchSize) break;
    offset += batchSize;
    if (offset > 1000) break; // Safety cap — solo agent shouldn't have 1000+ loops
  }

  return all;
}

export async function fetchLoopDetails(
  config: DotloopConfig,
  loopId: string | number,
): Promise<DotloopLoop & { sections?: Record<string, unknown>; activity?: unknown[] }> {
  return dotloopFetch(
    `/profile/${config.profileId}/loop/${loopId}`,
    config.accessToken,
  );
}

// ─── Participants ────────────────────────────────────────────────────────────

export interface LoopParticipant {
  id: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string; // BUYER | SELLER | BUYER_AGENT | SELLER_AGENT | LENDER | TITLE | etc.
  memberOfMyTeam?: boolean;
}

export async function fetchLoopParticipants(
  config: DotloopConfig,
  loopId: string | number,
): Promise<LoopParticipant[]> {
  const data = await dotloopFetch<{ data?: LoopParticipant[] }>(
    `/profile/${config.profileId}/loop/${loopId}/participant`,
    config.accessToken,
  );
  return data.data ?? [];
}

// ─── Activity log ────────────────────────────────────────────────────────────

export interface LoopActivity {
  id: number;
  event: string;
  category?: string;
  description?: string;
  performedBy?: string;
  performedDate?: string;
}

export async function fetchLoopActivity(
  config: DotloopConfig,
  loopId: string | number,
): Promise<LoopActivity[]> {
  const data = await dotloopFetch<{ data?: LoopActivity[] }>(
    `/profile/${config.profileId}/loop/${loopId}/activity`,
    config.accessToken,
  );
  return data.data ?? [];
}

// ─── Folders + document status ───────────────────────────────────────────────

export interface LoopFolder {
  id: number;
  name: string;
  documents?: { id: number; name: string; signed?: boolean }[];
}

export async function fetchLoopFolders(
  config: DotloopConfig,
  loopId: string | number,
): Promise<LoopFolder[]> {
  const data = await dotloopFetch<{ data?: LoopFolder[] }>(
    `/profile/${config.profileId}/loop/${loopId}/folder`,
    config.accessToken,
  );
  return data.data ?? [];
}

/** Count signed vs pending documents across all folders. */
export function summarizeDocs(folders: LoopFolder[]): { signed: number; pending: number; total: number } {
  let signed = 0, pending = 0;
  for (const f of folders) {
    for (const d of f.documents ?? []) {
      if (d.signed) signed++;
      else pending++;
    }
  }
  return { signed, pending, total: signed + pending };
}

/**
 * Normalized, flattened view of a loop's documents — one row per document with
 * its folder, signed status, and id. Used by the MCP connector and the
 * compliance reconciler. Wrapped in withRetry; returns null if not configured.
 *
 * AIRE: loop:compliance-sweep
 */
export interface LoopDocument {
  documentId: number;
  documentName: string;
  folderId: number;
  folderName: string;
  signed: boolean;
}

export async function getLoopDocuments(loopId: string | number): Promise<LoopDocument[] | null> {
  const config = await getDotloopConfig();
  if (!config) return null;
  const folders = await withRetry(
    () => fetchLoopFolders(config, loopId),
    { source: "dotloop.getLoopDocuments", type: "dotloop", context: { loopId } },
  );
  const docs: LoopDocument[] = [];
  for (const f of folders) {
    for (const d of f.documents ?? []) {
      docs.push({
        documentId: d.id,
        documentName: d.name,
        folderId: f.id,
        folderName: f.name,
        signed: Boolean(d.signed),
      });
    }
  }
  return docs;
}

// ─── Document upload ───────────────────────────────────────────────────────
// AIRE: loop:compliance-sweep

export interface UploadResult {
  documentId?: number;
  name: string;
  folderId: number;
}

/**
 * Upload a single PDF into a loop folder.
 * Dotloop v2:  POST /profile/{profileId}/loop/{loopId}/folder/{folderId}/document
 *              multipart/form-data with a `file` part.
 *
 * `content` is the raw file bytes (Buffer/Uint8Array) — when called from the
 * MCP connector the caller passes a base64 payload it decodes first.
 * Uses a 60s timeout (PDFs are multi-MB) instead of dotloopFetch's 15s, and
 * wraps in withRetry with the standard "dotloop" error type.
 */
export async function uploadDocument(
  loopId: string | number,
  folderId: string | number,
  content: Uint8Array,
  name: string,
): Promise<UploadResult> {
  const config = await getDotloopConfig();
  if (!config) throw new Error("Dotloop is not configured (missing DOTLOOP_ACCESS_TOKEN / DOTLOOP_PROFILE_ID).");

  const fileName = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;

  return withRetry(
    async () => {
      const form = new FormData();
      // Blob from the raw bytes; dotloop infers PDF from filename + content-type.
      form.append("file", new Blob([content as BlobPart], { type: "application/pdf" }), fileName);

      const res = await fetch(
        `${DOTLOOP_BASE}/profile/${config.profileId}/loop/${loopId}/folder/${folderId}/document`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: "application/json",
            // NOTE: do not set Content-Type — fetch sets the multipart boundary.
          },
          body: form,
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Dotloop upload ${res.status}: ${body.slice(0, 200) || res.statusText}`);
      }
      const data = (await res.json().catch(() => ({}))) as { data?: { id?: number } };
      return { documentId: data.data?.id, name: fileName, folderId: Number(folderId) };
    },
    { source: "dotloop.uploadDocument", type: "dotloop", context: { loopId, folderId, name: fileName } },
  );
}

// ─── Compliance reconciliation ───────────────────────────────────────────────
// AIRE: loop:compliance-sweep
//
// Required-document templates per transaction side, mirrored from the dotloop
// loop checklists. Each slot has match keywords (lowercased, OR-matched against
// document names) so we can detect whether a slot is filled. Keep in sync with
// ~/.claude/skills/transaction-compliance/references/dotloop-slots.md

export type LoopSide = "LISTING" | "PURCHASE";

interface RequiredSlot {
  slot: string;
  keywords: string[];
  optional?: boolean;
}

export const REQUIRED_DOCS: Record<LoopSide, RequiredSlot[]> = {
  LISTING: [
    { slot: "Listing Agreement", keywords: ["listing agreement"] },
    { slot: "Agency Disclosure", keywords: ["agency disclosure"] },
    { slot: "Waiver of Warranty", keywords: ["waiver of warranty", "waiver as is"], optional: true },
    { slot: "Lead-Based Paint Disclosure (LREC)", keywords: ["lead-based paint", "lead based paint", "lead paint"] },
    { slot: "2026 Property Disclosure", keywords: ["property disclosure", "2026 property disclosure"] },
    { slot: "Residential Sewerage Disclosure", keywords: ["sewerage", "residential sewerage"], optional: true },
    { slot: "MLS Copy", keywords: ["mls"], optional: true },
  ],
  PURCHASE: [
    { slot: "Residential Agreement to Buy or Sell", keywords: ["agreement to buy or sell", "purchase agreement", "buy or sell"] },
    { slot: "Property Disclosure", keywords: ["property disclosure"] },
    { slot: "Lead Paint Disclosure", keywords: ["lead-based paint", "lead based paint", "lead paint"] },
    { slot: "Lead Based Paint Pamphlet", keywords: ["pamphlet"] },
    { slot: "Inspections & Due Diligence", keywords: ["inspection", "due diligence"] },
    { slot: "Agency Disclosure", keywords: ["agency disclosure"] },
    { slot: "MLS Sheet", keywords: ["mls"] },
    { slot: "Copy of Deposit Check or Wire", keywords: ["deposit", "wire"] },
    { slot: "Executed BBA", keywords: ["bba", "buyer brokerage", "buyer's brokerage"] },
    { slot: "LRA General Addendum", keywords: ["general addendum", "lra"], optional: true },
    { slot: "Counteroffer", keywords: ["counter"], optional: true },
  ],
};

export const CLOSING_DOCS: RequiredSlot[] = [
  { slot: "Closing Information", keywords: ["closing information"] },
  { slot: "CD or HUD", keywords: ["closing disclosure", "cd or hud", "hud"] },
  { slot: "Copy of Commission Check", keywords: ["commission"] },
  { slot: "Signed Act of Sale / Cash Sale", keywords: ["act of sale", "cash sale"] },
  { slot: "Final Settlement Statement (ALTA)", keywords: ["settlement statement", "alta"] },
];

export interface ComplianceStatus {
  loopId: string;
  side: LoopSide;
  filed: { slot: string; documentName: string; signed: boolean }[];
  missing: string[];        // required slots with no matching document
  unexecuted: string[];     // matched but not signed (fails both-signature gate)
  optionalMissing: string[];
}

/**
 * Reconcile a loop's current documents against the required-doc template for
 * its side (plus closing docs). Returns filed / missing / unexecuted so callers
 * can decide what still needs uploading and what fails the both-signature gate.
 */
export async function getLoopComplianceStatus(
  loopId: string | number,
  side: LoopSide,
): Promise<ComplianceStatus | null> {
  const docs = await getLoopDocuments(loopId);
  if (docs === null) return null;

  const slots = [...REQUIRED_DOCS[side], ...CLOSING_DOCS];
  const filed: ComplianceStatus["filed"] = [];
  const missing: string[] = [];
  const unexecuted: string[] = [];
  const optionalMissing: string[] = [];

  for (const req of slots) {
    const match = docs.find((d) => {
      const lname = d.documentName.toLowerCase();
      return req.keywords.some((k) => lname.includes(k));
    });
    if (!match) {
      if (req.optional) optionalMissing.push(req.slot);
      else missing.push(req.slot);
      continue;
    }
    filed.push({ slot: req.slot, documentName: match.documentName, signed: match.signed });
    // Disclosures/agreements/closing docs must be signed to satisfy the gate.
    if (!match.signed) unexecuted.push(req.slot);
  }

  return { loopId: String(loopId), side, filed, missing, unexecuted, optionalMissing };
}

// ─── Lead matching ───────────────────────────────────────────────────────────

/**
 * Try to match a Dotloop loop to an existing AIRE Lead by participant info.
 * Priority order:
 *   1. Exact email match on any BUYER/SELLER participant
 *   2. Exact phone match (digits only)
 *   3. Fuzzy fullName match (last name + first letter of first name)
 * Returns the matched Lead's AIRE id, or null if no confident match.
 */
export async function matchLoopToLead(
  participants: LoopParticipant[],
): Promise<string | null> {
  const principals = participants.filter((p) =>
    /BUYER|SELLER/i.test(p.role ?? "") && !p.memberOfMyTeam,
  );
  if (principals.length === 0) return null;

  // 1. Exact email
  for (const p of principals) {
    if (!p.email) continue;
    const found = await prisma.lead.findFirst({
      where: { email: p.email.toLowerCase().trim() },
      select: { id: true },
    });
    if (found) return found.id;
  }

  // 2. Phone (last 10 digits)
  for (const p of principals) {
    if (!p.phone) continue;
    const digits = p.phone.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) continue;
    const found = await prisma.lead.findFirst({
      where: { phone: { contains: digits } },
      select: { id: true },
    });
    if (found) return found.id;
  }

  // 3. Fuzzy name (last name match + first-letter first name)
  for (const p of principals) {
    const last = (p.lastName ?? "").toLowerCase().trim();
    const firstInitial = (p.firstName ?? "").charAt(0).toLowerCase();
    if (!last || !firstInitial) continue;
    const found = await prisma.lead.findFirst({
      where: {
        lastName: { contains: last },
        firstName: { startsWith: firstInitial },
      },
      select: { id: true },
    });
    if (found) return found.id;
  }

  return null;
}

// ─── Status mapping ──────────────────────────────────────────────────────────

/**
 * Map Dotloop loop status to AIRE Lead stage. Lets us optionally auto-progress
 * a Lead's pipeline stage based on loop state.
 */
export const LOOP_STATUS_TO_STAGE: Record<string, string> = {
  PRE_OFFER: "active",
  UNDER_CONTRACT: "under_contract",
  PENDING: "under_contract",
  WITHDRAWN: "new_lead",
  TERMINATED: "new_lead",
  SOLD: "closed",
  CLOSED: "closed",
  LEASED: "closed",
};

// ─── Sync-freshness helpers ──────────────────────────────────────────────────
// AIRE: loop:dotloop-sync-freshness

export interface DotloopLoopDetail extends DotloopLoop {
  milestones?: { name: string; date?: string; completed?: boolean }[];
  lastActivityDate?: string;
}

/**
 * Fetch a single loop by Dotloop ID using the stored access token.
 * On 401 sets Setting["dotloop.authStatus"] = "expired" so callers can skip
 * further API calls rather than hammering an expired token.
 * Returns null if Dotloop credentials are not configured.
 */
export async function getLoopDetails(loopId: string): Promise<DotloopLoopDetail | null> {
  // AIRE: loop:dotloop-sync-freshness
  const config = await getDotloopConfig();
  if (!config) return null;

  try {
    return await withRetry(
      () => fetchLoopDetails(config, loopId) as Promise<DotloopLoopDetail>,
      { source: "dotloop.getLoopDetails", type: "dotloop", context: { loopId } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401")) {
      await prisma.setting.upsert({
        where: { key: "dotloop.authStatus" },
        update: { value: "expired" },
        create: { key: "dotloop.authStatus", value: "expired" },
      }).catch(() => null);
    }
    throw err;
  }
}
