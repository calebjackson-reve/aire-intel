export const dynamic = "force-dynamic";
// Reel/video script + ideas engine. Trend/format-driven: the caller picks a reel
// FORMAT (or "auto") and a beat (listing / market / client / topic); Claude returns
// three hook options, a ready-to-shoot script, a shot list, a caption, and a
// self-scored virality read. Mirrors /api/posts (Sonnet + streaming + prompt cache)
// so the /create-post Reel/Video mode can stream it the same way.
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_REEL_SCRIPT_SYSTEM } from "@/lib/reve-system-prompt";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

// Keep in sync with the REEL FORMAT LIBRARY in reve-system-prompt.ts.
const REEL_FORMATS = new Set([
  "auto",
  "listing_reveal",
  "transformation",
  "wait_for_it",
  "market_take",
  "client_story",
  "list_mistakes",
  "hyperlocal_tour",
]);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { format, address, price, rawNotes, platform, leadId } = body;

  const chosenFormat = REEL_FORMATS.has(format) ? format : "auto";
  const formatLabel = chosenFormat.replace(/_/g, " ");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      try {
        const anthropicStream = getClient().messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: [
            {
              type: "text",
              text: REVE_REEL_SCRIPT_SYSTEM,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Write a reel/video script for:
Format: ${chosenFormat === "auto" ? "auto (you pick the best-fitting format from the library)" : formatLabel}
Address: ${address || "not specified"}
Price: ${price ? `$${Number(price).toLocaleString()}` : "not specified"}
Platform: ${platform || "instagram"}
Beat / raw notes: ${rawNotes || "not specified"}

Output the five sections: HOOK OPTIONS, SCRIPT, SHOT LIST, CAPTION, VIRALITY READ.`,
            },
          ],
        });

        let fullText = "";

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            fullText += chunk.delta.text;
            if (!isClosed) {
              try {
                controller.enqueue(encoder.encode(chunk.delta.text));
              } catch {
                isClosed = true;
              }
            }
          }
        }

        // Persist after the stream completes. Reuse the existing GeneratedPost model
        // (no migration): map the reel sections onto its caption/slideCopy/motionSpec.
        const sections = parseReelSections(fullText);
        await prisma.generatedPost.create({
          data: {
            leadId: leadId || null,
            postType: `reel:${chosenFormat}`,
            address: address || null,
            price: price ? parseFloat(price) : null,
            rawNotes: rawNotes || null,
            platform: platform || "instagram",
            caption: sections.caption,
            slideCopy: [sections.script, sections.shotList].filter(Boolean).join("\n\n---\n\n"),
            motionSpec: [sections.hookOptions, sections.viralityRead].filter(Boolean).join("\n\n---\n\n"),
          },
        });

        isClosed = true;
        controller.close();
      } catch (err) {
        if (!isClosed) {
          isClosed = true;
          controller.error(err);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

function parseReelSections(text: string) {
  const grab = (heading: string, next: string) =>
    text.match(new RegExp(`###\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=###\\s*${next}|$)`, "i"))?.[1]?.trim() || "";

  return {
    hookOptions: grab("HOOK OPTIONS", "SCRIPT"),
    script: grab("SCRIPT", "SHOT LIST"),
    shotList: grab("SHOT LIST", "CAPTION"),
    caption: grab("CAPTION", "VIRALITY READ"),
    viralityRead: grab("VIRALITY READ", "$"),
  };
}
