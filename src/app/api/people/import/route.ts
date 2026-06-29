export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseFacebookJson, parseFacebookHtml,
  parseInstagramJson, parseVCard,
  crossReference,
} from "@/lib/social-match";

/**
 * POST /api/people/import
 * body: { content: string, format: "facebook_json"|"facebook_html"|"instagram_json"|"vcf" }
 *
 * Parses the file, upserts into SocialPerson, runs fuzzy match against existing
 * leads, and returns match candidates for confirmation.
 */
export async function POST(req: NextRequest) {
  const { content, format } = await req.json() as { content: string; format: string };

  if (!content || !format) {
    return NextResponse.json({ error: "content and format required" }, { status: 400 });
  }

  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, email: true, firstName: true, lastName: true, facebookUrl: true, instagramHandle: true },
  });

  let inserted = 0;
  const matchCandidates: unknown[] = [];

  if (format === "facebook_json" || format === "facebook_html") {
    const friends = format === "facebook_html" ? parseFacebookHtml(content) : parseFacebookJson(content);
    if (!friends.length) return NextResponse.json({ error: "No friends parsed from file." }, { status: 400 });

    for (const f of friends) {
      try {
        await prisma.socialPerson.upsert({
          where: { source_externalId: { source: "facebook", externalId: f.url ?? f.name } },
          create: { source: "facebook", externalId: f.url ?? f.name, name: f.name, facebookUrl: f.url, facebookName: f.name },
          update: { facebookUrl: f.url },
        });
        inserted++;
      } catch { /* concurrent dup — skip */ }
    }

    const alreadyLinked = new Set(leads.filter((l) => l.facebookUrl).map((l) => l.id));
    const { matches } = crossReference(friends, leads);
    matchCandidates.push(...matches.filter((m) => !alreadyLinked.has(m.leadId)));

    return NextResponse.json({ source: "facebook", parsed: friends.length, inserted, matches: matchCandidates });
  }

  if (format === "instagram_json") {
    const igPeople = parseInstagramJson(content);
    if (!igPeople.length) return NextResponse.json({ error: "No Instagram users parsed." }, { status: 400 });

    // Upsert by handle
    for (const p of igPeople) {
      if (!p.handle) continue;
      try {
        await prisma.socialPerson.upsert({
          where: { source_externalId: { source: "instagram", externalId: p.handle } },
          create: { source: "instagram", externalId: p.handle, name: p.name ?? p.handle, instagramHandle: p.handle },
          update: { name: p.name ?? p.handle },
        });
        inserted++;
      } catch { /* dup */ }
    }

    // Match IG handles against Lead.instagramHandle
    const alreadyLinked = new Set(leads.filter((l) => l.instagramHandle).map((l) => l.id));
    const igMatches = igPeople.flatMap((p) => {
      const lead = leads.find((l) => l.instagramHandle?.replace(/^@/, "") === p.handle.replace(/^@/, ""));
      if (!lead || alreadyLinked.has(lead.id)) return [];
      return [{ handle: p.handle, leadId: lead.id, leadName: lead.name, score: 1.0, reason: "handle match" }];
    });

    return NextResponse.json({ source: "instagram", parsed: igPeople.length, inserted, matches: igMatches });
  }

  if (format === "vcf") {
    const contacts = parseVCard(content);
    if (!contacts.length) return NextResponse.json({ error: "No contacts parsed from vCard." }, { status: 400 });

    for (const c of contacts) {
      try {
        await prisma.socialPerson.upsert({
          where: { source_externalId: { source: "contacts", externalId: c.uid ?? `${c.name}::${c.phone ?? c.email ?? ""}` } },
          create: { source: "contacts", externalId: c.uid ?? `${c.name}::${c.phone ?? c.email ?? ""}`, name: c.name, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone },
          update: { email: c.email, phone: c.phone },
        });
        inserted++;
      } catch { /* dup */ }
    }

    // Cross-reference by name (same engine as FB)
    const { matches } = crossReference(
      contacts.map((c) => ({ name: c.name })),
      leads,
    );
    return NextResponse.json({ source: "contacts", parsed: contacts.length, inserted, matches });
  }

  return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
}
