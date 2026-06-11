export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { skipTrace } from "@/lib/batchdata";
import { buildCMASummary } from "@/lib/rentcast";
import { getBatonRougeMacro, getMortgageRate, getRateAlert } from "@/lib/housing-intel";
import { fetchActiveListings } from "@/lib/paragon";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tool definitions — Jarvis can operate anything in AIRE
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_today_actions",
    description: "Get the current pending actions queue — what needs to be done today",
    input_schema: {
      type: "object" as const,
      properties: { limit: { type: "number", description: "Max items to return (default 10)" } },
    },
  },
  {
    name: "approve_and_execute",
    description: "Approve and immediately execute a queued action (send the message, post the content, create the task)",
    input_schema: {
      type: "object" as const,
      properties: {
        action_id: { type: "string", description: "The ActionQueue item ID" },
        channel: { type: "string", enum: ["sms", "email"], description: "For draft_message type — which channel to use" },
      },
      required: ["action_id"],
    },
  },
  {
    name: "skip_action",
    description: "Skip/dismiss a queued action without executing it",
    input_schema: {
      type: "object" as const,
      properties: { action_id: { type: "string" } },
      required: ["action_id"],
    },
  },
  {
    name: "get_lead",
    description: "Look up a lead by name or ID — returns contact info, stage, temperature, recent activity",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Lead name, phone, email, or ID" } },
      required: ["query"],
    },
  },
  {
    name: "get_cold_leads",
    description: "Get leads who haven't been contacted in N+ days, sorted by most urgent",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number", description: "Minimum days since last contact (default 7)" } },
    },
  },
  {
    name: "get_pipeline_summary",
    description: "Get a summary of deals in the pipeline — counts by stage, deals closing soon, overdue follow-ups",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "run_agent",
    description: "Manually trigger an AIRE agent to run now",
    input_schema: {
      type: "object" as const,
      properties: {
        agent_type: {
          type: "string",
          enum: ["morning_brief", "lead_revival", "market_intel", "content_scheduler", "transaction_watchdog"],
        },
      },
      required: ["agent_type"],
    },
  },
  {
    name: "skip_trace_lead",
    description: "Skip-trace a lead to find their current phone number, email, and address. Uses BatchData. Requires BATCHDATA_API_KEY.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string", description: "Lead ID in AIRE" },
        name: { type: "string", description: "Full name (if no lead_id)" },
        address: { type: "string", description: "Known address to search against" },
      },
    },
  },
  {
    name: "run_comps",
    description: "Run a CMA — get the AVM (estimated value), rental potential, and nearby comparable sales for any address. Uses Rentcast.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Property address" },
        city: { type: "string", description: "City (default: Baton Rouge)" },
        state: { type: "string", description: "State (default: LA)" },
        asking_price: { type: "number", description: "Optional asking price to calculate gross yield against" },
      },
      required: ["address"],
    },
  },
  {
    name: "search_mls",
    description: "Search live MLS listings from Paragon. Filter by beds, baths, price range, city, or ZIP.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
        min_price: { type: "number" },
        max_price: { type: "number" },
        min_beds: { type: "number" },
        limit: { type: "number", description: "Max listings (default 5)" },
      },
    },
  },
  {
    name: "market_pulse",
    description: "Get Baton Rouge macro market snapshot — 30-yr mortgage rate, local unemployment, housing starts, rate movement alert.",
    input_schema: { type: "object" as const, properties: {} },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_today_actions": {
        const limit = (input.limit as number) || 10;
        const items = await prisma.actionQueue.findMany({
          where: { status: "pending" },
          include: { lead: { select: { id: true, name: true, phone: true, email: true, stage: true, lastContactDate: true } } },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          take: limit,
        });
        if (items.length === 0) return "No pending actions — queue is clear.";
        return JSON.stringify(items.map(i => ({
          id: i.id,
          type: i.type,
          priority: i.priority,
          lead: i.lead?.name ?? null,
          createdAt: i.createdAt,
          payload: i.payload,
        })));
      }

      case "approve_and_execute": {
        const actionId = input.action_id as string;
        const channel = input.channel as string | undefined;

        const item = await prisma.actionQueue.findUnique({ where: { id: actionId }, include: { lead: true } });
        if (!item) return `Action ${actionId} not found`;
        if (item.status !== "pending") return `Action is already ${item.status}`;

        // If channel specified for draft_message, update payload
        if (channel && item.type === "draft_message") {
          const payload = item.payload as Record<string, unknown>;
          await prisma.actionQueue.update({ where: { id: actionId }, data: { payload: { ...payload, channel } } });
        }

        // Approve
        await prisma.actionQueue.update({ where: { id: actionId }, data: { status: "approved", approvedAt: new Date() } });

        // Execute via internal fetch
        const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const execRes = await fetch(`${origin}/api/actions/${actionId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-jarvis": "1" },
        });
        const execData = await execRes.json();

        if (execRes.ok) {
          const leadName = item.lead?.name ?? "contact";
          return `Done — ${item.type} executed for ${leadName}. ${JSON.stringify(execData.result ?? {})}`;
        }
        return `Execution failed: ${execData.error}`;
      }

      case "skip_action": {
        const actionId = input.action_id as string;
        const item = await prisma.actionQueue.findUnique({ where: { id: actionId }, include: { lead: true } });
        if (!item) return `Action ${actionId} not found`;
        await prisma.actionQueue.update({ where: { id: actionId }, data: { status: "skipped", skippedAt: new Date() } });
        return `Skipped${item.lead ? ` — ${item.lead.name}` : ""}`;
      }

      case "get_lead": {
        const query = input.query as string;
        const [lead, logs, tasks] = await Promise.all([
          prisma.lead.findFirst({
            where: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { phone: { contains: query } },
                { id: query },
              ],
            },
          }),
          prisma.contactLog.findMany({
            where: { lead: { name: { contains: query, mode: "insensitive" } } },
            orderBy: { createdAt: "desc" },
            take: 3,
          }),
          prisma.task.findMany({
            where: { lead: { name: { contains: query, mode: "insensitive" } }, done: false },
            take: 3,
          }),
        ]);
        if (!lead) return `No lead found matching "${query}"`;
        const daysSince = lead.lastContactDate
          ? Math.floor((Date.now() - lead.lastContactDate.getTime()) / 86400000)
          : null;
        return JSON.stringify({
          id: lead.id, name: lead.name, phone: lead.phone, email: lead.email,
          stage: lead.stage, source: lead.source,
          lastContact: lead.lastContactDate, daysSinceContact: daysSince,
          recentActivity: logs.map(l => ({ direction: l.direction, note: l.note, date: l.createdAt })),
          pendingTasks: tasks.map(t => ({ title: t.title, dueDate: t.dueDate })),
        });
      }

      case "get_cold_leads": {
        const days = (input.days as number) || 7;
        const cutoff = new Date(Date.now() - days * 86400000);
        const leads = await prisma.lead.findMany({
          where: {
            stage: { in: ["active", "showing", "new_lead"] },
            OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff } }],
          },
          select: { id: true, name: true, stage: true, lastContactDate: true, phone: true },
          orderBy: [{ lastContactDate: "asc" }, { createdAt: "asc" }],
          take: 10,
        });
        if (leads.length === 0) return `No leads cold for ${days}+ days.`;
        return JSON.stringify(leads.map(l => ({
          id: l.id, name: l.name, stage: l.stage,
          daysCold: l.lastContactDate ? Math.floor((Date.now() - l.lastContactDate.getTime()) / 86400000) : "never",
        })));
      }

      case "get_pipeline_summary": {
        const [stages, closingSoon] = await Promise.all([
          prisma.lead.groupBy({ by: ["stage"], _count: true }),
          prisma.lead.findMany({
            where: {
              stage: "under_contract",
              closingDate: { lte: new Date(Date.now() + 7 * 86400000), gte: new Date() },
            },
            select: { name: true, closingDate: true, pricePoint: true },
          }),
        ]);
        return JSON.stringify({ stages: stages.map(s => ({ stage: s.stage, count: s._count })), closingSoon });
      }

      case "run_agent": {
        const agentType = input.agent_type as string;
        const routeMap: Record<string, string> = {
          morning_brief: "/api/agents/morning-brief",
          lead_revival: "/api/agents/revival",
          market_intel: "/api/agents/market-intel",
          content_scheduler: "/api/agents/content-scheduler",
          transaction_watchdog: "/api/agents/transaction-watchdog",
        };
        const path = routeMap[agentType];
        if (!path) return `Unknown agent type: ${agentType}`;
        const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const res = await fetch(`${origin}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
        });
        return res.ok ? `${agentType} agent triggered successfully` : `Agent trigger failed: ${await res.text()}`;
      }

      case "skip_trace_lead": {
        if (!process.env.BATCHDATA_API_KEY) return "Skip trace unavailable — BATCHDATA_API_KEY not set. Sign up at batchdata.com to enable.";
        const leadId = input.lead_id as string | undefined;
        let name = input.name as string | undefined;
        let address = input.address as string | undefined;

        if (leadId) {
          const lead = await prisma.lead.findUnique({ where: { id: leadId } });
          if (!lead) return `Lead ${leadId} not found`;
          name = lead.name;
        }

        const result = await skipTrace({ name, address });
        if (!result.phones.length && !result.emails.length) {
          return `No results found for "${name ?? address}". Try providing more identifying info.`;
        }

        const phones = result.phones.slice(0, 3).map(p => `${p.number} (${p.type}, ${p.confidence}% confidence${p.doNotCall ? " — DNC" : ""})`);
        const emails = result.emails.slice(0, 2).map(e => `${e.email} (${e.confidence}%)`);
        const lines = [`Skip trace results for "${name ?? address}":`];
        if (phones.length) lines.push(`Phones: ${phones.join("; ")}`);
        if (emails.length) lines.push(`Emails: ${emails.join("; ")}`);
        if (result.currentAddress) lines.push(`Current address: ${result.currentAddress}`);
        if (result.employer) lines.push(`Employer: ${result.employer}`);
        if (result.relatives.length) lines.push(`Relatives: ${result.relatives.slice(0, 3).join(", ")}`);
        return lines.join("\n");
      }

      case "run_comps": {
        if (!process.env.RENTCAST_API_KEY) return "Comps unavailable — RENTCAST_API_KEY not set. Sign up at rentcast.io to enable.";
        const address = input.address as string;
        const city = (input.city as string | undefined) ?? "Baton Rouge";
        const state = (input.state as string | undefined) ?? "LA";
        const askingPrice = input.asking_price as number | undefined;
        const cma = await buildCMASummary(address, city, state, askingPrice);
        return cma.summary;
      }

      case "search_mls": {
        const listings = await fetchActiveListings(undefined, {
          city: input.city as string | undefined,
          zip: input.zip as string | undefined,
          minPrice: input.min_price as number | undefined,
          maxPrice: input.max_price as number | undefined,
          beds: input.min_beds as number | undefined,
          limit: (input.limit as number | undefined) ?? 5,
        });
        if (!listings.length) return "No active listings found for those filters.";
        return listings.slice(0, 8).map(l =>
          `${l.address}, ${l.city} — ${l.price ? `$${l.price.toLocaleString()}` : "price N/A"} · ${l.beds ?? "?"}bd/${l.baths ?? "?"}ba · ${l.daysOnMarket ?? "?"}d on market · MLS# ${l.mlsNumber}`
        ).join("\n");
      }

      case "market_pulse": {
        const [macro, rateAlert] = await Promise.all([
          getBatonRougeMacro().catch(() => null),
          getRateAlert().catch(() => null),
        ]);
        const snap = await getMortgageRate().catch(() => null);
        const lines: string[] = ["Baton Rouge market snapshot:"];
        if (snap) lines.push(`30-yr rate: ${snap.current}% (${snap.delta > 0 ? "+" : ""}${snap.delta.toFixed(3)}% vs last week)`);
        if (macro?.unemployment) lines.push(`BR unemployment: ${macro.unemployment}%`);
        if (macro?.housingStarts) lines.push(`US housing starts: ${macro.housingStarts}k units — ${macro.marketDirection}`);
        if (rateAlert?.triggered) lines.push(`⚠️ Rate alert: ${rateAlert.message}`);
        return lines.join("\n");
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    logError("ai", "api/jarvis", err as Error, { tool: name });
    return `Tool error: ${String(err)}`;
  }
}

export async function POST(req: NextRequest) {
  const { message, context } = await req.json() as { message: string; context?: Record<string, unknown> };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: message }
        ];

        const systemPrompt = `You are AIRE — Caleb Jackson's always-on real estate operations AI at Rêve Realtors® Baton Rouge.
You have direct access to the CRM, pipeline, content queue, and action queue. You can execute actions — send messages, skip items, run agents, look up leads.

Current context: ${JSON.stringify(context ?? {})}
Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}

Operating rules:
- Be brief and direct. Max 2 sentences unless listing items.
- When you execute something, confirm what you did in one sentence.
- Don't ask for permission before looking something up — just look it up.
- Do ask "via SMS or email?" before sending a message if channel is ambiguous.
- Caleb's market: Baton Rouge LA — EBR Parish corridors, Zachary, St. Francisville.
- Tone: efficient, no filler, Jarvis-level clarity.`;

        // Agentic loop — run until no more tool calls
        for (let round = 0; round < 5; round++) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          });

          if (response.stop_reason === "tool_use") {
            const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const tu of toolUses) {
              send({ type: "tool_call", tool: tu.name });
              const result = await executeTool(tu.name, tu.input as Record<string, unknown>);
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
            }

            // Add assistant response + tool results to messages
            messages.push({ role: "assistant", content: response.content });
            messages.push({ role: "user", content: toolResults });
          } else {
            // Final text response
            const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
            send({ type: "result", text: textBlock?.text ?? "Done." });
            break;
          }
        }
      } catch (err) {
        logError("ai", "api/jarvis", err as Error);
        send({ type: "error", text: "Something went wrong. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
