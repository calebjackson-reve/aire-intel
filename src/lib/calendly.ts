import { prisma } from "./prisma";

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

let _cachedLink: { url: string; expiresAt: number } | null = null;

export async function getCalendlyConfig(): Promise<{ apiKey: string } | null> {
  const apiKey = await getSetting("CALENDLY_API_KEY");
  if (!apiKey) return null;
  return { apiKey };
}

export async function getCalendlyLink(): Promise<string | null> {
  if (_cachedLink && _cachedLink.expiresAt > Date.now()) return _cachedLink.url;

  const config = await getCalendlyConfig();
  if (!config) return null;

  const res = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return null;
  const data = await res.json() as { resource?: { scheduling_url?: string } };
  const url = data.resource?.scheduling_url ?? null;
  if (url) _cachedLink = { url, expiresAt: Date.now() + 3_600_000 };
  return url;
}
