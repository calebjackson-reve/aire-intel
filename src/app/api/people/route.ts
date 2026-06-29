export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findDuplicates } from "@/lib/social-match";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dedup = searchParams.get("dedup") === "1";

  const [leads, socials] = await Promise.all([
    prisma.lead.findMany({
      select: {
        id: true, name: true, firstName: true, lastName: true,
        phone: true, email: true, stage: true, type: true,
        instagramHandle: true, facebookUrl: true, facebookName: true,
        linkedinUrl: true, tiktokHandle: true, preferredPlatform: true,
        lastContactDate: true,
      },
    }),
    prisma.socialPerson.findMany({
      where: { matchedLeadId: null },
    }),
  ]);

  const people = [
    ...leads.map((l) => ({
      id: l.id,
      source: "lead" as const,
      name: l.name,
      firstName: l.firstName,
      lastName: l.lastName,
      phone: l.phone,
      email: l.email,
      stage: l.stage,
      type: l.type,
      instagramHandle: l.instagramHandle,
      facebookUrl: l.facebookUrl,
      linkedinUrl: l.linkedinUrl,
      preferredPlatform: l.preferredPlatform,
      lastContactDate: l.lastContactDate?.toISOString() ?? null,
    })),
    ...socials.map((s) => ({
      id: s.id,
      source: s.source as "facebook" | "instagram" | "contacts",
      name: s.name,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      email: s.email,
      stage: null,
      type: null,
      instagramHandle: s.instagramHandle,
      facebookUrl: s.facebookUrl,
      linkedinUrl: null,
      preferredPlatform: null,
      lastContactDate: null,
    })),
  ];

  // Dedup is opt-in (?dedup=1) — it's O(n²) so we don't block the page load
  const duplicates = dedup
    ? findDuplicates(people).slice(0, 100).map((d) => ({
        a: { id: d.a.id, name: d.a.name, source: d.a.source },
        b: { id: d.b.id, name: d.b.name, source: d.b.source },
        score: d.score,
        reason: d.reason,
      }))
    : [];

  return NextResponse.json({
    total: people.length,
    leads: leads.length,
    imported: socials.length,
    people,
    duplicates,
  });
}
