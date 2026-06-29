export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";
import { getLLM } from "@/lib/llm";

// Hybrid router: this haiku-tier call runs on the local model when
// LOCAL_LLM_ENABLED=1, with automatic cloud fallback.
function getClient() { return getLLM(); }

export async function POST(request: NextRequest) {
  const { leadId } = await request.json();

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { timeline_logs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  const daysSince = lead.lastContactDate
    ? Math.floor(
        (Date.now() - new Date(lead.lastContactDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
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
        content: `Write a follow-up text message for this lead:

Name: ${lead.name}
Stage: ${lead.stage}
Price point: ${lead.pricePoint ? `$${lead.pricePoint.toLocaleString()}` : "unknown"}
Motivation: ${lead.motivation || "unknown"}
Days since last contact: ${daysSince ?? "never contacted"}
Recent contacts: ${JSON.stringify(lead.timeline_logs.map((c) => ({ method: c.method, note: c.note, date: c.createdAt })))}
Notes: ${lead.notes || "none"}

Write ONE text message. Under 3 sentences. Real, specific, not a template.`,
      },
    ],
  });

  const message = response.content.find((b) => b.type === "text")?.text || "";

  return Response.json({ message, lead: { id: lead.id, name: lead.name } });
}
