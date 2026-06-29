export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description");

  if (error || !code) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#f5f0ea">
        <h2 style="color:#EE8172">Facebook connection failed</h2>
        <p>${error ?? "No code returned"}</p>
        <a href="/settings">← Back to Settings</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/facebook/callback`;

  try {
    // 1. Exchange code → short-lived user token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? "No access_token");

    // 2. Exchange short-lived → long-lived user token
    const llUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", appId);
    llUrl.searchParams.set("client_secret", appSecret);
    llUrl.searchParams.set("fb_exchange_token", tokenData.access_token);
    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json() as { access_token?: string; error?: { message: string } };
    if (!llData.access_token) throw new Error(llData.error?.message ?? "Long-lived exchange failed");

    // 3. Get all page access tokens for this user
    const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
    pagesUrl.searchParams.set("access_token", llData.access_token);
    pagesUrl.searchParams.set("fields", "id,name,access_token,category");
    const pagesRes = await fetch(pagesUrl.toString());
    const pagesData = await pagesRes.json() as {
      data?: { id: string; name: string; access_token: string; category: string }[];
      error?: { message: string };
    };
    if (!pagesData.data?.length) throw new Error("No pages found for this account");

    const pageId = process.env.META_PAGE_ID;
    const targetPage = pageId
      ? pagesData.data.find(p => p.id === pageId) ?? pagesData.data[0]
      : pagesData.data[0];

    // 4. Update .env file with new token
    const envPath = join(process.cwd(), ".env");
    let envContent = await readFile(envPath, "utf-8");

    const updateVar = (content: string, key: string, val: string) => {
      const regex = new RegExp(`^(${key}=).*$`, "m");
      return regex.test(content)
        ? content.replace(regex, `$1${val}`)
        : `${content}\n${key}=${val}`;
    };

    envContent = updateVar(envContent, "META_PAGE_ACCESS_TOKEN", targetPage.access_token);
    envContent = updateVar(envContent, "META_PAGE_ID", targetPage.id);
    await writeFile(envPath, envContent, "utf-8");

    const pageList = pagesData.data.map(p => `<li>${p.name} (${p.id}) — ${p.category}</li>`).join("");

    return new Response(
      `<html><head><meta http-equiv="refresh" content="4;url=/messenger-outreach"></head>
      <body style="font-family:-apple-system,sans-serif;padding:48px;background:#f5f0ea;color:#111827">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <p style="font-size:11px;letter-spacing:0.1em;color:#EE8172;font-weight:700;text-transform:uppercase;margin:0 0 12px">Connected ✓</p>
          <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Token saved for ${targetPage.name}</h2>
          <p style="font-size:13px;color:#6B7280;margin:0 0 20px">Long-lived page access token written to .env. Redirecting to Messenger Outreach in 4 seconds…</p>
          <p style="font-size:11px;color:#9CA3AF;margin:0 0 8px">Pages on this account:</p>
          <ul style="font-size:12px;color:#374151;padding-left:18px;margin:0">${pageList}</ul>
          <a href="/messenger-outreach" style="display:inline-block;margin-top:24px;padding:10px 20px;background:#EE8172;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700">Go to Messenger Outreach →</a>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#f5f0ea">
        <h2 style="color:#EE8172">Token exchange failed</h2>
        <pre style="background:#fff;padding:16px;border-radius:8px;font-size:12px">${String(err)}</pre>
        <a href="/settings">← Back to Settings</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
