import { NextRequest } from "next/server";
import { exchangeGoogleCode } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return Response.redirect(`${origin}/settings?google=denied`);
  }

  const [idRow, secretRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } }),
  ]);
  const clientId = idRow?.value || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = secretRow?.value || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${origin}/settings?google=no_creds`);
  }
  const creds = { clientId, clientSecret };

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokens = await exchangeGoogleCode(code, creds.clientId, creds.clientSecret, redirectUri);
    const expiry = Date.now() + tokens.expires_in * 1000;

    const saves = [
      prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
      prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(expiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(expiry) } }),
    ];

    if (tokens.refresh_token) {
      saves.push(prisma.setting.upsert({ where: { key: "GOOGLE_REFRESH_TOKEN" }, update: { value: tokens.refresh_token }, create: { key: "GOOGLE_REFRESH_TOKEN", value: tokens.refresh_token } }));
    }

    await Promise.all(saves);
    return Response.redirect(`${origin}/settings?google=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Google OAuth]", msg);
    return Response.redirect(`${origin}/settings?google=error`);
  }
}
