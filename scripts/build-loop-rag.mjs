#!/usr/bin/env node
/**
 * build-loop-rag.mjs — build the loop knowledge index for the local LLM.
 *
 * Walks loops/active/{NN}/SPEC.md + PROMPT.md + NOTES.md, chunks each, embeds
 * every chunk with the local Ollama embedding model, and writes
 * loops/.rag-index.json. retrieveLoopContext() (src/lib/loop-rag.ts) reads it at
 * runtime to feed relevant loop specs into local calls.
 *
 * Usage:  node scripts/build-loop-rag.mjs
 */
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.LOCAL_LLM_EMBED_MODEL || "nomic-embed-text";
const LOOPS_DIR = path.join(ROOT, "loops", "active");
const OUT = path.join(ROOT, "loops", ".rag-index.json");
const MAX_CHARS = 2400; // ~ chunk size per embedding

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return (await res.json()).embedding;
}

function chunk(text) {
  // Split on markdown headings, then cap each chunk to MAX_CHARS.
  const sections = text.split(/\n(?=#{1,3}\s)/);
  const out = [];
  for (const s of sections) {
    if (s.length <= MAX_CHARS) { out.push(s); continue; }
    for (let i = 0; i < s.length; i += MAX_CHARS) out.push(s.slice(i, i + MAX_CHARS));
  }
  return out.filter((c) => c.trim().length > 40);
}

async function main() {
  const dirs = (await fs.readdir(LOOPS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const chunks = [];
  for (const slug of dirs) {
    for (const file of ["SPEC.md", "PROMPT.md", "NOTES.md"]) {
      const fp = path.join(LOOPS_DIR, slug, file);
      let raw;
      try { raw = await fs.readFile(fp, "utf8"); } catch { continue; }
      for (const [i, c] of chunk(raw).entries()) {
        chunks.push({ id: `${slug}/${file}#${i}`, title: `${slug} · ${file}`, text: c });
      }
    }
  }

  // Also index the registry + brand system so the model knows the whole map.
  for (const extra of [["loops/REGISTRY.md", "Loop Registry"], ["src/lib/reve-system-prompt.ts", "Rêve Brand System"]]) {
    try {
      const raw = await fs.readFile(path.join(ROOT, extra[0]), "utf8");
      for (const [i, c] of chunk(raw).entries()) chunks.push({ id: `${extra[0]}#${i}`, title: extra[1], text: c });
    } catch { /* optional */ }
  }

  console.log(`Embedding ${chunks.length} chunks from ${dirs.length} loops via ${EMBED_MODEL}…`);
  const indexed = [];
  for (const [i, c] of chunks.entries()) {
    c.embedding = await embed(c.text);
    indexed.push(c);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${chunks.length}`);
  }

  await fs.writeFile(OUT, JSON.stringify(indexed));
  const mb = (JSON.stringify(indexed).length / 1e6).toFixed(1);
  console.log(`✓ Wrote ${indexed.length} chunks → ${path.relative(ROOT, OUT)} (${mb} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
