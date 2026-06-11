// Morning Brief — nested sub-agent functions
// Each function is fully isolated: fetches + summarises its own data source,
// returns null on any error (never throws), safe for Promise.allSettled.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { getMortgageRate, getRateAlert } from "./housing-intel";
import { getMarketStats } from "./rentcast";
import { fetchViralListings, ZillowProperty } from "./zillow";
import { fetchUpcomingEvents, CalendarEvent } from "./google-calendar";

// ── Shared Haiku client ────────────────────────────────────────────────────

function haikuClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

async function oneSentence(prompt: string): Promise<string> {
  const client = haikuClient();
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 80,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}

// ── 1. Rate sub-agent ──────────────────────────────────────────────────────

export interface RateSubagentResult {
  rate: number;
  delta: number;
  alert: { triggered: boolean; direction: "up" | "down" | "flat"; message: string };
  summary: string;
}

export async function fetchRateSubagent(): Promise<RateSubagentResult | null> {
  try {
    const [snap, alert] = await Promise.all([getMortgageRate(), getRateAlert(0.125)]);

    const summaryPrompt = `Write one short sentence (under 20 words) summarising this mortgage rate data for a Baton Rouge realtor's morning brief. Rate: ${snap.current}%, ${alert.direction === "down" ? "down" : alert.direction === "up" ? "up" : "unchanged"} ${Math.abs(snap.delta).toFixed(3)}% from last week. ${alert.triggered ? alert.message : ""}`;

    const summary = await oneSentence(summaryPrompt).catch(
      () => `30-yr fixed: ${snap.current}% (${snap.delta >= 0 ? "+" : ""}${snap.delta.toFixed(3)}% WoW).`
    );

    return {
      rate: snap.current,
      delta: snap.delta,
      alert: {
        triggered: alert.triggered,
        direction: alert.direction,
        message: alert.message,
      },
      summary,
    };
  } catch {
    return null;
  }
}

// ── 2. Market sub-agent ────────────────────────────────────────────────────

export interface MarketSubagentResult {
  medianPrice: number | null;
  daysOnMarket: number | null;
  summary: string;
}

export async function fetchMarketSubagent(zipCode: string): Promise<MarketSubagentResult | null> {
  try {
    const stats = await getMarketStats(zipCode);

    const summaryPrompt = `One sentence (under 25 words) for a Baton Rouge realtor's morning brief. Market stats for ${zipCode}: median price $${Math.round((stats.medianPrice ?? 0) / 1000)}k, avg DOM ${stats.averageDaysOnMarket ?? "unknown"} days, ${stats.totalListings ?? "unknown"} active listings.`;

    const summary = await oneSentence(summaryPrompt).catch(
      () =>
        `BR ${zipCode}: median $${Math.round((stats.medianPrice ?? 0) / 1000)}k, ${stats.averageDaysOnMarket ?? "—"}d DOM.`
    );

    return {
      medianPrice: stats.medianPrice,
      daysOnMarket: stats.averageDaysOnMarket,
      summary,
    };
  } catch {
    return null;
  }
}

// ── 3. Calendar sub-agent ──────────────────────────────────────────────────

export interface CalendarSubagentResult {
  appointments: CalendarEvent[];
  summary: string;
}

export async function fetchCalendarSubagent(): Promise<CalendarSubagentResult | null> {
  try {
    // Check for google token in Setting table
    const tokenRow = await prisma.setting
      .findUnique({ where: { key: "GOOGLE_ACCESS_TOKEN" } })
      .catch(() => null);

    if (!tokenRow?.value && !process.env.GOOGLE_ACCESS_TOKEN) {
      return null;
    }

    // Fetch events for the next 8 hours
    const now = new Date();
    const in8h = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const allEvents = await fetchUpcomingEvents(1); // next 1 day
    const appointments = allEvents.filter((e) => {
      if (!e.start) return false;
      const start = new Date(e.start);
      return start >= now && start <= in8h;
    });

    if (appointments.length === 0) {
      return { appointments: [], summary: "No appointments in the next 8 hours." };
    }

    const eventList = appointments
      .map((e) => `${new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}: ${e.title}`)
      .join("; ");

    const summaryPrompt = `One sentence (under 30 words) for a Baton Rouge realtor's morning brief summarising these next-8h calendar events: ${eventList}`;

    const summary = await oneSentence(summaryPrompt).catch(
      () => `${appointments.length} appointment${appointments.length > 1 ? "s" : ""} in the next 8 hours: ${eventList}.`
    );

    return { appointments, summary };
  } catch {
    return null;
  }
}

// ── 4. Zillow sub-agent ────────────────────────────────────────────────────

export interface ZillowSubagentResult {
  listings: ZillowProperty[];
  summary: string;
}

export async function fetchZillowSubagent(): Promise<ZillowSubagentResult | null> {
  try {
    const listings = await fetchViralListings(5);

    if (listings.length === 0) {
      return { listings: [], summary: "No trending Zillow listings found." };
    }

    const topListing = listings[0];
    const summaryPrompt = `One sentence (under 25 words) for a Baton Rouge realtor's morning brief. Top Zillow trending listing: ${topListing.address}, $${topListing.price ? Math.round(topListing.price / 1000) + "k" : "price unknown"}, ${topListing.viewCount?.toLocaleString() ?? "unknown"} views.`;

    const summary = await oneSentence(summaryPrompt).catch(
      () =>
        `${listings.length} trending Zillow listing${listings.length > 1 ? "s" : ""} — top: ${topListing.address} (${topListing.viewCount?.toLocaleString() ?? "—"} views).`
    );

    return { listings, summary };
  } catch {
    return null;
  }
}

// ── 5. Lead activity sub-agent ─────────────────────────────────────────────

export interface HotLead {
  id: string;
  name: string;
  stage: string;
  lastContactDate: Date | null;
  score: number | null;
  phone: string | null;
  email: string | null;
}

export interface LeadActivitySubagentResult {
  hotLeads: HotLead[];
  summary: string;
}

export async function fetchLeadActivitySubagent(): Promise<LeadActivitySubagentResult | null> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    // Active leads with recent contact (within 7 days) — "hot" because recently engaged
    const hotLeads = await prisma.lead.findMany({
      where: {
        stage: "active",
        lastContactDate: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        name: true,
        stage: true,
        lastContactDate: true,
        phone: true,
        email: true,
      },
      orderBy: { lastContactDate: "desc" },
      take: 5,
    });

    if (hotLeads.length === 0) {
      return { hotLeads: [], summary: "No recently-active leads in the last 7 days." };
    }

    const leadList = hotLeads.map((l) => l.name).join(", ");
    const summaryPrompt = `One sentence (under 25 words) for a Baton Rouge realtor's morning brief. ${hotLeads.length} hot active leads with recent contact: ${leadList}.`;

    const summary = await oneSentence(summaryPrompt).catch(
      () => `${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""} with recent activity: ${leadList}.`
    );

    // Map to HotLead shape — score not on Lead model directly, use null
    const mapped: HotLead[] = hotLeads.map((l) => ({
      id: l.id,
      name: l.name,
      stage: l.stage,
      lastContactDate: l.lastContactDate,
      score: null,
      phone: l.phone,
      email: l.email,
    }));

    return { hotLeads: mapped, summary };
  } catch {
    return null;
  }
}
