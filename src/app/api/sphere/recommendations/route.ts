import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";

// Sphere Re-engagement Recommendations
//
// Surfaces sphere contacts (past clients, referral partners, "sphere" type/tag)
// who haven't been touched in 90+ days, and drafts a warm, Caleb-voice check-in
// message for each via Claude Haiku. Hardened against AI failures — a generic
// fallback template guarantees the endpoint never returns an empty response.

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface SphereRecommendation {
  leadId: string;
  leadName: string;
  phone: string | null;
  email: string | null;
  daysSinceContact: number | null;
  message: string;
}

// Deterministic fallback so a Claude failure for one lead never breaks the response.
function fallbackMessage(firstName: string) {
  return `Hey ${firstName}, it's been a while — wanted to check in. How's everything going?`;
}

function firstNameOf(lead: { firstName: string | null; name: string }) {
  return lead.firstName?.trim() || lead.name.split(" ")[0] || "there";
}

export async function GET() {
  const now = Date.now();
  const ninetyDaysAgo = new Date(now - 90 * 86_400_000);

  // Match the same broad sphere definition used by /api/actions, plus the
  // explicit type/tags the task spec calls out. SQLite via Prisma doesn't
  // support `mode: "insensitive"` so we rely on `contains` (substring) which
  // is case-sensitive on SQLite — values like "sphere"/"past_client" are
  // stored lowercase by convention in this app.
  const sphereWhere = {
    AND: [
      {
        OR: [
          { stage: "closed" },
          { type: { in: ["sphere", "past_client", "referral"] } },
          { source: { contains: "sphere" } },
          { source: { contains: "referral" } },
          { tags: { contains: "sphere" } },
          { tags: { contains: "past client" } },
          { tags: { contains: "past_client" } },
        ],
      },
      {
        OR: [
          { lastContactDate: null },
          { lastContactDate: { lt: ninetyDaysAgo } },
        ],
      },
    ],
  };

  const [candidates, totalCold] = await Promise.all([
    prisma.lead.findMany({
      where: sphereWhere,
      orderBy: [{ lastContactDate: "asc" }, { createdAt: "asc" }],
      take: 8,
    }),
    prisma.lead.count({ where: sphereWhere }),
  ]);

  const daysSince = (d: Date | null) =>
    d ? Math.floor((now - new Date(d).getTime()) / 86_400_000) : null;

  const client = getClient();

  // Draft messages in parallel so 8 leads doesn't take 8x as long.
  const recommendations: SphereRecommendation[] = await Promise.all(
    candidates.map(async (lead): Promise<SphereRecommendation> => {
      const ds = daysSince(lead.lastContactDate);
      const firstName = firstNameOf(lead);

      let message = fallbackMessage(firstName);

      try {
        const response = await client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 200,
          system: [
            {
              type: "text",
              text: REVE_PIPELINE_SYSTEM,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Write a sphere re-engagement check-in message for this past client / sphere contact.

Name: ${lead.name}
First name to use: ${firstName}
Days since last contact: ${ds ?? "never contacted"}
Stage: ${lead.stage}
Type: ${lead.type}
Source: ${lead.source ?? "unknown"}
Address (if a past client): ${lead.address ?? "unknown"}
Notes: ${lead.notes?.slice(0, 240) ?? "none"}

Write ONE message. 2-3 sentences. Warm but professional. Baton Rouge / Louisiana voice — natural, not corporate. Pre-fill the first name. No emojis. No "just checking in." No "just wanted to." Reference the time gap lightly without making it weird. Return ONLY the message text, no preamble, no quotes.`,
            },
          ],
        });

        const text = response.content.find((b) => b.type === "text")?.text?.trim();
        if (text && text.length > 0) {
          // Strip wrapping quotes if Claude added them.
          message = text.replace(/^["']|["']$/g, "").trim();
        }
      } catch {
        // Per-lead failure: keep the generic fallback so the endpoint never
        // fully fails. Swallow the error — the request as a whole still
        // returns useful candidates.
      }

      return {
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.phone,
        email: lead.email,
        daysSinceContact: ds,
        message,
      };
    }),
  );

  return Response.json({ recommendations, totalCold });
}
