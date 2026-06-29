import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, appendFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "@/lib/error-memory";

const execAsync = promisify(exec);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STUDIO_PATH = process.env.TEARDOWN_STUDIO_PATH ?? "/Users/caleb/teardown-studio";
const PYTHON_DIR = join(STUDIO_PATH, "python");
const GRAMMAR_PATH = join(STUDIO_PATH, "intelligence", "grammars", "real-estate-creators.md");

export interface HookPattern {
  archetype: string;
  formula: string;
  example: string;
}

function pythonBin(): string {
  const venv = join(STUDIO_PATH, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

/** Download a video from a URL (social or direct MP4) to a temp file. */
export async function downloadVideoUrl(url: string): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = `/tmp/aire-ingest-${Date.now()}.mp4`;
  const isDirectMp4 = url.match(/\.(mp4|mov|webm)(\?|$)/i);

  if (isDirectMp4) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);
    const buf = await res.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(buf));
  } else {
    // yt-dlp handles Instagram, TikTok, YouTube, etc.
    await execAsync(`yt-dlp --no-playlist -f "best[ext=mp4]/best" -o "${tmpPath}" "${url}"`, { timeout: 60_000 });
  }

  return {
    localPath: tmpPath,
    cleanup: () => unlink(tmpPath).catch(() => Promise.resolve()),
  };
}

/** Extract a thumbnail frame from a video at atSec seconds. Returns null on failure. */
export async function extractThumbnail(videoPath: string, atSec = 1): Promise<Buffer | null> {
  const outPath = `/tmp/thumb-${Date.now()}.jpg`;
  try {
    await execAsync(`ffmpeg -y -ss ${atSec} -i "${videoPath}" -frames:v 1 -q:v 2 "${outPath}" -loglevel quiet`);
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return buf;
  } catch {
    return null;
  }
}

/** Run the teardown-studio Python analyzer on a video file. Returns EditRecipe JSON or null. */
export async function analyzeVideoFile(videoPath: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(PYTHON_DIR)) return null;
  try {
    const { stdout } = await execAsync(
      `${pythonBin()} -m analyzer.analyze "${videoPath}" --ffprobe ffprobe`,
      { cwd: PYTHON_DIR, timeout: 90_000 }
    );
    return JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Use Claude Haiku to extract hook patterns from a caption + top comments. */
export async function extractHookPatterns(caption: string, comments = ""): Promise<HookPattern[]> {
  return withRetry(async () => {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `Extract Instagram/TikTok hook patterns. Output ONLY a valid JSON array (no markdown).
Each element: { "archetype": string, "formula": string, "example": string }
Max 3 patterns. "archetype" = name like "Place Reputation Hook", "formula" = the reusable template, "example" = exact text from caption.`,
      messages: [{
        role: "user",
        content: `Caption: ${caption.slice(0, 800)}\n\nTop comments: ${comments.slice(0, 400)}`,
      }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    return JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as HookPattern[];
  }, { source: "extractHookPatterns" });
}

/** Append new hook patterns as a dated block to the master grammar file (local only). */
export async function appendToGrammar(patterns: HookPattern[], grammarPath?: string): Promise<void> {
  if (process.env.VERCEL === "1") return;
  const path = grammarPath ?? GRAMMAR_PATH;
  if (!existsSync(path)) return;
  const date = new Date().toISOString().split("T")[0];
  const block = [
    `\n\n### Auto-ingested ${date}`,
    ...patterns.map((p) => `- **${p.archetype}**: ${p.formula} — "${p.example}"`),
  ].join("\n");
  await appendFile(path, block).catch(() => {});
}
