export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logError } from "@/lib/error-memory";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

const PAGE_CONTEXT: Record<string, string> = {
  "/": "the AIRE Operations Dashboard — shows pipeline counts, cold leads (5+ days no contact), and the morning brief generator",
  "/pipeline": "the Pipeline Kanban board — 5 columns: New Lead, Active, Showing, Under Contract, Closed. Drag cards to move deals. Click 'AI FOLLOW-UP' on any card to generate a text message. Click '+ ADD LEAD' to add a new contact.",
  "/create-post": "the Post Generator — pick a post type, platform, fill in address/price/raw notes, hit Generate. Claude streams a caption, slide copy, and motion spec locked to Rêve brand. Copy buttons on each section.",
  "/mls": "the embedded Paragon MLS — full MLS access inside AIRE. Search listings, pull comps, export. Use the toolbar at the top to navigate within MLS.",
  "/crm": "the embedded Rêve CRM (Lofty) — full CRM access inside AIRE. Manage leads, set tasks, run campaigns. Use the toolbar at the top to navigate.",
  "/apps": "the Apps Hub — quick launch for all external tools: Paragon MLS, Rêve CRM, Google Calendar, DocuSign. Click any app to open it embedded in AIRE.",
};

export async function POST(request: NextRequest) {
  const { messages, page } = await request.json();

  const pageInfo = PAGE_CONTEXT[page] || `the ${page} page of AIRE`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const anthropicStream = getClient().messages.stream({
        model: "claude-fable-5",
        max_tokens: 512,
        system: [
          {
            type: "text",
            text: `You are the AIRE assistant — Caleb Jackson's AI guide inside the AIRE platform for Rêve Realtors®.

You are currently on: ${pageInfo}

Your job:
- Help Caleb and his team navigate and use whichever page they're on
- Answer questions about the current tool or feature
- Give quick, specific instructions (not paragraphs)
- Know Caleb's context: luxury REALTOR® in Baton Rouge LA, service area includes Zachary, St. Francisville, New Roads, The Felicianas
- Keep responses under 4 sentences unless a step-by-step is genuinely needed
- Tone: direct, dry, no filler phrases like "Great question!"

If they ask about something outside the current page, tell them which page to go to.
If they ask about a deal or lead, remind them the Pipeline is at /pipeline.
If they ask about creating content, the Post Generator is at /create-post.`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      });

      try {
        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        await logError("ai", "/api/assistant", err);
        controller.enqueue(encoder.encode("\n\n[AI error logged — check /system for details]"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
