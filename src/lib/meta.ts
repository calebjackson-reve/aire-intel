import { getMetaConfig } from "./settings";
import { withRetry, logError } from "./error-memory";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export interface MetaPostResult {
  id: string;
  platform: "facebook" | "instagram";
}

// TODO: Instagram requires a publicly accessible image URL (no local/localhost URLs).
//       In dev, images generated locally will need to be uploaded to storage first.
export async function publishToFacebook(message: string, imageUrl?: string): Promise<MetaPostResult> {
  const config = await getMetaConfig();
  if (!config) throw new Error("Meta credentials not configured");

  return withRetry(async () => {
    const body: Record<string, string> = {
      message,
      access_token: config.token,
    };
    if (imageUrl) body.link = imageUrl;

    const res = await fetch(`${GRAPH_BASE}/${config.pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Meta Graph API error ${res.status}: ${err.error?.message ?? res.statusText}`);
    }

    const data = await res.json() as { id: string };
    return { id: data.id, platform: "facebook" };
  }, { source: "meta/publishToFacebook", type: "meta" });
}

// Instagram publish is two steps: create container → publish container.
// TODO: imageUrl must be a public HTTPS URL. Local dev requires ngrok or a deployed URL.
export async function publishToInstagram(caption: string, imageUrl: string): Promise<MetaPostResult> {
  const config = await getMetaConfig();
  if (!config || !config.igId) throw new Error("Instagram Business ID not configured");

  return withRetry(async () => {
    // Step 1: Create media container

    const containerRes = await fetch(`${GRAPH_BASE}/${config.igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: config.token }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!containerRes.ok) {
      const err = await containerRes.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`IG container error ${containerRes.status}: ${err.error?.message ?? containerRes.statusText}`);
    }

    const container = await containerRes.json() as { id: string };

    // Step 2: Publish the container
    const publishRes = await fetch(`${GRAPH_BASE}/${config.igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: config.token }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!publishRes.ok) {
      const err = await publishRes.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`IG publish error ${publishRes.status}: ${err.error?.message ?? publishRes.statusText}`);
    }

    const data = await publishRes.json() as { id: string };
    return { id: data.id, platform: "instagram" };
  }, { source: "meta/publishToInstagram", type: "meta" });
}

// AIRE: loop:meta-token-refresh-alert
export async function checkTokenExpiry(): Promise<{ daysRemaining: number; expiresAt: Date | null }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!token || !appId || !appSecret) {
    await logError("meta", "meta/checkTokenExpiry", new Error("Missing META env vars for token expiry check"), {});
    return { daysRemaining: 999, expiresAt: null };
  }

  try {
    const result = await withRetry(async () => {
      const appToken = `${appId}|${appSecret}`;
      const url = `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(`Meta debug_token ${res.status}: ${errBody.error?.message ?? res.statusText}`);
      }
      return res.json() as Promise<{ data: { expires_at?: number; is_valid?: boolean } }>;
    }, { source: "meta/checkTokenExpiry", type: "meta" });

    const expiresAt = result.data.expires_at ? new Date(result.data.expires_at * 1000) : null;
    if (!expiresAt) return { daysRemaining: 999, expiresAt: null };

    const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { daysRemaining, expiresAt };
  } catch {
    // withRetry already logged; fail-open so the agent continues
    return { daysRemaining: 999, expiresAt: null };
  }
}
