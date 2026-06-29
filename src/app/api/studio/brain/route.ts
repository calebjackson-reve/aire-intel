export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface BrainRequest {
  prompt: string;
  footage: { url: string; name: string; durationSec?: number }[];
  referenceUrl?: string;
  referenceRecipeId?: string;
}

type OutputType = "reel" | "carousel" | "caption" | "brief";

/** Claude classifies the intent and extracts structured params. */
async function classifyIntent(prompt: string, hasFootage: boolean, hasReference: boolean): Promise<{
  type: OutputType;
  hookText: string;
  vibe: string;
  style: string;
  musicMood: string;
  capcut: boolean;
}> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `You classify content creation requests for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.
Output ONLY valid JSON. No markdown, no explanation.

Output type rules:
- "reel" → user mentions video, reel, hype, footage, cuts, render, cinematic, announce, reveal — AND has footage
- "brief" → user mentions capcut, brief, shot list, template — OR has reference but no footage
- "carousel" → user mentions slides, carousel, educational, tips, steps
- "caption" → user wants caption, hook text, copy only — no video output

Extract:
- hookText: the bold on-screen first-second text for the reel (1 punchy line, all caps, max 8 words)
- vibe: 2-3 word style descriptor ("moody cinematic", "hype energy", "warm lifestyle")
- style: "cinematic" | "hype" | "lifestyle" | "educational"
- musicMood: "dramatic" | "upbeat" | "ambient" | "none"
- capcut: true if user specifically mentions CapCut`,
    messages: [{
      role: "user",
      content: `Prompt: "${prompt}"\nHas footage: ${hasFootage}\nHas reference: ${hasReference}`
    }],
  });

  try {
    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    return JSON.parse(text);
  } catch {
    return { type: hasFootage ? "reel" : "brief", hookText: "NOW LISTING", vibe: "luxury cinematic", style: "cinematic", musicMood: "dramatic", capcut: false };
  }
}

/** Load grammar + hard lessons + settings-based rules for every brain call. */
async function loadGrammar(): Promise<string> {
  const parts: string[] = [];

  // Hard lessons from seed (21 rules: audio whitelist, proof-first, DM-weight, etc.)
  try {
    const lessonsRow = await prisma.setting.findUnique({ where: { key: "brain.lessons" } });
    if (lessonsRow?.value) parts.push(`## Hard Rules (from earned lessons)\n${lessonsRow.value.slice(0, 2000)}`);
  } catch { /* non-fatal */ }

  // Current learned top styles from weekly agent
  try {
    const [pacingRow, gradeRow, hookRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "reel.topPacing" } }),
      prisma.setting.findUnique({ where: { key: "reel.topGrade" } }),
      prisma.setting.findUnique({ where: { key: "reel.topHookArchetype" } }),
    ]);
    if (pacingRow || gradeRow || hookRow) {
      parts.push(`## Current Top Performing Styles\nPacing: ${pacingRow?.value ?? "medium"} | Grade: ${gradeRow?.value ?? "contrast"} | Hook: ${hookRow?.value ?? "Place Reputation"}`);
    }
  } catch { /* non-fatal */ }

  // Master grammar file
  try {
    const { readFile } = await import("fs/promises");
    const studioPath = process.env.TEARDOWN_STUDIO_PATH ?? "/Users/caleb/teardown-studio";
    const grammar = await readFile(`${studioPath}/intelligence/grammars/real-estate-creators.md`, "utf-8");
    parts.push(`## Creator Grammar\n${grammar.slice(0, 2000)}`);
  } catch {
    parts.push("Cinematic restraint. morningside.studio aesthetic. Slow pans, depth, luxury. Beat-sync cuts. Rêve Realtors Baton Rouge brand.");
  }

  return parts.join("\n\n").slice(0, 5000);
}

/** Generate a CapCut-ready production brief. */
async function generateBrief(prompt: string, intent: Awaited<ReturnType<typeof classifyIntent>>, grammar: string, footage: BrainRequest["footage"], refUrl?: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: `You are the Video Brain for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.
You generate CapCut production briefs — shot-by-shot instructions Caleb uses to edit in CapCut.

Brand grammar (from studied elite creators):
${grammar}

Format:
## Hook (0–1s)
## Shot sequence (numbered, with timing, transition type, text overlay)
## Color grade / filter
## Music energy arc
## Caption hook line`,
    messages: [{
      role: "user",
      content: `Request: ${prompt}
Style: ${intent.vibe}
Hook text: ${intent.hookText}
Footage clips: ${footage.map(f => f.name).join(", ") || "not uploaded yet"}
Reference video: ${refUrl || "none — use learned grammar"}`,
    }],
  });
  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

/** Generate carousel slide copy. */
async function generateCarousel(prompt: string): Promise<{ headline: string; body: string }[]> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: `Generate 5 Instagram carousel slides for Caleb Jackson, REALTOR® at Rêve Realtors® Baton Rouge.
Output ONLY valid JSON array: [{"headline": "...", "body": "..."}, ...]
Headlines: bold, max 6 words. Body: 1–2 sentences, conversational.`,
    messages: [{ role: "user", content: prompt }],
  });
  try {
    const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ""));
  } catch {
    return [{ headline: "Let's Talk Baton Rouge", body: "The market is moving. Here's what you need to know." }];
  }
}

/** Generate caption. */
async function generateCaption(prompt: string, hookText: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: `Write a viral Instagram caption for Caleb Jackson, REALTOR® Rêve Realtors® Baton Rouge.
Hook line first (bold statement or question). 3–5 lines. End with CTA. 5–8 hashtags.
Southern luxury voice. Never generic. Never AI-sounding.`,
    messages: [{ role: "user", content: `${prompt}\nHook text: ${hookText}` }],
  });
  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

export async function POST(req: NextRequest) {
  const body: BrainRequest = await req.json();
  const { prompt, footage, referenceUrl, referenceRecipeId } = body;

  try {
    const [intent, grammar] = await Promise.all([
      classifyIntent(prompt, footage.length > 0, !!referenceUrl),
      loadGrammar(),
    ]);

    // ── REEL path — route to existing /api/reel ───────────────────────────
    if (intent.type === "reel" && footage.length > 0) {
      const reelRes = await fetch(`${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/api/reel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          footage: footage.map((f) => ({ url: f.url, durationSec: f.durationSec })),
          vibe: intent.vibe,
          hookText: intent.hookText,
          referenceRecipeId: referenceRecipeId ?? null,
        }),
      });

      if (reelRes.ok) {
        const reelData = await reelRes.json();

        return NextResponse.json({
          type: "reel",
          status: "rendering",
          hookText: intent.hookText,
          renderJobId: reelData.renderJobId ?? null,
          contentProjectId: reelData.contentProjectId ?? null,
          shotstack: { id: reelData.renderId, status: "rendering" },
          renderUrl: reelData.url ?? null,
          message: "Shotstack is rendering your reel. Check back in ~60s.",
        });
      }
    }

    // ── BRIEF path — CapCut production brief via Claude ───────────────────
    if (intent.type === "brief" || intent.capcut || footage.length === 0) {
      const [brief, caption] = await Promise.all([
        generateBrief(prompt, intent, grammar, footage, referenceUrl),
        generateCaption(prompt, intent.hookText),
      ]);

      await prisma.contentProject.create({
        data: { type: "brief", status: "draft", platform: "instagram", brief: prompt.slice(0, 500) },
      }).catch(() => null);

      return NextResponse.json({
        type: "brief",
        status: "done",
        hookText: intent.hookText,
        brief,
        caption,
      });
    }

    // ── CAROUSEL path ─────────────────────────────────────────────────────
    if (intent.type === "carousel") {
      const [slides, caption] = await Promise.all([
        generateCarousel(prompt),
        generateCaption(prompt, intent.hookText),
      ]);
      return NextResponse.json({ type: "carousel", status: "done", slides, caption, hookText: intent.hookText });
    }

    // ── CAPTION only ──────────────────────────────────────────────────────
    const caption = await generateCaption(prompt, intent.hookText);
    return NextResponse.json({ type: "caption", status: "done", caption, hookText: intent.hookText });

  } catch (err) {
    await logError("ai", "api/studio/brain", err as Error, { prompt });
    return NextResponse.json({ type: "reel", status: "error", message: String(err) }, { status: 500 });
  }
}
