import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";

// Client created per-request so env var changes are always picked up
function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function classifyError(err: unknown): "credit_low" | "rate_limited" | "auth" | "network" | "other" {
  const msg = err instanceof Error ? err.message : String(err);
  if (/credit balance is too low/i.test(msg)) return "credit_low";
  if (/rate.?limit/i.test(msg) || /429/.test(msg)) return "rate_limited";
  if (/auth|401|403/i.test(msg)) return "auth";
  if (/timeout|ECONN|ENOTFOUND/i.test(msg)) return "network";
  return "other";
}

// Fallback brief assembled from pipeline data — no AI needed.
function buildTemplateBrief(args: {
  today: string;
  totalActive: number;
  totalCold: number;
  totalUnderContract: number;
  topPriority: { name: string; days: number | null; stage: string }[];
}): string {
  const { today, totalActive, totalCold, totalUnderContract, topPriority } = args;
  const lines: string[] = [];
  lines.push(`Good morning. Today is ${today}.`);
  lines.push("");
  lines.push(`Pipeline at a glance: ${totalActive} active leads · ${totalCold} cold · ${totalUnderContract} under contract.`);
  lines.push("");
  if (topPriority.length > 0) {
    lines.push("Top of the call list:");
    topPriority.slice(0, 5).forEach(p => {
      const cold = p.days === null ? "never contacted" : `${p.days}d cold`;
      lines.push(`  • ${p.name} — ${p.stage.replace(/_/g, " ")} — ${cold}`);
    });
    lines.push("");
  }
  lines.push("Move through the Cold Follow-Up workspace if you haven't already. Then post your weekly market update. Then check today's calendar.");
  return lines.join("\n");
}

export async function GET() {
  const leads = await prisma.lead.findMany({
    where: { stage: { not: "closed" } },
    orderBy: { lastContactDate: "asc" },
    take: 100,
  });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    timeZone: "America/Chicago",
  });

  const fiveDaysAgo = Date.now() - 5 * 86_400_000;

  // Build fallback context regardless — we use it if AI fails
  const topPriority = leads.slice(0, 5).map(l => ({
    name: l.name,
    days: l.lastContactDate ? Math.floor((Date.now() - new Date(l.lastContactDate).getTime()) / 86_400_000) : null,
    stage: l.stage,
  }));
  const totalCold = leads.filter(l => !l.lastContactDate || new Date(l.lastContactDate).getTime() < fiveDaysAgo).length;
  const totalUnderContract = leads.filter(l => l.stage === "under_contract").length;

  const pipelineSummary = leads.map(lead => ({
    name: lead.name,
    stage: lead.stage,
    pricePoint: lead.pricePoint,
    address: lead.address,
    motivation: lead.motivation,
    daysSinceContact: lead.lastContactDate
      ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
      : null,
    nextAction: lead.nextActionNote,
  }));

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: [
        { type: "text", text: REVE_PIPELINE_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `Today is ${today}. Here is Caleb's full pipeline:\n\n${JSON.stringify(pipelineSummary, null, 2)}\n\nWrite the morning brief.`,
        },
      ],
    });

    const text = response.content.find(b => b.type === "text")?.text || "";
    await prisma.dailyBrief.create({ data: { content: text } });

    return Response.json({ brief: text, date: today, leadCount: leads.length, source: "ai", aiStatus: "ok" });
  } catch (err) {
    const aiStatus = classifyError(err);
    const brief = buildTemplateBrief({
      today,
      totalActive: leads.length,
      totalCold,
      totalUnderContract,
      topPriority,
    });
    return Response.json({ brief, date: today, leadCount: leads.length, source: "template", aiStatus });
  }
}
