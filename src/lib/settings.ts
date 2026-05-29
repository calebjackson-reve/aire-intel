import { prisma } from "./prisma";

const _cache: Record<string, string> = {};

export async function getSetting(key: string): Promise<string | null> {
  if (_cache[key]) return _cache[key];

  // DB first, then env var
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  const value = row?.value || process.env[key] || null;

  if (value) _cache[key] = value;
  return value;
}

/** Wipes the in-memory settings cache. Call after a settings.upsert(). */
export function invalidateSettingsCache(keys?: string[]) {
  if (!keys) {
    for (const k of Object.keys(_cache)) delete _cache[k];
    return;
  }
  for (const k of keys) delete _cache[k];
}

export async function getParagonConfig() {
  const [url, key] = await Promise.all([
    getSetting("PARAGON_API_URL"),
    getSetting("PARAGON_API_KEY"),
  ]);
  if (!url || !key) return null;
  return { url, key };
}

export async function getMetaConfig() {
  const [token, pageId, igId] = await Promise.all([
    getSetting("META_PAGE_ACCESS_TOKEN"),
    getSetting("META_PAGE_ID"),
    getSetting("META_IG_BUSINESS_ID"),
  ]);
  if (!token || !pageId) return null;
  return { token, pageId, igId };
}

/**
 * Caleb's solo-agent team — Transaction Coordinator + Showing Assistant.
 * These are the only two people he routes work to.
 * If either is unset, the handoff UI prompts to configure in /settings.
 */
export async function getTeamConfig() {
  const [tcName, tcEmail, tcPhone, saName, saEmail, saPhone] = await Promise.all([
    getSetting("TC_NAME"),
    getSetting("TC_EMAIL"),
    getSetting("TC_PHONE"),
    getSetting("SHOWING_ASSISTANT_NAME"),
    getSetting("SHOWING_ASSISTANT_EMAIL"),
    getSetting("SHOWING_ASSISTANT_PHONE"),
  ]);
  return {
    tc: {
      name: tcName ?? null,
      email: tcEmail ?? null,
      phone: tcPhone ?? null,
      configured: !!(tcName && (tcEmail || tcPhone)),
    },
    showingAssistant: {
      name: saName ?? null,
      email: saEmail ?? null,
      phone: saPhone ?? null,
      configured: !!(saName && (saEmail || saPhone)),
    },
  };
}
