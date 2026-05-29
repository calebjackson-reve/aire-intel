import { prisma } from "./prisma";
import { refreshGoogleToken } from "./google";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

async function getValidToken(): Promise<string | null> {
  const [accessRow, refreshRow, expiryRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_ACCESS_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_TOKEN_EXPIRY" } }),
  ]);

  if (!refreshRow?.value) return null;

  const expiry = expiryRow ? parseInt(expiryRow.value) : 0;
  if (Date.now() < expiry - 60_000 && accessRow?.value) return accessRow.value;

  const [clientId, clientSecret] = await Promise.all([
    getSetting("GOOGLE_CLIENT_ID"),
    getSetting("GOOGLE_CLIENT_SECRET"),
  ]);
  if (!clientId || !clientSecret) return null;

  try {
    const tokens = await refreshGoogleToken(refreshRow.value, clientId, clientSecret);
    const newExpiry = Date.now() + tokens.expires_in * 1000;
    await Promise.all([
      prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
      prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(newExpiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(newExpiry) } }),
    ]);
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function fetchUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  const token = await getValidToken();
  if (!token) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "20",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
  );

  if (!res.ok) return [];

  const data = await res.json() as { items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; description?: string }[] };

  return (data.items ?? []).map(e => ({
    id: e.id,
    title: e.summary ?? "Untitled",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
    description: e.description,
    allDay: !e.start?.dateTime,
  }));
}
