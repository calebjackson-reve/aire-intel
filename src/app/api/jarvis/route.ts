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
  {
    name: "get_social_drafts",
    description: "List all social media posts currently in draft or scheduled status — shows caption, platform, scheduled date, quality score",
    input_schema: {
      type: "object" as const,
      properties: { status: { type: "string", enum: ["draft", "scheduled", "all"], description: "Filter by status (default: draft)" } },
    },
  },
  {
    name: "create_social_post",
    description: "Generate a new social media post draft using AI. Saves to the drafts queue automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string", description: "What the post is about — e.g. 'Basil Lane listing pool', 'why I do real estate', 'market update June'" },
        platform: { type: "string", enum: ["facebook", "instagram", "both"], description: "Target platform (default: both)" },
        post_type: { type: "string", description: "Type of post: just_listed | market_update | client_story | educational | personal | reel" },
        audience: { type: "string", description: "Target audience context e.g. '21-35 sphere', 'investors', 'first-time buyers'" },
        scheduled_for: { type: "string", description: "ISO datetime to schedule, e.g. '2026-06-18T19:00:00'" },
      },
      required: ["topic"],
    },
  },
  {
    name: "push_post_to_facebook",
    description: "Approve and push a draft post to Facebook as a scheduled post. Requires the post ID from get_social_drafts.",
    input_schema: {
      type: "object" as const,
      properties: { post_id: { type: "string", description: "The ScheduledPost ID to push" } },
      required: ["post_id"],
    },
  },
  {
    name: "score_caption",
    description: "Score a caption 0-100 for brand fit, engagement potential, and audience resonance. Returns score + improvement notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        caption: { type: "string", description: "The caption text to score" },
        audience: { type: "string", description: "Target audience context" },
      },
      required: ["caption"],
    },
  },
  {
    name: "sync_fb_insights",
    description: "Pull Facebook engagement data (reach, impressions, likes, comments) for all published posts and save to AIRE",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "search_zillow",
    description: "Search Zillow market data cached in AIRE. Returns active listings or recent sales for comp analysis. Covers Baton Rouge, Zachary, and St. Francisville.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: {
          type: "string",
          enum: ["baton-rouge", "zachary", "st-francisville", "all"],
          description: "Market to search (default: all)",
        },
        status: {
          type: "string",
          enum: ["for_sale", "recently_sold"],
          description: "Listing status (default: for_sale)",
        },
        max_price: { type: "number", description: "Max listing price filter" },
        min_price: { type: "number", description: "Min listing price filter" },
        min_beds: { type: "number", description: "Minimum bedrooms" },
        zip: { type: "string", description: "Filter by specific ZIP code" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
    },
  },
  {
    name: "refresh_zillow_market",
    description: "Trigger a fresh Zillow scrape for a market. Use when data is stale or you need current listings. Takes ~2 min.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: {
          type: "string",
          enum: ["baton-rouge", "zachary", "st-francisville"],
          description: "City to scrape (default: baton-rouge)",
        },
        status: {
          type: "string",
          enum: ["for_sale", "recently_sold"],
          description: "Which listings to fetch (default: for_sale)",
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

      case "get_social_drafts": {
        const statusFilter = (input.status as string) || "draft";
        const where = statusFilter === "all"
          ? { status: { in: ["draft", "scheduled"] } }
          : { status: statusFilter };
        const posts = await prisma.scheduledPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, platform: true, caption: true, status: true, scheduledFor: true, qualityScore: true, postType: true, postId: true },
        });
        if (!posts.length) return `No ${statusFilter} posts found.`;
        return posts.map(p =>
          `[${p.id}] ${p.platform} ${p.postType ?? ""} | ${p.status} | score: ${p.qualityScore ?? "unscored"} | ${p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "no time set"}\n${p.caption.slice(0, 120)}...`
        ).join("\n\n");
      }

      case "create_social_post": {
        const topic = input.topic as string;
        const platform = (input.platform as string) || "both";
        const postType = (input.post_type as string) || "personal";
        const audience = (input.audience as string) || "sphere, 21-35 Instagram";
        const scheduledFor = input.scheduled_for ? new Date(input.scheduled_for as string) : null;

        // Load evolved prompt if available
        const evolved = await prisma.setting.findFirst({ where: { key: { startsWith: "content.promptEvolution" } }, orderBy: { key: "desc" } });
        const evolutionContext = evolved ? `\n\nLEARNED PREFERENCES (from approved posts):\n${evolved.value}` : "";

        const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await aiClient.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: `You are writing social media captions for Caleb Jackson, REALTOR® at Rêve Realtors® in Baton Rouge.

VOICE: Authentic, personal, never marketing-speak. Writes like he's texting from the couch.
BANNED: "dream home", "luxury lifestyle", "nestled", "trusted advisor", "stunning", "just checking in"
TARGET AUDIENCE: ${audience}
CONTACT FOOTER: Caleb Jackson, REALTOR® / Rêve Realtors® · Baton Rouge, LA / (225) 747-0303 · caleb.jackson@reverealtors.com
${evolutionContext}

Write ONE caption. Short. Hook first. Real voice. No hashtags unless essential. Include contact footer on listing posts only.`,
          messages: [{ role: "user", content: `Write a ${postType} post about: ${topic}` }],
        });

        const caption = (msg.content[0] as Anthropic.TextBlock).text;

        // Score it
        const scoreMsg = await aiClient.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          system: "Score this real estate social caption 0-100. Criteria: brand voice authenticity (33pts), engagement hook strength (33pts), audience resonance for 21-35 sphere (34pts). Reply with ONLY a number.",
          messages: [{ role: "user", content: caption }],
        });
        const scoreText = (scoreMsg.content[0] as Anthropic.TextBlock).text.trim();
        const qualityScore = parseFloat(scoreText.match(/\d+(\.\d+)?/)?.[0] ?? "70");

        const post = await prisma.scheduledPost.create({
          data: {
            platform,
            caption,
            postType,
            status: "draft",
            qualityScore,
            scheduledFor,
          },
        });

        return `Created draft post [${post.id}] — score ${qualityScore}/100\n\n${caption}`;
      }

      case "push_post_to_facebook": {
        const postId = input.post_id as string;
        const origin = process.env.NEXT_PUBLIC_APP_URL || "https://aire-intel.vercel.app";
        const res = await fetch(`${origin}/api/social/drafts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: postId, action: "approve" }),
        });
        const data = await res.json() as { ok?: boolean; fbPostId?: string; error?: string; note?: string };
        if (data.ok) return `Pushed to Facebook ✓ — FB post ID: ${data.fbPostId ?? "scheduled draft"}${data.note ? ` (${data.note})` : ""}`;
        return `Push failed: ${data.error}`;
      }

      case "score_caption": {
        const caption = input.caption as string;
        const audience = (input.audience as string) || "21-35 Instagram sphere";
        const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await aiClient.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: `You are scoring a real estate social media caption for Caleb Jackson at Rêve Realtors® Baton Rouge. Target audience: ${audience}.
Score 0-100 across three dimensions:
- Brand voice authenticity (33pts): sounds like a real person, no corporate speak, Caleb's tone
- Engagement hook (33pts): first line stops the scroll, creates curiosity or emotion
- Audience resonance (34pts): speaks to this specific audience's concerns and desires

Reply in this format:
SCORE: [number]
VOICE: [score]/33 — [one sentence]
HOOK: [score]/33 — [one sentence]
RESONANCE: [score]/34 — [one sentence]
FIX: [one specific improvement]`,
          messages: [{ role: "user", content: caption }],
        });
        return (msg.content[0] as Anthropic.TextBlock).text;
      }

      case "sync_fb_insights": {
        const tokenRow = await prisma.setting.findUnique({ where: { key: "META_PAGE_ACCESS_TOKEN" } });
        const token = tokenRow?.value ?? process.env.META_PAGE_ACCESS_TOKEN;
        if (!token) return "No Facebook token configured.";

        const published = await prisma.scheduledPost.findMany({
          where: { status: { in: ["scheduled", "approved"] }, postId: { not: null } },
          select: { id: true, postId: true },
        });
        if (!published.length) return "No published posts to sync.";

        let synced = 0;
        for (const post of published) {
          try {
            const res = await fetch(
              `https://graph.facebook.com/v21.0/${post.postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&access_token=${token}`
            );
            const data = await res.json() as { data?: Array<{ name: string; values?: Array<{ value: number }> }>; error?: { message: string } };
            if (data.error || !data.data) continue;

            const get = (name: string) => data.data?.find(d => d.name === name)?.values?.[0]?.value ?? null;
            const impressions = get("post_impressions");
            const reach = get("post_impressions_unique");
            const engagement = get("post_engaged_users");
            const engagementRate = reach && engagement ? Math.round((engagement / reach) * 1000) / 10 : null;

            await prisma.scheduledPost.update({
              where: { id: post.id },
              data: { impressions, reach, engagement, engagementRate, publishedAt: new Date() },
            });
            synced++;
          } catch { /* skip individual failures */ }
        }
        return `Synced Facebook insights for ${synced}/${published.length} posts.`;
      }

      case "search_zillow": {
        const city = (input.city as string | undefined) ?? "all";
        const status = (input.status as string | undefined) ?? "for_sale";
        const limit = Math.min((input.limit as number | undefined) ?? 10, 30);

        type ZillowListingWhere = {
          status: string;
          city?: { contains: string; mode: "insensitive" };
          zip?: string;
          price?: { gte?: number; lte?: number };
          beds?: { gte: number };
        };

        const where: ZillowListingWhere = { status };

        if (city !== "all") {
          const cityNameMap: Record<string, string> = {
            "baton-rouge": "baton rouge",
            "zachary": "zachary",
            "st-francisville": "saint francisville",
          };
          const fragment = cityNameMap[city] ?? city.replace("-", " ");
          where.city = { contains: fragment, mode: "insensitive" };
        }

        if (input.zip) where.zip = input.zip as string;

        if (input.min_price !== undefined || input.max_price !== undefined) {
          where.price = {};
          if (input.min_price !== undefined) where.price.gte = input.min_price as number;
          if (input.max_price !== undefined) where.price.lte = input.max_price as number;
        }

        if (input.min_beds !== undefined) {
          where.beds = { gte: input.min_beds as number };
        }

        const listings = await prisma.zillowListing.findMany({
          where,
          orderBy: status === "recently_sold" ? { soldDate: "desc" } : { daysOnMarket: "asc" },
          take: limit,
          select: {
            zpid: true, address: true, city: true, zip: true,
            price: true, beds: true, baths: true, sqft: true,
            daysOnMarket: true, zestimate: true, status: true,
            soldPrice: true, soldDate: true, listingUrl: true,
            propertyType: true, yearBuilt: true, hoaFee: true,
            scrapedAt: true,
          },
        });

        if (!listings.length) {
          const oldest = await prisma.zillowListing.findFirst({
            where: { status },
            orderBy: { scrapedAt: "desc" },
            select: { scrapedAt: true },
          });
          const ageMsg = oldest
            ? `Last scrape was ${Math.round((Date.now() - oldest.scrapedAt.getTime()) / 3_600_000)}h ago.`
            : "No Zillow data in DB yet.";
          return `No ${status.replace("_", " ")} listings found for ${city}. ${ageMsg} Try "refresh zillow market" to scrape fresh data.`;
        }

        const cacheAge = Math.round((Date.now() - listings[0].scrapedAt.getTime()) / 3_600_000);
        const lines = [`${listings.length} ${status.replace("_", " ")} listings (cache: ${cacheAge}h old):`];

        for (const l of listings) {
          const priceStr = l.price ? `$${l.price.toLocaleString()}` : "price N/A";
          const zestStr = l.zestimate ? ` | zest $${l.zestimate.toLocaleString()}` : "";
          const domStr = l.daysOnMarket != null ? ` | ${l.daysOnMarket}d on market` : "";
          const soldStr = l.soldPrice ? ` | sold $${l.soldPrice.toLocaleString()}` : "";
          const soldDateStr = l.soldDate ? ` (${new Date(l.soldDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "";
          lines.push(
            `${l.address}, ${l.city} ${l.zip} — ${priceStr} · ${l.beds ?? "?"}bd/${l.baths ?? "?"}ba${l.sqft ? ` · ${l.sqft.toLocaleString()}sqft` : ""}${domStr}${zestStr}${soldStr}${soldDateStr}`
          );
        }

        return lines.join("\n");
      }

      case "refresh_zillow_market": {
        const city = (input.city as string | undefined) ?? "baton-rouge";
        const status = (input.status as string | undefined) ?? "for_sale";
        const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const res = await fetch(`${origin}/api/zillow/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city, status, force: false }),
        });
        const data = await res.json() as {
          ok?: boolean; cached?: boolean; message?: string;
          fetched?: number; upserted?: number; error?: string;
        };
        if (data.cached) return `Zillow data for ${city} is already fresh. ${data.message}`;
        if (data.ok) return `Zillow scrape complete — ${data.fetched} listings fetched, ${data.upserted} saved to DB.`;
        return `Scrape failed: ${data.error ?? "unknown error"}`;
      }

      case "search_memory": {
        const query = input.query as string;
        const types = input.types as string[] | undefined;
        const limit = (input.limit as number | undefined) ?? 8;

        const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const res = await fetch(`${origin}/api/search/semantic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, types, limit }),
        });

        if (!res.ok) return "Memory search unavailable.";

        const data = await res.json() as {
          results: Array<{
            sourceType: string;
            sourceId: string;
            leadName: string | null;
            excerpt: string;
            sourceAt: string;
            rank: number;
          }>;
          total: number;
        };

        if (!data.results.length) {
          return `No results found for "${query}". The index may need rebuilding — try POST /api/search/index/rebuild.`;
        }

        return data.results.map((r, i) => {
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
You have direct access to the CRM, pipeline, content queue, action queue, and social media. You can execute actions — send messages, skip items, run agents, look up leads, create posts, push to Facebook.

Current context: ${JSON.stringify(context ?? {})}
Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}

Operating rules:
- Be brief and direct. Max 2 sentences unless listing items.
- When you execute something, confirm what you did in one sentence.
- Don't ask for permission before looking something up or creating a draft — just do it.
- Do ask "via SMS or email?" before sending a message if channel is ambiguous.
- For social posts: write in Caleb's authentic voice — never corporate speak. Banned words: "dream home", "luxury lifestyle", "nestled", "stunning", "trusted advisor".
- Caleb's contact footer for listing posts: Caleb Jackson, REALTOR® / Rêve Realtors® · Baton Rouge, LA / (225) 747-0303 · caleb.jackson@reverealtors.com
- Caleb's market: Baton Rouge LA — EBR Parish, Zachary, St. Francisville, West Feliciana.
- Tone: efficient, no filler, Jarvis-level clarity.
- Social media audience: 21-35 Instagram sphere unless otherwise specified.`;

        // Agentic loop — run until no more tool calls
        for (let round = 0; round < 5; round++) {
          const response = await client.messages.create({
            model: "claude-opus-4-8",
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
