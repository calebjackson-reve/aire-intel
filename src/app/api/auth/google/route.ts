export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  // Check DB first, then env
  const [idRow, secretRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } }),
  ]);

  const clientId = idRow?.value || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = secretRow?.value || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set. Add them in Settings." }, { status: 503 });
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const url = getGoogleAuthUrl(clientId, redirectUri);

  return Response.redirect(url);
}
