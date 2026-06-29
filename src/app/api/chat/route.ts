export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";
import { REVE_BRAND_SYSTEM } from "@/lib/reve-system-prompt";
import { buildServerChatContext, type ChatContext } from "@/lib/chat-context";
import { skipTrace } from "@/lib/batchdata";
import { buildCMASummary, fetchSaleListings } from "@/lib/rentcast";
import { getBatonRougeMacro, getMortgageRate, getRateAlert } from "@/lib/housing-intel";
import { fetchActiveListings } from "@/lib/paragon";
import { searchMemory } from "@/lib/memory-indexer";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOL_LABELS: Record<string, string> = {
  get_today_actions: "checking your queue",
  approve_and_execute: "executing action",
  skip_action: "skipping item",
  get_lead: "looking up lead",
  get_cold_leads: "scanning cold leads",
  get_pipeline_summary: "reading pipeline",
  get_opportunities: "scanning opportunities",
  run_agent: "triggering agent",
  skip_trace_lead: "skip tracing",
  run_comps: "running comps",
  search_mls: "searching MLS",
  market_pulse: "reading market data",
  get_social_drafts: "checking drafts",
  create_social_post: "writing post",
  push_post_to_facebook: "pushing to Facebook",
  score_caption: "scoring caption",
  sync_fb_insights: "pulling engagement data",
  search_zillow: "searching Zillow listings",
  refresh_zillow_market: "refreshing Zillow market data",
  search_contacts: "searching contacts",
  update_caption: "updating caption",
  schedule_post: "scheduling post",
  search_memory: "searching memory",
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_today_actions",
    description: "Get the current pending actions queue",
    input_schema: { type: "object" as const, properties: { limit: { type: "number" } } },
  },
  {
    name: "get_lead",
    description: "Look up a lead by name, phone, or email",
    input_schema: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_cold_leads",
    description: "Get leads who haven't been contacted in N+ days",
    input_schema: { type: "object" as const, properties: { days: { type: "number" } } },
  },
  {
    name: "get_pipeline_summary",
    description: "Pipeline summary — counts by stage, deals closing soon",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_opportunities",
    description: "Get today's proactively detected lead opportunities — hot windows, FSBO timing, stale actives, closing nudges, win-back anniversaries",
    input_schema: {
      type: "object" as const,
      properties: {
        signal_type: {
          type: "string",
          enum: ["hot_window", "fsbo_timing", "stale_active", "closing_nudge", "win_back", "all"],
          description: "Filter by signal type — omit or pass 'all' for all signals",
        },
      },
    },
  },
  {
    name: "run_agent",
    description: "Trigger an AIRE agent to run now",
    input_schema: {
      type: "object" as const,
      properties: {
        agent_type: { type: "string", enum: ["morning_brief", "lead_revival", "market_intel", "content_scheduler", "transaction_watchdog", "opportunity_detector"] },
      },
      required: ["agent_type"],
    },
  },
  {
    name: "skip_trace_lead",
    description: "Skip-trace a lead to find phone/email/address",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        name: { type: "string" },
        address: { type: "string" },
      },
    },
  },
  {
    name: "run_comps",
    description: "Run CMA — AVM, rental potential, comparable sales",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        asking_price: { type: "number" },
      },
      required: ["address"],
    },
  },
  {
    name: "search_mls",
    description: "Search live MLS listings",
    input_schema: {
      type: "object" as const,
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
        min_price: { type: "number" },
        max_price: { type: "number" },
        min_beds: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "market_pulse",
    description: "Baton Rouge macro market snapshot",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_social_drafts",
    description: "List social media drafts and scheduled posts",
    input_schema: {
      type: "object" as const,
      properties: { status: { type: "string", enum: ["draft", "scheduled", "all"] } },
    },
  },
  {
    name: "create_social_post",
    description: "Generate and save a social media post draft",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string" },
        platform: { type: "string", enum: ["facebook", "instagram", "both"] },
        post_type: { type: "string" },
        audience: { type: "string" },
        scheduled_for: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "push_post_to_facebook",
    description: "Push a REVIEWED AND CONFIRMED draft post to Facebook. ONLY call this when Caleb explicitly says 'push it', 'post it', 'send it', or 'publish it' — NEVER proactively. Always summarize the post content and ask for confirmation before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        post_id: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true — Caleb explicitly confirmed this specific post" },
      },
      required: ["post_id", "confirmed"],
    },
  },
  {
    name: "score_caption",
    description: "Score a caption 0-100 for brand fit and engagement",
    input_schema: {
      type: "object" as const,
      properties: { caption: { type: "string" }, audience: { type: "string" } },
      required: ["caption"],
    },
  },
  {
    name: "search_contacts",
    description: "Search contacts by name, location, or stage",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        stage: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_caption",
    description: "Edit the caption on a draft post",
    input_schema: {
      type: "object" as const,
      properties: {
        post_id: { type: "string" },
        caption: { type: "string" },
      },
      required: ["post_id", "caption"],
    },
  },
  {
    name: "schedule_post",
    description: "Set a scheduled publish time on a draft post",
    input_schema: {
      type: "object" as const,
      properties: {
        post_id: { type: "string" },
        scheduled_for: { type: "string" },
      },
      required: ["post_id", "scheduled_for"],
    },
  },
  {
    name: "search_zillow",
    description: "Search cached Zillow listings for Baton Rouge, Zachary, or St. Francisville. Use for market intel, comps, buyer searches, pricing questions, days on market analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: {
          type: "string",
          enum: ["baton-rouge", "zachary", "st-francisville", "all"],
          description: "City to search — omit or 'all' for all markets",
        },
        status: {
          type: "string",
          enum: ["for_sale", "recently_sold"],
          description: "Listing status (default: for_sale)",
        },
        max_price: { type: "number", description: "Maximum price filter" },
        min_price: { type: "number", description: "Minimum price filter" },
        min_beds: { type: "number", description: "Minimum bedrooms" },
        zip: { type: "string", description: "Filter by zip code" },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
      },
    },
  },
  {
    name: "refresh_zillow_market",
    description: "Trigger a fresh Zillow market data scrape for a city. Use when the cache is stale or Caleb wants updated listings.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: {
          type: "string",
          enum: ["baton-rouge", "zachary", "st-francisville"],
          description: "City to refresh (default: baton-rouge)",
        },
        status: {
          type: "string",
          enum: ["for_sale", "recently_sold"],
          description: "Status to scrape (default: for_sale)",
        },
        force: {
          type: "boolean",
          description: "Bypass 24h cache and force re-scrape",
        },
      },
    },
  },
  {
    name: "search_memory",
    description: `Search AIRE's memory — leads, contact logs, and Jarvis chat history.
Use this when Caleb asks about past conversations, lead interests, contact history, or anything that requires looking across the database.
Examples of when to call this:
- "Which leads mentioned acreage?" → search contact_log + lead for "acreage"
- "What did I last say to John Smith?" → search contact_log for "John Smith"
- "Find leads cold 30+ days in Zachary" → combine get_cold_leads + search_memory for "Zachary"
- "Who mentioned investment properties?" → search all types for "investment"
Call this BEFORE answering any question about past interactions or lead history.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query — use natural language, names, neighborhoods, topics",
        },
        types: {
          type: "array",
          items: { type: "string", enum: ["lead", "contact_log", "chat_message"] },
          description: "Which source types to search (default: all). Use contact_log for past conversations.",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 8, max 20)",
        },
      },
      required: ["query"],
    },
    // Cache the full TOOLS array — Anthropic caches everything up to the last cache_control marker.
    // This saves re-sending ~8k tokens on every round of the 6-round agentic loop.
    cache_control: { type: "ephemeral" as const },
  },
] as (Anthropic.Tool & { cache_control?: { type: "ephemeral" } })[];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_today_actions": {
        const limit = (input.limit as number) || 10;
        const items = await prisma.actionQueue.findMany({
          where: { status: "pending" },
          include: { lead: { select: { id: true, name: true, stage: true } } },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          take: limit,
        });
        if (!items.length) return "Queue is clear — nothing pending.";
        return items.map(i => `[${i.id}] ${i.type} · ${i.lead?.name ?? "no lead"} · priority ${i.priority}`).join("\n");
      }

      case "get_lead": {
        const query = input.query as string;
        const lead = await prisma.lead.findFirst({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { id: query },
            ],
          },
        });
        if (!lead) return `No lead found matching "${query}"`;
        const daysSince = lead.lastContactDate
          ? Math.floor((Date.now() - lead.lastContactDate.getTime()) / 86400000)
          : null;
        return `${lead.name} | ${lead.stage} | last contact: ${daysSince !== null ? `${daysSince}d ago` : "never"} | ${lead.phone ?? "no phone"} | ${lead.email ?? "no email"}`;
      }

      case "get_cold_leads": {
        const days = (input.days as number) || 7;
        const cutoff = new Date(Date.now() - days * 86400000);
        const leads = await prisma.lead.findMany({
          where: {
            stage: { in: ["active", "showing", "new_lead"] },
            OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff } }],
          },
          select: { id: true, name: true, stage: true, lastContactDate: true },
          orderBy: [{ lastContactDate: "asc" }],
          take: 10,
        });
        if (!leads.length) return `No leads cold for ${days}+ days.`;
        return leads.map(l => `${l.name} (${l.stage}) — ${l.lastContactDate ? `${Math.floor((Date.now() - l.lastContactDate.getTime()) / 86400000)}d` : "never contacted"}`).join("\n");
      }

      case "get_opportunities": {
        const signalFilter = input.signal_type as string | undefined;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
        const items = await prisma.actionQueue.findMany({
          where: {
            agentType: "opportunity_detector",
            briefDate: today,
            status: "pending",
          },
          include: { lead: { select: { id: true, name: true, stage: true, phone: true } } },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          take: 20,
        });
        const filtered = signalFilter && signalFilter !== "all"
          ? items.filter((i) => (i.payload as Record<string, unknown>).signalType === signalFilter)
          : items;
        if (!filtered.length) {
          return signalFilter && signalFilter !== "all"
            ? `No ${signalFilter} opportunities today.`
            : "No opportunities detected today — queue is clean.";
        }
        return filtered.map((item) => {
          const p = item.payload as Record<string, unknown>;
          const urgency = p.urgencyLabel as string;
          const action = p.recommendedAction as string;
          const detail = p.detail as string;
          const name = item.lead?.name ?? (p.leadName as string) ?? "Unknown";
          return `[${urgency}] ${name} (${item.lead?.stage ?? ""}) — ${action}\n  ${detail}`;
        }).join("\n\n");
      }

      case "get_pipeline_summary": {
        const stages = await prisma.lead.groupBy({ by: ["stage"], _count: true });
        const closingSoon = await prisma.lead.findMany({
          where: { stage: "under_contract", closingDate: { lte: new Date(Date.now() + 7 * 86400000), gte: new Date() } },
          select: { name: true, closingDate: true },
        });
        const stageList = stages.map(s => `${s.stage}: ${s._count}`).join(", ");
        const closingList = closingSoon.map(l => `${l.name} closes ${l.closingDate?.toLocaleDateString()}`).join(", ");
        return `Pipeline: ${stageList}${closingList ? `\nClosing soon: ${closingList}` : ""}`;
      }

      case "run_agent": {
        const agentType = input.agent_type as string;
        const routeMap: Record<string, string> = {
          morning_brief: "/api/agents/morning-brief",
          lead_revival: "/api/agents/revival",
          market_intel: "/api/agents/market-intel",
          content_scheduler: "/api/agents/content-scheduler",
          transaction_watchdog: "/api/agents/transaction-watchdog",
          opportunity_detector: "/api/agents/opportunity-detector",
        };
        const origin = process.env.NEXT_PUBLIC_APP_URL || "https://aire-intel.vercel.app";
        const res = await fetch(`${origin}${routeMap[agentType]}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        return res.ok ? `${agentType} triggered ✓` : `Failed: ${await res.text()}`;
      }

      case "skip_trace_lead": {
        if (!process.env.BATCHDATA_API_KEY) return "Skip trace unavailable — BATCHDATA_API_KEY not configured.";
        const leadId = input.lead_id as string | undefined;
        let name = input.name as string | undefined;
        const address = input.address as string | undefined;
        if (leadId) {
          const lead = await prisma.lead.findUnique({ where: { id: leadId } });
          if (lead) name = lead.name;
        }
        const result = await skipTrace({ name, address });
        if (!result.phones.length && !result.emails.length) return `No results for "${name ?? address}"`;
        return [
          result.phones.slice(0, 2).map(p => `${p.number} (${p.type})`).join(", "),
          result.emails.slice(0, 1).map(e => e.email).join(", "),
          result.currentAddress ?? "",
        ].filter(Boolean).join(" · ");
      }

      case "run_comps": {
        if (!process.env.RENTCAST_API_KEY) return "Comps unavailable — RENTCAST_API_KEY not configured.";
        const cma = await buildCMASummary(
          input.address as string,
          (input.city as string) ?? "Baton Rouge",
          (input.state as string) ?? "LA",
          input.asking_price as number | undefined
        );
        return cma.summary;
      }

      case "search_mls": {
        const listings = await fetchActiveListings(undefined, {
          city: input.city as string | undefined,
          zip: input.zip as string | undefined,
          minPrice: input.min_price as number | undefined,
          maxPrice: input.max_price as number | undefined,
          beds: input.min_beds as number | undefined,
          limit: (input.limit as number) ?? 5,
        });
        if (!listings.length) return "No listings found.";
        return listings.slice(0, 6).map(l =>
          `${l.address}, ${l.city} — ${l.price ? `$${l.price.toLocaleString()}` : "N/A"} · ${l.beds ?? "?"}bd/${l.baths ?? "?"}ba · ${l.daysOnMarket ?? "?"}d`
        ).join("\n");
      }

      case "market_pulse": {
        const [macro, rateAlert, snap] = await Promise.all([
          getBatonRougeMacro().catch(() => null),
          getRateAlert().catch(() => null),
          getMortgageRate().catch(() => null),
        ]);
        const lines: string[] = [];
        if (snap) lines.push(`30-yr rate: ${snap.current}% (${snap.delta > 0 ? "+" : ""}${snap.delta.toFixed(3)}% wk-over-wk)`);
        if (macro?.unemployment) lines.push(`BR unemployment: ${macro.unemployment}%`);
        if (macro?.housingStarts) lines.push(`Housing starts: ${macro.housingStarts}k — ${macro.marketDirection}`);
        if (rateAlert?.triggered) lines.push(`⚠️ ${rateAlert.message}`);
        return lines.join("\n") || "Market data unavailable.";
      }

      case "get_social_drafts": {
        const statusFilter = (input.status as string) || "draft";
        const where = statusFilter === "all" ? { status: { in: ["draft", "scheduled"] } } : { status: statusFilter };
        const posts = await prisma.scheduledPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, platform: true, caption: true, status: true, scheduledFor: true, qualityScore: true, postType: true },
        });
        if (!posts.length) return `No ${statusFilter} posts.`;
        return posts.map(p =>
          `[${p.id}] ${p.platform} ${p.postType ?? ""} | score: ${p.qualityScore ?? "?"}/100 | ${p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "unscheduled"}\n${p.caption.slice(0, 100)}...`
        ).join("\n\n");
      }

      case "create_social_post": {
        const topic = input.topic as string;
        const platform = (input.platform as string) || "both";
        const postType = (input.post_type as string) || "personal";
        const audience = (input.audience as string) || "sphere, 21-35 Instagram";
        const scheduledFor = input.scheduled_for ? new Date(input.scheduled_for as string) : null;

        const evolved = await prisma.setting.findFirst({ where: { key: { startsWith: "content.promptEvolution" } }, orderBy: { key: "desc" } });
        const evolutionContext = evolved ? `\nLEARNED PREFERENCES:\n${evolved.value}` : "";

        const msg = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: `Write a ${postType} social post for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge. Target: ${audience}.
Voice: authentic, personal, never corporate. Hook first. Under 150 words unless listing post.
Banned: "dream home", "luxury lifestyle", "nestled", "stunning", "trusted advisor".
Footer on listing posts only: Caleb Jackson, REALTOR® / Rêve Realtors® · Baton Rouge, LA / (225) 747-0303 · caleb.jackson@reverealtors.com${evolutionContext}`,
          messages: [{ role: "user", content: `Write about: ${topic}` }],
        });

        const caption = (msg.content[0] as Anthropic.TextBlock).text;
        const scoreMsg = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          system: "Score this real estate social caption 0-100 for brand authenticity + engagement + audience fit. Reply with ONLY the number.",
          messages: [{ role: "user", content: caption }],
        });
        const qualityScore = parseFloat((scoreMsg.content[0] as Anthropic.TextBlock).text.match(/\d+(\.\d+)?/)?.[0] ?? "72");

        const post = await prisma.scheduledPost.create({
          data: { platform, caption, postType, status: "draft", qualityScore, scheduledFor },
        });
        return `Draft created [${post.id}] — score ${qualityScore}/100\n\n${caption}`;
      }

      case "push_post_to_facebook": {
        if (!input.confirmed) {
          return "Cannot push to Facebook — explicit confirmation required. Show Caleb the post content first and wait for him to say 'post it' or 'confirm'.";
        }
        const origin = process.env.NEXT_PUBLIC_APP_URL || "https://aire-intel.vercel.app";
        const res = await fetch(`${origin}/api/social/drafts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: input.post_id, action: "approve" }),
        });
        const data = await res.json() as { ok?: boolean; fbPostId?: string; error?: string; note?: string };
        if (data.ok) return `Pushed to Facebook ✓ — ${data.fbPostId ?? "scheduled draft"}${data.note ? ` (${data.note})` : ""}`;
        return `Push failed: ${data.error}`;
      }

      case "score_caption": {
        const caption = input.caption as string;
        const audience = (input.audience as string) || "21-35 Instagram sphere";
        const msg = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 250,
          system: `Score this real estate caption for Caleb Jackson targeting ${audience}.
Format:
SCORE: [0-100]
VOICE: [score]/33 — [one line]
HOOK: [score]/33 — [one line]
RESONANCE: [score]/34 — [one line]
FIX: [one specific improvement]`,
          messages: [{ role: "user", content: caption }],
        });
        return (msg.content[0] as Anthropic.TextBlock).text;
      }

      case "search_contacts": {
        const query = input.query as string;
        const stage = input.stage as string | undefined;
        const limit = (input.limit as number) || 8;
        const contacts = await prisma.lead.findMany({
          where: {
            ...(stage ? { stage } : {}),
            ...(query ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { areas: { contains: query, mode: "insensitive" } },
              ],
            } : {}),
          },
          select: { id: true, name: true, stage: true, phone: true, lastContactDate: true },
          take: limit,
        });
        if (!contacts.length) return `No contacts found${query ? ` matching "${query}"` : ""}.`;
        return contacts.map(c => {
          const days = c.lastContactDate ? Math.floor((Date.now() - c.lastContactDate.getTime()) / 86400000) : null;
          return `${c.name} (${c.stage}) · ${c.phone ?? "no phone"} · ${days !== null ? `${days}d ago` : "never contacted"}`;
        }).join("\n");
      }

      case "update_caption": {
        await prisma.scheduledPost.update({
          where: { id: input.post_id as string },
          data: { caption: input.caption as string },
        });
        return `Caption updated on post ${input.post_id} ✓`;
      }

      case "schedule_post": {
        const scheduledFor = new Date(input.scheduled_for as string);
        await prisma.scheduledPost.update({
          where: { id: input.post_id as string },
          data: { scheduledFor },
        });
        return `Post ${input.post_id} scheduled for ${scheduledFor.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} ✓`;
      }

      case "search_zillow": {
        const city = (input.city as string | undefined) ?? "all";
        const status = (input.status as string | undefined) ?? "for_sale";
        const maxPrice = input.max_price as number | undefined;
        const minPrice = input.min_price as number | undefined;
        const minBeds = input.min_beds as number | undefined;
        const zip = input.zip as string | undefined;
        const limit = Math.min((input.limit as number) || 10, 50);

        type ZillowWhere = {
          status: string;
          city?: { contains: string; mode: "insensitive" };
          zip?: string;
          price?: { gte?: number; lte?: number };
          beds?: { gte: number };
        };

        const where: ZillowWhere = { status };

        if (city !== "all") {
          const cityMap: Record<string, string> = {
            "baton-rouge": "baton rouge",
            zachary: "zachary",
            "st-francisville": "saint francisville",
          };
          where.city = { contains: cityMap[city] ?? city.replace("-", " "), mode: "insensitive" };
        }
        if (zip) where.zip = zip;
        if (minPrice !== undefined || maxPrice !== undefined) {
          where.price = {};
          if (minPrice !== undefined) where.price.gte = minPrice;
          if (maxPrice !== undefined) where.price.lte = maxPrice;
        }
        if (minBeds !== undefined) where.beds = { gte: minBeds };

        const listings = await prisma.zillowListing.findMany({
          where,
          orderBy: status === "recently_sold" ? { soldDate: "desc" } : { daysOnMarket: "asc" },
          take: limit,
          select: {
            id: true, address: true, city: true, zip: true,
            price: true, beds: true, baths: true, sqft: true,
            daysOnMarket: true, zestimate: true, status: true,
            soldPrice: true, soldDate: true, listingUrl: true,
            scrapedAt: true, yearBuilt: true, propertyType: true,
          },
        });

        if (!listings.length) {
          // Zillow cache empty — fall back to Rentcast live listings
          try {
            const cityName = city === "baton-rouge" ? "Baton Rouge"
              : city === "zachary" ? "Zachary"
              : city === "st-francisville" ? "Saint Francisville"
              : "Baton Rouge";
            const rcListings = await fetchSaleListings(cityName, "LA", {
              limit,
              minPrice,
              maxPrice,
            });
            if (!rcListings.length) return `No active listings found in ${cityName}. Market data may be unavailable.`;
            const lines = rcListings.map((l) => {
              const price = l.price ? `$${l.price.toLocaleString()}` : "price n/a";
              const detail = [
                l.beds != null ? `${l.beds}bd` : "",
                l.baths != null ? `${l.baths}ba` : "",
                l.sqft ? `${l.sqft.toLocaleString()}sqft` : "",
                l.daysOnMarket != null ? `${l.daysOnMarket}d on mkt` : "",
              ].filter(Boolean).join(" · ");
              return `${l.address}, ${l.city} — ${price}${detail ? ` | ${detail}` : ""}`;
            });
            return `${rcListings.length} active listings in ${cityName} (via Rentcast, live):\n\n${lines.join("\n")}`;
          } catch {
            return `No cached listings found${city !== "all" ? ` for ${city}` : ""}. Zillow sync is pending — try again later.`;
          }
        }

        const oldestScrape = listings.reduce(
          (min, l) => l.scrapedAt < min ? l.scrapedAt : min,
          listings[0].scrapedAt
        );
        const cacheHours = Math.round((Date.now() - oldestScrape.getTime()) / 3_600_000);

        const lines = listings.map((l) => {
          const price = l.status === "recently_sold"
            ? (l.soldPrice ? `SOLD $${l.soldPrice.toLocaleString()}` : "SOLD n/a")
            : (l.price ? `$${l.price.toLocaleString()}` : "price n/a");
          const dom = l.daysOnMarket != null ? `${l.daysOnMarket}d on mkt` : "";
          const zest = l.zestimate ? `zest $${l.zestimate.toLocaleString()}` : "";
          const detail = [
            l.beds != null ? `${l.beds}bd` : "",
            l.baths != null ? `${l.baths}ba` : "",
            l.sqft ? `${l.sqft.toLocaleString()}sqft` : "",
            dom, zest,
          ].filter(Boolean).join(" · ");
          return `${l.address}, ${l.city} — ${price}${detail ? ` | ${detail}` : ""}`;
        });

        return `${listings.length} ${status.replace("_", " ")} listings (cache ${cacheHours}h old):\n\n${lines.join("\n")}`;
      }

      case "refresh_zillow_market": {
        const city = (input.city as string | undefined) ?? "baton-rouge";
        const status = (input.status as string | undefined) ?? "for_sale";
        const force = (input.force as boolean | undefined) ?? false;

        const origin = process.env.NEXT_PUBLIC_APP_URL || "https://aire-intel.vercel.app";
        const res = await fetch(`${origin}/api/zillow/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city, status, force }),
          signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) return `Zillow refresh failed: ${await res.text()}`;

        const data = await res.json() as {
          cached?: boolean;
          message?: string;
          ok?: boolean;
          fetched?: number;
          upserted?: number;
          errors?: string[];
        };

        if (data.cached) return `Cache still fresh — ${data.message}`;
        return `Zillow refresh complete — fetched ${data.fetched ?? 0}, upserted ${data.upserted ?? 0} listings for ${city}/${status}${data.errors?.length ? ` (${data.errors.length} errors)` : ""}.`;
      }

      case "search_memory": {
        const query = input.query as string;
        const types = input.types as string[] | undefined;
        const limit = (input.limit as number | undefined) ?? 8;

        const results = await searchMemory(query, types, limit);

        if (!results.length) {
          return `No memory results for "${query}". Try a different search term or rebuild the index.`;
        }

        return results.map((r, i) => {
          const date = new Date(r.sourceAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const who = r.leadName ? `re: ${r.leadName}` : "";
          return `${i + 1}. [${r.sourceType}] ${who} (${date})\n   ${r.excerpt.slice(0, 200)}`;
        }).join("\n\n");
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    logError("ai", "api/chat", err as Error, { tool: name });
    return `Tool error: ${String(err)}`;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const threads = await prisma.chatThread.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, title: true, messageCount: true, updatedAt: true },
  });
  return Response.json(threads);
}

export async function POST(req: NextRequest) {
  const { threadId: incomingThreadId, message, context } = await req.json() as {
    threadId?: string;
    message: string;
    context?: ChatContext;
  };

  const encoder = new TextEncoder();
  let resolvedThreadId = incomingThreadId ?? "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Create or load thread
        if (!resolvedThreadId) {
          const thread = await prisma.chatThread.create({
            data: { title: message.slice(0, 60).trim() },
          });
          resolvedThreadId = thread.id;
        }
        send({ type: "thread", threadId: resolvedThreadId });

        // Save user message
        await prisma.chatMessage.create({
          data: { threadId: resolvedThreadId, role: "user", content: message },
        });

        // Load thread history (last 20 messages for context)
        const history = await prisma.chatMessage.findMany({
          where: { threadId: resolvedThreadId, role: { in: ["user", "assistant"] } },
          orderBy: { createdAt: "asc" },
          take: 20,
        });

        // Mark the second-to-last message with cache_control so Anthropic caches
        // the full thread history up to that point. Each new turn only sends the
        // new user message uncached — cuts repeated input tokens ~60-80%.
        const apiMessages: Anthropic.MessageParam[] = history.map((m, i) => {
          const isSecondToLast = i === history.length - 2 && history.length >= 2;
          return {
            role: m.role as "user" | "assistant",
            content: isSecondToLast
              ? [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }]
              : m.content,
          };
        });

        // Build context status line
        const serverContext = context ?? await buildServerChatContext("/");
        const contextLine = `Active: ${serverContext.pendingActions} pending · ${serverContext.coldLeads} cold leads · ${serverContext.draftPosts} drafts`;

        const systemPrompt = [
          {
            type: "text" as const,
            text: REVE_BRAND_SYSTEM,
            cache_control: { type: "ephemeral" as const },
          },
          {
            type: "text" as const,
            text: `You are AIRE — Caleb Jackson's always-on real estate AI at Rêve Realtors® Baton Rouge.
You have direct access to the CRM, pipeline, social media queue, and action queue. Execute first, confirm after.

${contextLine}
Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })}
Page: ${serverContext.page}

Rules:
- Be direct. Max 3 sentences unless listing items.
- Execute tool calls without asking permission — then confirm what you did.
- For social posts: Caleb's voice — authentic, never corporate. Banned: "dream home", "luxury lifestyle", "nestled", "stunning".
- Address Caleb by first name.
- Before pushing to Facebook or sending messages, confirm once.
- Geography: Baton Rouge, Zachary, St. Francisville, West Feliciana, EBR Parish.`,
          },
        ];

        // Agentic loop with streaming
        let assistantText = "";
        let toolCallsJson: string | null = null;

        for (let round = 0; round < 6; round++) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: systemPrompt,
            tools: TOOLS,
            messages: apiMessages,
            stream: false,
          });

          if (response.stop_reason === "tool_use") {
            const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const tu of toolUses) {
              send({ type: "tool_call", tool: tu.name, label: TOOL_LABELS[tu.name] ?? tu.name });
              const result = await executeTool(tu.name, tu.input as Record<string, unknown>);
              send({ type: "tool_result", tool: tu.name, summary: result.slice(0, 80) });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
            }

            toolCallsJson = JSON.stringify(toolUses.map(tu => ({ name: tu.name, input: tu.input })));
            apiMessages.push({ role: "assistant", content: response.content });
            apiMessages.push({ role: "user", content: toolResults });
          } else {
            const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
            assistantText = textBlock?.text ?? "Done.";

            // Stream the text word by word
            const words = assistantText.split(" ");
            for (const word of words) {
              send({ type: "delta", text: word + " " });
              await new Promise(r => setTimeout(r, 18));
            }
            send({ type: "done" });
            break;
          }
        }

        // Persist assistant message
        if (assistantText) {
          await prisma.chatMessage.create({
            data: { threadId: resolvedThreadId, role: "assistant", content: assistantText, toolCallsJson },
          });
          await prisma.chatThread.update({
            where: { id: resolvedThreadId },
            data: { updatedAt: new Date(), messageCount: { increment: 2 } },
          });
        }
      } catch (err) {
        logError("ai", "api/chat", err as Error);
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
      "X-Thread-Id": resolvedThreadId,
    },
  });
}
