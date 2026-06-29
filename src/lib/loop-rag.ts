/**
 * loop-rag.ts — retrieval over the AIRÉ loop knowledge pack.
 *
 * Reads the prebuilt index at loops/.rag-index.json (built by
 * scripts/build-loop-rag.mjs), embeds the incoming query via the local Ollama
 * embedding model, and returns the top-k most relevant loop/spec chunks as a
 * single context string. Injected into local (haiku-tier) calls by llm.ts so the
 * local model actually understands the 34 loops instead of guessing.
 *
 * Fully self-contained: no DB, no network except the local embedder. If the
 * index is missing it returns "" so callers degrade gracefully.
 */
import { promises as fs } from "fs";
import path from "path";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.LOCAL_LLM_EMBED_MODEL || "nomic-embed-text";
const TOP_K = parseInt(process.env.LOCAL_LLM_RAG_TOPK || "4", 10);
const INDEX_PATH = path.join(process.cwd(), "loops", ".rag-index.json");

type Chunk = { id: string; title: string; text: string; embedding: number[] };
let _index: Chunk[] | null = null;

async function loadIndex(): Promise<Chunk[]> {
  if (_index) return _index;
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    _index = JSON.parse(raw) as Chunk[];
  } catch {
    _index = [];
  }
  return _index;
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const json = (await res.json()) as { embedding: number[] };
  return json.embedding;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Returns the top-k loop chunks for a query, joined as one context string. */
export async function retrieveLoopContext(query: string): Promise<string> {
  const index = await loadIndex();
  if (!index.length) return "";
  const q = await embed(query);
  const scored = index
    .map((c) => ({ c, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
  return scored.map(({ c }) => `### ${c.title}\n${c.text}`).join("\n\n");
}
