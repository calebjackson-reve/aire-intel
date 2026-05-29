import { prisma } from "./prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PEOPLE_URL = "https://people.googleapis.com/v1/people/me/connections";
const SCOPES = "https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/calendar.readonly";

export function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGoogleAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getValidGoogleToken(): Promise<string | null> {
  const [accessRow, refreshRow, expiryRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_ACCESS_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_TOKEN_EXPIRY" } }),
  ]);

  if (!refreshRow?.value) return null;

  const expiry = expiryRow ? parseInt(expiryRow.value) : 0;
  const needsRefresh = Date.now() > expiry - 60_000;

  if (!needsRefresh && accessRow?.value) return accessRow.value;

  const creds = getGoogleCredentials();
  if (!creds) return null;

  const tokens = await refreshGoogleToken(refreshRow.value, creds.clientId, creds.clientSecret);
  const newExpiry = Date.now() + tokens.expires_in * 1000;

  await Promise.all([
    prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
    prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(newExpiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(newExpiry) } }),
  ]);

  return tokens.access_token;
}

export interface GoogleContact {
  resourceName: string;
  names?: { displayName: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string; canonicalForm?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { formattedValue?: string }[];
}

export async function fetchAllGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const all: GoogleContact[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,addresses",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GOOGLE_PEOPLE_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Google People API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { connections?: GoogleContact[]; nextPageToken?: string };
    all.push(...(data.connections ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function mapGoogleContact(c: GoogleContact) {
  const name = c.names?.[0];
  const email = c.emailAddresses?.[0]?.value?.toLowerCase().trim();
  const rawPhone = c.phoneNumbers?.[0]?.canonicalForm ?? c.phoneNumbers?.[0]?.value ?? "";
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  const org = c.organizations?.[0];

  return {
    name: name?.displayName || "Unknown",
    firstName: name?.givenName || undefined,
    lastName: name?.familyName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    source: "Google Contacts",
    notes: org?.name ? `${org.name}${org.title ? ` — ${org.title}` : ""}` : undefined,
  };
}
