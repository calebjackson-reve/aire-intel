#!/usr/bin/env node
/**
 * build-model.mjs — assemble and register the `aire-local` Ollama model.
 *
 * Bakes a domain system prompt into the base model so every local call starts
 * with AIRÉ context resident in the weights' context window: the Rêve brand
 * voice, tool-use discipline, and a one-line map of all 34 loops. Per-loop
 * detail is added at call time via RAG (loop-rag.ts); this is the always-on
 * baseline so the model never answers "loop-blind".
 *
 * Usage:  node infra/ollama/build-model.mjs
 * Env:    BASE_MODEL (default qwen3:14b), AIRE_MODEL (default aire-local)
 */
import { promises as fs } from "fs";
import { execFile } from "child_process";
import path from "path";
import os from "os";

const ROOT = path.resolve(process.cwd());
const BASE = process.env.BASE_MODEL || "qwen3:14b";
const NAME = process.env.AIRE_MODEL || "aire-local";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
    p.stdout?.pipe(process.stdout);
    p.stderr?.pipe(process.stderr);
  });
}

async function read(rel) {
  try { return await fs.readFile(path.join(ROOT, rel), "utf8"); } catch { return ""; }
}

/** Pull the compact "Rank | Slug | Trigger" lines out of REGISTRY.md. */
function loopMap(registry) {
  const lines = registry.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
  return lines.map((l) => {
    const cells = l.split("|").map((c) => c.trim());
    const slug = (cells[2] || "").replace(/\[([^\]]+)\].*/, "$1");
    return `- ${slug}: ${cells[4] || ""}`;
  }).join("\n");
}

async function main() {
  const brandSrc = await read("src/lib/reve-system-prompt.ts");
  const brand = (brandSrc.match(/`([\s\S]*)`/)?.[1] || "").trim();
  const registry = await read("loops/REGISTRY.md");

  const SYSTEM = `${brand}

## YOU ARE THE LOCAL AIRÉ ENGINE
You run on-device for Caleb. You handle high-volume, latency-sensitive tasks:
lead scoring, caption scoring, routine reply drafts, classification, and loop
chatter. Be terse and exact. When a tool is provided, CALL THE TOOL — do not
describe calling it. When asked for a score, reply with ONLY what was requested.
Never invent data; if you lack a fact, say so.

## THE 34 AIRÉ LOOPS (you operate inside these)
Each loop is an autonomous unit with a Trigger and an Oracle (success metric).
Detailed specs are injected per-task. Baseline map:
${loopMap(registry)}`;

  const modelfile = `FROM ${BASE}

PARAMETER temperature 0.6
PARAMETER num_ctx 16384
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.05

SYSTEM """${SYSTEM.replace(/"""/g, '\\"\\"\\"')}"""
`;

  const tmp = path.join(os.tmpdir(), "Modelfile.aire");
  await fs.writeFile(tmp, modelfile);
  // Keep a committed copy for reference.
  await fs.mkdir(path.join(ROOT, "infra", "ollama"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "infra", "ollama", "Modelfile.aire"), modelfile);

  console.log(`Building ${NAME} from ${BASE} (SYSTEM ${SYSTEM.length} chars)…`);
  await run(process.env.OLLAMA_BIN || "ollama", ["create", NAME, "-f", tmp]);
  console.log(`✓ Registered model: ${NAME}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
