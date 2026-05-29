import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_POST_ENGINE_SYSTEM } from "@/lib/reve-system-prompt";
import { buildContentAudit } from "@/lib/meta-insights";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

// Build a one-paragraph performance brief from Meta insights so Claude
// can tailor the new post to what's actually been working for this audience.
async function buildPerformanceBrief(): Promise<string> {
  const audit = await buildContentAudit();
  if (audit.totalPosts < 5) return "";

  const lines: string[] = ["AUDIENCE PERFORMANCE DATA — use these signals to tailor the post:"];
  audit.trends.forEach(t => lines.push(`- ${t.signal}: ${t.detail}`));
  if (audit.byType.length > 0) {
    lines.push("- Post type engagement rates (best → worst):");
    audit.byType.forEach(t => {
      lines.push(`    ${t.type}: ${(t.avgEngagementRate * 100).toFixed(1)}% avg engagement (${t.count} posts)`);
    });
  }
  if (audit.topPosts.length > 0) {
    lines.push("- What worked recently (top performing posts):");
    audit.topPosts.slice(0, 3).forEach(p => {
      lines.push(`    "${p.caption.slice(0, 80)}…" → ${(p.engagementRate * 100).toFixed(1)}% engagement`);
    });
  }
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { postType, address, price, rawNotes, platform, leadId } = body;

  const performanceBrief = await buildPerformanceBrief();

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
              text: REVE_POST_ENGINE_SYSTEM,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Generate a post for:
Type: ${postType}
Address: ${address || "not specified"}
Price: ${price ? `$${price.toLocaleString()}` : "not specified"}
Platform: ${platform || "instagram"}
Raw notes: ${rawNotes}

${performanceBrief ? performanceBrief + "\n\n" : ""}Output the three sections: CAPTION, SLIDE COPY, MOTION SPEC.`,
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

        // Save to DB after stream completes
        const sections = parsePostSections(fullText);
        await prisma.generatedPost.create({
          data: {
            leadId: leadId || null,
            postType,
            address,
            price: price ? parseFloat(price) : null,
            rawNotes,
            platform: platform || "instagram",
            caption: sections.caption,
            slideCopy: sections.slideCopy,
            motionSpec: sections.motionSpec,
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

function parsePostSections(text: string) {
  const captionMatch = text.match(/###\s*CAPTION\s*([\s\S]*?)(?=###\s*SLIDE|$)/i);
  const slideMatch = text.match(/###\s*SLIDE COPY\s*([\s\S]*?)(?=###\s*MOTION|$)/i);
  const motionMatch = text.match(/###\s*MOTION SPEC\s*([\s\S]*?)$/i);

  return {
    caption: captionMatch?.[1]?.trim() || "",
    slideCopy: slideMatch?.[1]?.trim() || "",
    motionSpec: motionMatch?.[1]?.trim() || "",
  };
}
