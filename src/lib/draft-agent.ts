// Communication Agent — voice-matched draft generation (AIRE Platform)
//
// Generates ONE message for a lead that sounds like Caleb actually typed it, by
// layering his mined voice corpus (buildVoiceSystemBlock) onto the pipeline system
// prompt. Used by /api/drafts (manual/follow-up) and /api/revival/run (dead-lead
// revival). This module NEVER sends anything — it only produces draft text that
// lands in the approve queue.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { REVE_PIPELINE_SYSTEM } from "./reve-system-prompt";
import { getVoiceCorpus, mineVoiceCorpus, buildVoiceSystemBlock } from "./voice-corpus";

export type DraftChannel = "text" | "email";
export type DraftSource = "revival" | "followup" | "manual" | "reply_to_inbound" | "sphere_reactivation" | "intent_revival"; // AIRE: loop:inbound-reply-handler // AIRE: loop:sphere-reactivation // AIRE: loop:propstream-intent-revival

export interface GeneratedDraft {
  channel: DraftChannel;
  subject: string | null;
  body: string;
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** Build the voice-aware system prompt: pipeline rules + Caleb's real-message corpus. */
async function buildSystem(): Promise<string> {
  // Prefer the curated/saved corpus; fall back to a fresh mine if none saved yet.
  let corpus = await getVoiceCorpus();
  if (corpus.length === 0) corpus = await mineVoiceCorpus(50);
  const voiceBlock = buildVoiceSystemBlock(corpus, 8);
  return `${REVE_PIPELINE_SYSTEM}\n\n${voiceBlock}`;
}

const INTENT_BY_SOURCE: Record<DraftSource, string> = {
  revival:
    "This lead went cold — old, never replied. Re-open the door with ONE low-pressure, human message. No guilt, no 'just checking in'. Give a concrete reason to reply now (a specific listing, a market shift in their area, an honest 'still looking?').",
  followup:
    "Move this lead forward from where they are. Reference their real history and make the next step small and obvious.",
  manual:
    "Write a natural message appropriate to where this lead is in the pipeline.",
  // AIRE: loop:inbound-reply-handler
  reply_to_inbound:
    "A lead just replied to your outreach. Acknowledge their reply warmly and move the conversation forward — confirm the showing time, lock in a call, or answer their question directly. Keep it brief and human. Never start with 'Great!' or 'Absolutely!'.",
  // AIRE: loop:sphere-reactivation
  sphere_reactivation:
    "This is a sphere contact — someone in Caleb's personal network, past client, or community connection. Write a warm, genuine check-in that sounds like it came from a friend, not an agent. Make it personal and brief. No pitch, no CTA pressure. Just reconnect.",
  // AIRE: loop:propstream-intent-revival
  intent_revival:
    "This cold lead has real intent signals — there's new listing activity or price movement in their target area right now. Reference the specific listing or market shift mentioned in Extra direction. One low-pressure message that gives them a concrete reason to re-engage today. No guilt, no 'just checking in'. Make it feel timely and specific.",
};

/**
 * Generate a single voice-matched draft for a lead.
 * Throws if the lead can't be found. Returns the channel/subject/body to persist.
 */
export async function generateDraft(opts: {
  leadId: string;
  channel?: DraftChannel;
  source: DraftSource;
  instruction?: string; // optional extra steer from the caller
}): Promise<GeneratedDraft> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: opts.leadId },
    include: { timeline_logs: { orderBy: { createdAt: "desc" }, take: 6 } },
  });

  // Default channel: text if we have a phone, else email.
  const channel: DraftChannel =
    opts.channel ?? (lead.phone ? "text" : lead.email ? "email" : "text");

  const daysSince = lead.lastContactDate
    ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86_400_000)
    : null;

  const history = lead.timeline_logs.map((c) => ({
    method: c.method,
    direction: c.direction,
    note: c.note?.slice(0, 200),
    date: c.createdAt,
  }));

  const channelRule =
    channel === "email"
      ? `Output an EMAIL. First line is "Subject: <short, specific, lowercase-ok subject>". Then a blank line, then the body (max ~5 sentences).`
      : `Output a TEXT message only. Under 3 sentences. No subject line, no signature block.`;

  const system = await buildSystem();

  const response = await getClient().messages.create({
    model: "claude-fable-5",
    max_tokens: 400,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `${INTENT_BY_SOURCE[opts.source]}
${opts.instruction ? `\nExtra direction: ${opts.instruction}\n` : ""}
Lead:
- Name: ${lead.name}
- Type: ${lead.type}
- Stage: ${lead.stage}
- Areas: ${lead.areas || "unknown"}
- Price point: ${lead.pricePoint ? `$${lead.pricePoint.toLocaleString()}` : "unknown"}
- Timeline: ${lead.timeline || "unknown"}
- Motivation: ${lead.motivation || "unknown"}
- Days since last contact: ${daysSince ?? "never contacted"}
- Recent history: ${JSON.stringify(history)}
- Notes: ${lead.notes || "none"}

${channelRule}
Write in Caleb's real voice (match the examples). Output ONLY the message — no preamble, no quotes, no "here's a draft".`,
      },
    ],
  });

  const raw = response.content.find((b) => b.type === "text")?.text?.trim() ?? "";

  if (channel === "email") {
    const m = raw.match(/^subject:\s*(.+?)\s*\n+([\s\S]+)$/i);
    if (m) return { channel, subject: m[1].trim(), body: m[2].trim() };
    return { channel, subject: null, body: raw };
  }
  return { channel, subject: null, body: raw };
}
