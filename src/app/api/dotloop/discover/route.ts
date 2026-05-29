import { NextRequest } from "next/server";
import { fetchProfiles } from "@/lib/dotloop";

/**
 * POST /api/dotloop/discover
 *
 * Given an access token (not yet saved), hit Dotloop /profile to list the
 * user's profiles. Used during onboarding so Caleb doesn't have to dig
 * through Dotloop's UI to find his numeric Profile ID — just paste the token
 * and click DISCOVER PROFILE.
 *
 * Body: { accessToken: string }
 * Returns: { ok: true, profiles: [{ id, type, name, default }] }
 *       or { ok: false, error: string }
 */
export async function POST(req: NextRequest) {
  const { accessToken } = await req.json() as { accessToken?: string };
  if (!accessToken) {
    return Response.json({ ok: false, error: "accessToken required" }, { status: 400 });
  }

  try {
    const profiles = await fetchProfiles(accessToken);
    if (profiles.length === 0) {
      return Response.json({
        ok: false,
        error: "Token authenticated but no profiles returned. Ask Rêve broker admin to enable API access on your profile.",
      }, { status: 200 });
    }
    return Response.json({ ok: true, profiles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}
