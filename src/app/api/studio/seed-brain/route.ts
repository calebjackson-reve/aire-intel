export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-memory";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const STUDIO_PATH = process.env.TEARDOWN_STUDIO_PATH ?? "/Users/caleb/teardown-studio";
const INTEL_PATH = join(STUDIO_PATH, "intelligence");

async function readFileSafe(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8").catch(() => null);
}

/** Parse a creator study file and extract VideoRecipe-compatible hookPatterns + editKnobs. */
async function parseCreatorStudy(name: string, content: string) {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `Extract structured data from a creator study for a real estate social media brain. Output ONLY valid JSON:
{
  "creatorName": string,
  "hookPatterns": [{ "archetype": string, "formula": string, "example": string }],
  "editKnobs": { "pacing": string, "grade": string, "transitions": string, "audio": string },
  "stealSafe": [string],
  "clashRisk": [string]
}`,
    messages: [{ role: "user", content: `Creator study file: ${name}\n\n${content.slice(0, 3000)}` }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
}

/** Extract installed formats + audio rules + structural rules from the master grammar. */
async function parseGrammar(content: string) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: `Extract structured data from a real estate content grammar file. Output ONLY valid JSON:
{
  "installedFormats": [{ "name": string, "status": "active|sustained|downgraded|expired", "stealPriority": "high|medium|low" }],
  "safeAudio": [string],
  "structuralRules": [string]
}`,
    messages: [{ role: "user", content: content.slice(0, 5000) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
}

/** Extract net-new patterns from a digest file. */
async function parseDigest(content: string): Promise<{ archetype: string; formula: string; example: string }[]> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `Extract NEW hook patterns discovered in this trend digest. Output ONLY a valid JSON array:
[{ "archetype": string, "formula": string, "example": string }]
Focus on patterns that seem new and high-potential. Max 5 entries. Empty array if nothing new.`,
    messages: [{ role: "user", content: content.slice(0, 3000) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
}

export async function POST() {
  try {
    // Guard: idempotent — only run once
    const seeded = await prisma.setting.findUnique({ where: { key: "brain.seeded" } });
    if (seeded) return NextResponse.json({ skipped: true, seededAt: seeded.value });

    if (!existsSync(INTEL_PATH)) {
      return NextResponse.json({ error: "teardown-studio intelligence not found" }, { status: 404 });
    }

    let studiesIngested = 0;
    let preferencesSeeded = 0;
    let digestsProcessed = 0;

    // ── Step 2: Ingest creator studies ───────────────────────────────────────
    const studiesDir = join(INTEL_PATH, "studies");
    if (existsSync(studiesDir)) {
      const files = await readdir(studiesDir);
      for (const file of files.filter(f => f.endsWith(".md"))) {
        const content = await readFileSafe(join(studiesDir, file));
        if (!content) continue;
        const parsed = await parseCreatorStudy(file, content).catch(() => null);
        if (!parsed?.hookPatterns) continue;

        await prisma.videoRecipe.create({
          data: {
            sourceType: "study",
            recipe: { editKnobs: parsed.editKnobs ?? {}, stealSafe: parsed.stealSafe ?? [], clashRisk: parsed.clashRisk ?? [] },
            hookPatterns: parsed.hookPatterns,
            notes: `Creator study: ${parsed.creatorName ?? file}`,
          },
        });
        studiesIngested++;
      }
    }

    // ── Step 3: Load master grammar ──────────────────────────────────────────
    const grammarContent = await readFileSafe(join(INTEL_PATH, "grammars", "real-estate-creators.md"));
    let installedFormats: { name: string; status: string; stealPriority: string }[] = [];
    if (grammarContent) {
      const parsed = await parseGrammar(grammarContent).catch(() => null);
      if (parsed) {
        installedFormats = parsed.installedFormats ?? [];
        await prisma.setting.upsert({
          where: { key: "reel.installedFormats" },
          create: { key: "reel.installedFormats", value: JSON.stringify(installedFormats) },
          update: { value: JSON.stringify(installedFormats) },
        });
        if (parsed.safeAudio?.length) {
          await prisma.setting.upsert({
            where: { key: "reel.safeAudio" },
            create: { key: "reel.safeAudio", value: JSON.stringify(parsed.safeAudio) },
            update: { value: JSON.stringify(parsed.safeAudio) },
          });
        }
        if (parsed.structuralRules?.length) {
          await prisma.setting.upsert({
            where: { key: "reel.structuralRules" },
            create: { key: "reel.structuralRules", value: JSON.stringify(parsed.structuralRules) },
            update: { value: JSON.stringify(parsed.structuralRules) },
          });
        }
      }
    }

    // ── Step 4: Load lessons ──────────────────────────────────────────────────
    const lessonsContent = await readFileSafe(join(INTEL_PATH, "lessons.md"));
    if (lessonsContent) {
      await prisma.setting.upsert({
        where: { key: "brain.lessons" },
        create: { key: "brain.lessons", value: lessonsContent.slice(0, 8000) },
        update: { value: lessonsContent.slice(0, 8000) },
      });
    }

    // ── Step 5: Bootstrap ContentPreference from format status board ─────────
    for (const fmt of installedFormats) {
      const isActive = fmt.status === "active" || fmt.status === "sustained";
      const isExpired = fmt.status === "downgraded" || fmt.status === "expired";
      await prisma.contentPreference.upsert({
        where: { patternType_value: { patternType: "reel_hook", value: fmt.name } },
        create: {
          patternType: "reel_hook",
          value: fmt.name,
          approvals: isActive ? 10 : 0,
          rejections: isExpired ? 10 : 0,
          approvalRate: isActive ? 1 : isExpired ? 0 : 0.5,
        },
        update: {}, // never overwrite real data if somehow pre-existing
      });
      preferencesSeeded++;
    }

    // ── Step 6: Ingest digests ────────────────────────────────────────────────
    const digestsDir = join(INTEL_PATH, "digests");
    const grammarAppendPath = join(INTEL_PATH, "grammars", "real-estate-creators.md");
    if (existsSync(digestsDir)) {
      const files = (await readdir(digestsDir)).filter(f => f.endsWith(".md")).sort();
      const { appendFile } = await import("fs/promises");
      for (const file of files) {
        const content = await readFileSafe(join(digestsDir, file));
        if (!content) continue;
        const patterns = await parseDigest(content).catch(() => []);
        if (patterns.length && process.env.VERCEL !== "1") {
          const date = file.replace(".md", "");
          const block = [
            `\n\n### Digest ${date}`,
            ...patterns.map((p) => `- **${p.archetype}**: ${p.formula} — "${p.example}"`),
          ].join("\n");
          await appendFile(grammarAppendPath, block).catch(() => {});
        }
        digestsProcessed++;
      }
    }

    // ── Step 7: Stamp complete ────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    await prisma.setting.upsert({
      where: { key: "brain.seeded" },
      create: { key: "brain.seeded", value: today },
      update: { value: today },
    });

    return NextResponse.json({ studiesIngested, formatsSeeded: installedFormats.length, preferencesSeeded, lessonsLoaded: lessonsContent ? 1 : 0, digestsProcessed });

  } catch (err) {
    await logError("ai", "studio/seed-brain", err as Error);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
