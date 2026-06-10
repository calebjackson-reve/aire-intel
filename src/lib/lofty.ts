import { withRetry } from "./error-memory";

const LOFTY_BASE = "https://api.lofty.com";
const LOFTY_TOKEN_URL = "https://api.lofty.com/oauth/token";

// In-memory token cache (per process — fine for a single-user app)
let _cachedToken: { accessToken: string; expiresAt: number } | null = null;

export interface LoftyCredentials {
  clientId: string;
  clientSecret: string;
  customerKey: string;
}

export function getLoftyCredentials(): LoftyCredentials | null {
  const clientId = process.env.LOFTY_CLIENT_ID?.trim();
  const clientSecret = process.env.LOFTY_CLIENT_SECRET?.trim();
  // Support both LOFTY_CUSTOMER_KEY and legacy LOFTY_API_KEY
  const customerKey = (process.env.LOFTY_CUSTOMER_KEY ?? process.env.LOFTY_API_KEY)?.trim();

  if (!clientId || !clientSecret || !customerKey) return null;
  return { clientId, clientSecret, customerKey };
}

export async function getLoftyAccessToken(creds: LoftyCredentials): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.accessToken;
  }

  const res = await fetch(LOFTY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      customer_key: creds.customerKey,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Lofty OAuth failed (${res.status}): ${text || res.statusText}\n\n` +
      "Make sure LOFTY_CLIENT_ID and LOFTY_CLIENT_SECRET are set — these come from your " +
      "Lofty developer app, not your CRM settings. LOFTY_CUSTOMER_KEY is your API key from " +
      "CRM Settings → Integrations → API."
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = data.expires_in ?? 3600;
  _cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return data.access_token;
}

function loftyHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Exact response shape from GET /v1.0/leads
export interface LoftyLead {
  leadId: number;
  leadUserId?: number;
  firstName?: string;
  lastName?: string;
  birthday?: string;
  emails?: string[];
  phones?: string[];
  source?: string;
  leadSource?: number;
  stageId?: number;
  stage?: string;
  assignedUserId?: number;
  assignedUser?: string;
  score?: number;
  tags?: { tagId: number; tagName: string; createTime: string }[];
  teamId?: number;
  createTime?: string;
  lastUpdateTime?: string;
  lastTouch?: string;
  lastVisit?: string;
  referredBy?: string;
  hiddenFlag?: boolean;
  segments?: string[];
  buyingTimeFrame?: string;
  preQual?: string;
  leadInquiry?: {
    priceMin?: number;
    priceMax?: number;
    propertyType?: string[];
    bedroomsMin?: number;
    bathroomsMin?: string;
    locations?: { city?: string; stateCode?: string; zipCode?: string }[];
  };
  leadPropertyList?: {
    price?: number;
    state?: string;
    city?: string;
    streetAddress?: string;
    zipCode?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFeet?: number;
  }[];
  customAttributes?: { attributeName: string; attributeType: string; value: string }[];
  cannotText?: boolean;
  cannotCall?: boolean;
  cannotEmail?: boolean;
}

export interface LoftyResponse {
  _metadata: {
    collection: string;
    limit: number;
    offset: number;
    total: number;
    scrollId?: string;
  };
  leads: LoftyLead[];
}

export async function fetchLoftyPage(
  credsOrToken: LoftyCredentials | string,
  offset = 0,
  limit = 100
): Promise<LoftyResponse> {
  const token =
    typeof credsOrToken === "string"
      ? credsOrToken
      : await getLoftyAccessToken(credsOrToken);

  const url = `${LOFTY_BASE}/v1.0/leads?offset=${offset}&limit=${limit}&sort=CreateTime&desc=false`;
  const res = await fetch(url, {
    headers: loftyHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        "Lofty returned 401 Unauthorized. Your access token may have expired or your credentials are wrong. " +
        "Check LOFTY_CLIENT_ID, LOFTY_CLIENT_SECRET, and LOFTY_CUSTOMER_KEY in your .env."
      );
    }
    throw new Error(`Lofty API error ${res.status}: ${text || res.statusText}`);
  }

  return res.json() as Promise<LoftyResponse>;
}

/**
 * Lofty returns timestamps in non-standard format "2026-04-30T17:33:32GMT"
 * (the trailing "GMT" makes the Date constructor return Invalid Date).
 * This helper rewrites "GMT" to "Z" and returns null on unparseable input.
 */
export function parseLoftyDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const normalized = s.replace(/GMT$/i, "Z");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface LoftyNote {
  id: number;
  noteId: number;
  creatorId: number;
  leadId: number;
  createTime: string;
  deleteFlag: boolean;
  content: string;
}

export async function fetchLoftyNotes(
  token: string,
  loftyLeadId: string | number,
  limit = 50,
): Promise<LoftyNote[]> {
  const url = `${LOFTY_BASE}/v1.0/notes?leadId=${loftyLeadId}&limit=${limit}`;
  const res = await fetch(url, {
    headers: loftyHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Lofty notes error ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = await res.json() as { notes?: LoftyNote[] };
  return (data.notes ?? []).filter((n) => !n.deleteFlag);
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface LoftyTask {
  id: number;
  leadId: number;
  creatorId: number;
  content: string;
  type: string; // "Call" | "Email" | "Meeting" | "ToDo" | ...
  deadline?: string;
  finishTime?: string;
  description?: string;
}

export async function fetchLoftyTasks(
  token: string,
  loftyLeadId: string | number,
  limit = 50,
): Promise<LoftyTask[]> {
  const url = `${LOFTY_BASE}/v1.0/tasks?leadId=${loftyLeadId}&limit=${limit}`;
  const res = await fetch(url, {
    headers: loftyHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Lofty tasks error ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = await res.json() as { taskList?: LoftyTask[] };
  return data.taskList ?? [];
}

/**
 * Map a Lofty note to an AIRE ContactLog row.
 * Lofty's "notes" are activity logs (call summaries, scripted responses, etc.)
 * so we land them as ContactLog entries with method="note".
 */
export function mapLoftyNoteToContactLog(note: LoftyNote, aireLeadId: string) {
  const createdAt = parseLoftyDate(note.createTime) ?? new Date();
  return {
    leadId: aireLeadId,
    method: "note",
    note: note.content,
    direction: "inbound" as const, // Default — most Lofty notes are inbound captures
    createdAt,
  };
}

/**
 * Map a Lofty task to an AIRE Task row.
 * Type → priority heuristic: Call/Meeting = high, Email/ToDo = normal.
 */
export function mapLoftyTaskToAire(task: LoftyTask, aireLeadId: string) {
  const isHigh = /call|meeting|showing/i.test(task.type);
  return {
    leadId: aireLeadId,
    title: task.content || task.type,
    description: task.description || null,
    dueDate: parseLoftyDate(task.deadline),
    priority: isHigh ? "high" : "normal",
    done: !!task.finishTime,
    doneAt: parseLoftyDate(task.finishTime),
  };
}

export async function fetchAllLoftyLeads(creds: LoftyCredentials): Promise<LoftyLead[]> {
  const token = await getLoftyAccessToken(creds);
  const all: LoftyLead[] = [];
  const limit = 100;

  const first = await fetchLoftyPage(token, 0, limit);
  all.push(...first.leads);
  const total = first._metadata?.total ?? first.leads.length;

  let offset = limit;
  while (offset < total) {
    const page = await fetchLoftyPage(token, offset, limit);
    if (page.leads.length === 0) break;
    all.push(...page.leads);
    offset += limit;
  }

  return all;
}

const STAGE_MAP: Record<string, string> = {
  new: "new_lead",
  "new lead": "new_lead",
  active: "active",
  "active buyer": "active",
  "active seller": "active",
  showing: "showing",
  "under contract": "under_contract",
  contract: "under_contract",
  closed: "closed",
  "past client": "closed",
  nurture: "new_lead",
  hot: "active",
  warm: "active",
  cold: "new_lead",
  prospect: "new_lead",
  database: "new_lead",
  sphere: "new_lead",
};

export function mapLoftyLeadToAire(l: LoftyLead) {
  const firstName = l.firstName ?? "";
  const lastName = l.lastName ?? "";
  const name = `${firstName} ${lastName}`.trim() || "Unknown";
  const stage = STAGE_MAP[(l.stage ?? "").toLowerCase()] ?? "new_lead";

  const email = l.emails?.[0] || undefined;
  const phone = l.phones?.[0] || undefined;
  const tags = l.tags?.map(t => t.tagName).join(", ") || undefined;

  const areas = l.leadInquiry?.locations
    ?.map(loc => [loc.city, loc.stateCode].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ") || undefined;

  return {
    name,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email,
    phone,
    stage,
    source: l.source || undefined,
    tags,
    assignedTo: l.assignedUser || undefined,
    priceMin: l.leadInquiry?.priceMin ?? undefined,
    priceMax: l.leadInquiry?.priceMax ?? undefined,
    beds: l.leadInquiry?.bedroomsMin ?? undefined,
    areas,
    loftyId: String(l.leadId),
    lastContactDate: parseLoftyDate(l.lastTouch) ?? undefined,
    referredBy: l.referredBy || undefined,
  };
}

// AIRE: loop:lofty-sync-health
export async function checkLoftyHealth(): Promise<{
  status: "ok" | "auth_expired" | "unreachable";
  message: string;
  responseMs: number;
}> {
  const creds = getLoftyCredentials();
  if (!creds) {
    return { status: "auth_expired", message: "Lofty credentials not configured", responseMs: 0 };
  }

  const start = Date.now();
  try {
    await withRetry(
      async () => {
        const token = await getLoftyAccessToken(creds);
        const res = await fetch(`${LOFTY_BASE}/v1.0/leads?limit=1&sort=lastUpdateTime&desc=true`, {
          headers: loftyHeaders(token),
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw Object.assign(
            new Error(`Lofty ${res.status}: ${text || res.statusText}`),
            { httpStatus: res.status },
          );
        }
      },
      { maxAttempts: 2, source: "lofty-health", type: "lofty" },
    );
    return { status: "ok", message: "Lofty API reachable", responseMs: Date.now() - start };
  } catch (err) {
    const responseMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { httpStatus?: number }).httpStatus === 401 || msg.includes("401")) {
      _cachedToken = null;
      return { status: "auth_expired", message: "Lofty token expired — re-authenticate", responseMs };
    }
    return { status: "unreachable", message: msg, responseMs };
  }
}
