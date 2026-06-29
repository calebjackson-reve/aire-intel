export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) return Response.json({ error: "META_APP_ID not set" }, { status: 500 });

  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/facebook/callback`;

  const scopes = [
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_messaging",
    "pages_show_list",
    "pages_read_user_content",
    "business_management",
  ].join(",");

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", "aire_fb_connect");

  return Response.redirect(url.toString());
}
