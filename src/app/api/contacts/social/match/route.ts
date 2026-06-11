export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseFacebookJson,
  parseFacebookHtml,
  crossReference,
} from "@/lib/social-match";

/**
 * Facebook friends upload + cross-reference.
 *
 * POST { content: string, format: "json" | "html" }
 *   Parses Caleb's Facebook "Download Your Information" friends file,
 *   fuzzy-matches names against existing leads, returns ranked candidates.
 *   Does NOT write anything — Caleb confirms matches in the UI.
 *
 * PATCH { leadId: string, facebookUrl?: string, facebookName?: string, instagramHandle?: string }
 *   Persist a confirmed match (or any social handle update).
 */

export async function POST(request: NextRequest) {
  const { content, format } = await request.json();
  if (!content || typeof content !== "string") {
    return Response.json({ error: "No content uploaded" }, { status: 400 });
  }

  const friends =
    format === "html" || /<html|<a\s/i.test(content)
      ? parseFacebookHtml(content)
      : parseFacebookJson(content);

  if (friends.length === 0) {
    return Response.json(
      {
        error: "Couldn't parse any friends from that file. Make sure you uploaded the friends.json or friends.html from Facebook's Download Your Information export.",
      },
      { status: 400 },
    );
  }

  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, email: true, firstName: true, lastName: true, facebookUrl: true },
  });

  const { matches, unmatchedCount } = crossReference(friends, leads);

  // Filter out leads that already have a Facebook URL set (no point re-suggesting)
  const alreadyLinkedIds = new Set(leads.filter((l) => l.facebookUrl).map((l) => l.id));
  const newMatches = matches.filter((m) => !alreadyLinkedIds.has(m.leadId));

  return Response.json({
    totalFriendsParsed: friends.length,
    matchesFound: newMatches.length,
    alreadyLinked: matches.length - newMatches.length,
    unmatchedCount,
    matches: newMatches,
  });
}

export async function PATCH(request: NextRequest) {
  const { leadId, facebookUrl, facebookName, instagramHandle, linkedinUrl, tiktokHandle, twitterHandle } = await request.json();
  if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(facebookUrl !== undefined && { facebookUrl }),
      ...(facebookName !== undefined && { facebookName }),
      ...(instagramHandle !== undefined && { instagramHandle }),
      ...(linkedinUrl !== undefined && { linkedinUrl }),
      ...(tiktokHandle !== undefined && { tiktokHandle }),
      ...(twitterHandle !== undefined && { twitterHandle }),
    },
    select: {
      id: true,
      name: true,
      facebookUrl: true,
      instagramHandle: true,
      linkedinUrl: true,
      tiktokHandle: true,
      twitterHandle: true,
    },
  });

  return Response.json({ ok: true, lead: updated });
}
