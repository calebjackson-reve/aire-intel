import { prisma } from "./prisma";
import { withRetry } from "./error-memory";

/**
 * Dotloop v2 API integration.
 *
 * API root:   https://api-gateway.dotloop.com/public/v2
 * Auth:       Bearer token (Personal Access Token from dotloop.com → Account → Integrations)
 *
 * For Rêve Realtors users: API access may require the broker admin to enable
 * "API access" on your profile in Dotloop's admin console. If you get a 401
 * with "no developer access" in the message, that's why.
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

// ─── Settings glue ───────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

export interface DotloopConfig {
  accessToken: string;
  profileId: string;
}

export async function getDotloopConfig(): Promise<DotloopConfig | null> {
  const [accessToken, profileId] = await Promise.all([
    getSetting("DOTLOOP_ACCESS_TOKEN"),
    getSetting("DOTLOOP_PROFILE_ID"),
  ]);
  if (!accessToken || !profileId) return null;
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
