export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contentProjectId = searchParams.get("contentProjectId");
    const recipeId = searchParams.get("recipeId");

    let brief = "";
    let captionDraft = "";
    let motionSpec = "";

    if (contentProjectId) {
      const project = await prisma.contentProject.findUnique({ where: { id: contentProjectId } });
      brief = project?.brief ?? "";
      captionDraft = project?.captionDraft ?? "";
      motionSpec = project?.motionSpec ?? "";
    }

    let recipeContext = "";
    if (recipeId) {
      const recipe = await prisma.videoRecipe.findUnique({ where: { id: recipeId } });
      if (recipe?.hookPatterns) {
        const patterns = recipe.hookPatterns as { archetype?: string; formula?: string }[];
        recipeContext = `Reference hook patterns: ${patterns.map((p) => `${p.archetype}: ${p.formula}`).join("; ")}`;
      }
    }

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `You are the Video Brain for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.
Generate a CapCut production brief — precise shot-by-shot instructions for editing in CapCut.

Brand: morningside.studio tier — slow, cinematic, luxury, Southern Baton Rouge. No Canva energy.
Format the brief in clean markdown the editor can open in Notes or email.`,
      messages: [{
        role: "user",
        content: `Brief: ${brief || "Listing reveal reel"}
Caption draft: ${captionDraft || "TBD"}
Motion notes: ${motionSpec ? JSON.parse(motionSpec)?.fingerprint?.gradeFilter ?? "" : ""}
${recipeContext}

Generate a full CapCut production brief using this format:

## Hook (0–1s)
[Exact on-screen text, font style, position]

## Shot List
1. [0:00–0:03] Shot description | Transition: [type] | Text overlay: [text]
2. [0:03–0:06] ...
(5–8 shots total)

## Color Grade / Filter
[CapCut filter name + manual adjustments]

## Music Energy Arc
[Describe energy build — quiet → peak → hold]

## Caption
[Full Instagram caption with hook, body, CTA, 5–8 hashtags]`,
      }],
    });

    const content = msg.content[0].type === "text" ? msg.content[0].text : "# CapCut Brief\nNo content generated.";
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="capcut-brief-${date}.md"`,
      },
    });

  } catch (err) {
    await logError("ai", "studio/capcut", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
