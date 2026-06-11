export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";
import { renderTemplate } from "@/lib/followup-templates";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detect specific error classes we want to surface differently to the user
function classifyAnthropicError(err: unknown): "credit_low" | "rate_limited" | "auth" | "network" | "other" {
  const msg = err instanceof Error ? err.message : String(err);
  if (/credit balance is too low/i.test(msg)) return "credit_low";
  if (/rate.?limit/i.test(msg) || /429/.test(msg)) return "rate_limited";
  if (/auth|401|403/i.test(msg)) return "auth";
  if (/timeout|ECONN|ENOTFOUND/i.test(msg)) return "network";
  return "other";
}

// Returns N cold leads with an AI-drafted follow-up message for each.
// Used by the /follow-up workspace to give the agent a stack of ready-to-send messages.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(20, parseInt(searchParams.get("limit") || "5"));
  const daysCold = parseInt(searchParams.get("days") || "5");

  const cutoff = new Date(Date.now() - daysCold * 86_400_000);

  const leads = await prisma.lead.findMany({
    where: {
      stage: { in: ["active", "showing", "new_lead"] },
      OR: [
        { lastContactDate: null },
        { lastContactDate: { lt: cutoff } },
      ],
    },
    orderBy: [{ lastContactDate: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  // Draft messages in parallel — Claude per lead.
  // We use Haiku-class throughput by batching with Promise.all on a fast model.
  // If Anthropic is unavailable (credits, rate limit, etc.), fall back to the
  // template library so the workflow keeps moving.
  let globalAiStatus: "ok" | "credit_low" | "rate_limited" | "auth" | "network" | "other" = "ok";
  let firstErrorMessage: string | null = null;

  const messages = await Promise.all(
    leads.map(async lead => {
      const daysSince = lead.lastContactDate
        ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
        : null;

      const fallbackContext = {
        firstName: lead.firstName,
        name: lead.name,
        pricePoint: lead.pricePoint,
        priceMin: lead.priceMin,
        priceMax: lead.priceMax,
        areas: lead.areas,
        stage: lead.stage,
        type: lead.type,
        daysSinceContact: daysSince,
        motivation: lead.motivation,
        source: lead.source,
      };

      try {
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          system: [
            { type: "text", text: REVE_PIPELINE_SYSTEM, cache_control: { type: "ephemeral" } },
          ],
          messages: [
            {
              role: "user",
              content: `Draft ONE short follow-up text message (under 3 sentences, conversational, specific) for this lead:

Name: ${lead.name}
First name: ${lead.firstName || lead.name.split(" ")[0]}
Stage: ${lead.stage}
Price point: ${lead.pricePoint ? `$${lead.pricePoint.toLocaleString()}` : "unknown"}
Type: ${lead.type}
Areas of interest: ${lead.areas || "unknown"}
Days since last contact: ${daysSince ?? "never contacted"}
Source: ${lead.source || "unknown"}
Notes: ${lead.notes || "none"}

Real, specific, not a template. Output ONLY the message text — no preamble, no quotes.`,
            },
          ],
        });

        const text = response.content.find(b => b.type === "text")?.text?.trim() || "";
        return { leadId: lead.id, message: text, source: "ai" as const };
      } catch (err) {
        const klass = classifyAnthropicError(err);
        if (globalAiStatus === "ok") {
          globalAiStatus = klass;
          firstErrorMessage = err instanceof Error ? err.message : String(err);
        }
        // Graceful fallback — render a personalized template
        const fallback = renderTemplate(fallbackContext);
        return { leadId: lead.id, message: fallback, source: "template" as const };
      }
    }),
  );

  // Get the total cold count for the "X of Y remaining" indicator
  const totalCold = await prisma.lead.count({
    where: {
      stage: { in: ["active", "showing", "new_lead"] },
      OR: [
        { lastContactDate: null },
        { lastContactDate: { lt: cutoff } },
      ],
    },
  });

  const items = leads.map((lead, i) => ({
    lead: {
      id: lead.id,
      name: lead.name,
      firstName: lead.firstName,
      phone: lead.phone,
      email: lead.email,
      stage: lead.stage,
      pricePoint: lead.pricePoint,
      areas: lead.areas,
      lastContactDate: lead.lastContactDate,
      daysSince: lead.lastContactDate
        ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
        : null,
    },
    draft: messages[i].message,
    source: messages[i].source,
  }));

  return Response.json({
    items,
    totalCold,
    returned: items.length,
    aiStatus: globalAiStatus,
    aiError: firstErrorMessage,
  });
}

// POST — record the action taken on a lead (sent / skipped / edited)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, action, message, channel } = body as {
    leadId: string;
    action: "sent" | "skipped" | "snoozed";
    message?: string;
    channel?: "sms" | "email" | "manual";
  };

  if (action === "sent") {
    // Update lastContactDate + log the contact
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactDate: new Date() },
    });
    await prisma.contactLog.create({
      data: {
        leadId,
        method: channel === "sms" ? "text" : channel === "email" ? "email" : "ai_message",
        note: message || "Follow-up sent via AIRE batch workspace",
        direction: "outbound",
      },
    });
  } else if (action === "snoozed") {
    // Push next action 3 days out
    await prisma.lead.update({
      where: { id: leadId },
      data: { nextActionDate: new Date(Date.now() + 3 * 86_400_000) },
    });
  } else if (action === "skipped") {
    // Just bump lastContactDate forward 1 day so they don't reappear immediately
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactDate: new Date(Date.now() - 4 * 86_400_000) },
    });
  }

  return Response.json({ ok: true });
}
