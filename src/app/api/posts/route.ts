export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_POST_ENGINE_SYSTEM } from "@/lib/reve-system-prompt";
import { buildContentAudit } from "@/lib/meta-insights";
import { QualityFlag } from "@/lib/content-quality";
import { generateUntilPasses } from "@/lib/content-gate";
import { getSetting } from "@/lib/settings";
import { getLearnedStyleGuidance, getLocalHashtagGuidance } from "@/lib/content-preferences";

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

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

function buildEscalation(score: number, flags: QualityFlag[]): string {
  const issues = flags.map(f => `- ${f.detail}`).join("\n");
  return `\n\n---\nPrevious attempt scored ${score}/100. Fix these issues specifically — do not restate this preamble, just output corrected sections:\n${issues}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { postType, address, price, rawNotes, platform, leadId } = body;

  const [performanceBrief, promptDeltaRaw, versionRaw, learnedGuidance] = await Promise.all([
    buildPerformanceBrief(),
    getSetting("content.promptEvolution.v" + await getSetting("content.promptVersion").then(v => v ?? "0")).catch(() => null),
    getSetting("content.promptVersion").catch(() => null),
    getLearnedStyleGuidance(),
  ]);

  const promptVersion = parseInt(versionRaw ?? "0");
  let systemText = promptDeltaRaw
    ? `${REVE_POST_ENGINE_SYSTEM}\n\n## EVOLVED PREFERENCES (learned from your feedback — v${promptVersion})\n${promptDeltaRaw}`
    : REVE_POST_ENGINE_SYSTEM;
  if (learnedGuidance) {
    systemText = `${systemText}\n\n## ${learnedGuidance}`;
  }
  systemText = `${systemText}\n\n## ${getLocalHashtagGuidance(platform || "instagram")}`;

  const baseUserContent = `Generate a post for:
Type: ${postType}
Address: ${address || "not specified"}
Price: ${price ? `$${price.toLocaleString()}` : "not specified"}
Platform: ${platform || "instagram"}
Raw notes: ${rawNotes}

${performanceBrief ? performanceBrief + "\n\n" : ""}Output the three sections: CAPTION, SLIDE COPY, MOTION SPEC.`;

  const system: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
  ];

  // Run gate: up to 3 non-streaming attempts server-side; stream winner to client
  const gateResult = await generateUntilPasses(
    async (attempt, lastScore, lastFlags) => {
      const userContent = attempt === 1 || !lastScore || !lastFlags
        ? baseUserContent
        : baseUserContent + buildEscalation(lastScore, lastFlags);

      const res = await getClient().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: userContent }],
      });
      return res.content.find((b): b is Anthropic.Messages.TextBlock => b.type === "text")?.text ?? "";
    },
    { outputType: "post", platform: platform || "instagram" }
  );

  const encoder = new TextEncoder();
  const tempId = `gp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream({
    start(controller) {
      // Stream the winner's text in chunks (smooth UX, same as before)
      const text = gateResult.content;
      const chunkSize = 48;
      for (let i = 0; i < text.length; i += chunkSize) {
        controller.enqueue(encoder.encode(text.slice(i, i + chunkSize)));
      }

      // Send __meta with gate result info
      const attemptLabel = gateResult.passed
        ? gateResult.attempts === 1 ? "Passed on first attempt" : `Passed on attempt ${gateResult.attempts}`
        : `⚠ Best of ${gateResult.attempts} — ${gateResult.quality.score}/100`;

      const metaPayload = JSON.stringify({
        __meta: true,
        postId: tempId,
        quality: gateResult.quality,
        attempts: gateResult.attempts,
        passed: gateResult.passed,
        attemptLabel,
      });
      controller.enqueue(encoder.encode(`\n\n${metaPayload}`));
      controller.close();

      // Background DB save
      const sections = parsePostSections(gateResult.content);
      prisma.generatedPost.create({
        data: {
          id: tempId,
          leadId: leadId || null,
          postType,
          address,
          price: price ? parseFloat(price) : null,
          rawNotes,
          platform: platform || "instagram",
          caption: sections.caption,
          slideCopy: sections.slideCopy,
          motionSpec: sections.motionSpec,
          qualityScore: gateResult.quality.score,
          qualityFlags: JSON.stringify(gateResult.quality.flags),
          promptVersion,
          attempts: gateResult.attempts,
        },
      }).catch(() => { /* best-effort */ });
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
  const slideMatch   = text.match(/###\s*SLIDE COPY\s*([\s\S]*?)(?=###\s*MOTION|$)/i);
  const motionMatch  = text.match(/###\s*MOTION SPEC\s*([\s\S]*?)$/i);
  return {
    caption:   captionMatch?.[1]?.trim() || "",
    slideCopy: slideMatch?.[1]?.trim() || "",
    motionSpec: motionMatch?.[1]?.trim() || "",
  };
}
