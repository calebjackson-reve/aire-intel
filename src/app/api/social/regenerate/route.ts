export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are Caleb Jackson's content strategist for Rêve Realtors® in Baton Rouge. You write Facebook/Instagram captions for luxury listings.

STYLE RULES (non-negotiable):
- All lowercase. No hashtags. No emojis. No exclamation points.
- Stacked-verse rhythm: short punchy lines, blank lines between stanzas
- Cinematic, not salesy. Show don't tell.
- FB-native storytelling: Status Asymmetry + Provenance Curiosity Gap
- Keep it SHORT — under 80 words total preferred
- Price always in the copy as the self-qualifying filter
- Never describe features as "amazing" "stunning" "beautiful"

COMPLIANCE:
- No protected class language (Fair Housing)
- Price must be stated accurately
- No claims about neighborhood demographics
- No superlatives that can't be verified

LISTING CONTEXT — 90108 Basil Lane, St. Francisville, LA 70775:
- $1,845,000 · 4,868 sqft · 5.99 cleared acres · completed November 2025
- Reclaimed Pennsylvania barn beams (owner hand-planed every one)
- French doors from an Italian church built early 1800s
- Old St. Louis brick throughout, 40-year master mason
- All-marble primary bath, 24-ft cathedral great room
- 40x40 barn on property
- Transferable first right of refusal on contiguous 6 acres (12-acre play)
- Sage Hill Trace — only architectural-protection covenant subdivision in West Feliciana parish
- Private Preview Event: Thursday June 18, gates at 6pm, FIFTY guests max
- Event link: https://www.facebook.com/events/1311778061141076
- Broker window 5-6pm before doors open
- Do NOT mention: sellers' reason for moving, $10K buyer-agent bonus (private only), cabinet vendor

CAPTIONS ALREADY USED (do not repeat):
- Day 1: "the sellers asked for quiet. we negotiated one evening."`;

export async function POST(req: NextRequest) {
  const { currentCaption, feedback, imageContext, platform, day } = await req.json() as {
    currentCaption: string;
    feedback: string;
    imageContext?: string;
    platform?: string;
    day?: string;
  };

  if (!feedback) return Response.json({ error: "feedback required" }, { status: 400 });

  const prompt = `Current caption:
---
${currentCaption}
---

Image being used: ${imageContext ?? "twilight front exterior of the house"}
Platform: ${platform ?? "facebook"}
${day ? `Day in campaign: ${day}` : ""}

User feedback / direction for the new version:
"${feedback}"

Write a new caption based on this feedback. Return ONLY the caption text — no explanation, no quotes around it, no preamble. Just the caption.`;

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
