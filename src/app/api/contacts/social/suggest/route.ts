export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

/**
 * AI-driven Instagram / social handle guesser.
 *
 * Given a contact's name, email, and location, AI proposes 2-4 likely
 * Instagram handles. These are GUESSES — Caleb must confirm each one in the UI
 * before they're saved. We never auto-link.
 *
 * The goal is to save him the 30 seconds of manual hunting. He still verifies.
 */

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(request: NextRequest) {
  const { leadId } = await request.json();
  if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      areas: true,
      source: true,
    },
  });

  const emailLocal = lead.email?.split("@")[0] ?? null;
  const ctx: Record<string, string | null | undefined> = {
    name: lead.name,
    firstName: lead.firstName ?? null,
    lastName: lead.lastName ?? null,
    emailLocalPart: emailLocal,
    location: "Baton Rouge area",
    areas: lead.areas,
  };

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Generate 4 likely Instagram handles for this person. They live in the Baton Rouge, Louisiana area.

Contact:
${JSON.stringify(ctx, null, 2)}

Rules for handle guesses:
- Common patterns: firstname.lastname, firstnamelastname, firstname_lastname, firstname.middleinitial.lastname, firstname_initials, firstname + BR / 225 / lsu / la suffixes
- Email local part is a strong signal — if it's "sarah.johnson" their IG is likely @sarah.johnson or @sarahjohnson
- Louisiana / Baton Rouge locals often append _la, _br, _225, _lsu
- Lowercase only. No @ symbol in the handle itself.

Return ONLY a JSON array of strings, no explanation:
["handle1", "handle2", "handle3", "handle4"]`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) throw new Error("AI returned no JSON");
    const suggestions: string[] = JSON.parse(jsonMatch[0])
      .filter((s: unknown) => typeof s === "string" && (s as string).length > 0)
      .map((s: string) => s.replace(/^@/, "").toLowerCase())
      .slice(0, 4);

    return Response.json({
      suggestions,
      lookupUrls: suggestions.map((h) => `https://www.instagram.com/${h}/`),
      source: "ai",
    });
  } catch (err) {
    // Deterministic fallback — guess patterns without AI
    const fn = (lead.firstName ?? lead.name.split(" ")[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const ln = (lead.lastName ?? lead.name.split(" ").slice(-1)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const fallback: string[] = [];
    if (fn && ln) {
      fallback.push(`${fn}.${ln}`, `${fn}${ln}`, `${fn}_${ln}`, `${fn}${ln}_la`);
    } else if (fn) {
      fallback.push(fn, `${fn}_la`, `${fn}.btr`);
    }
    if (emailLocal && !fallback.includes(emailLocal)) fallback.unshift(emailLocal);

    return Response.json({
      suggestions: fallback.slice(0, 4),
      lookupUrls: fallback.map((h) => `https://www.instagram.com/${h}/`),
      source: "template",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
