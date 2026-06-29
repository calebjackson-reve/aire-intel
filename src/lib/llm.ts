/**
 * llm.ts — hybrid local/cloud router for AIRÉ.
 *
 * Drop-in replacement for `new Anthropic({ apiKey })`. Exposes `getLLM()` which
 * returns an object with the same `.messages.create()` shape the rest of the app
 * already uses. Routing:
 *
 *   - model matches the "cheap tier" (claude-haiku-*)  -> local Ollama model
 *   - everything else (opus / sonnet)                  -> real Anthropic API
 *
 * The cheap tier is exactly the 12 high-volume call sites the devs already chose
 * to run on Haiku (lead scoring, caption scoring, routine drafts, loop chatter).
 * Those now run free / private / offline on the local 14B. Hard reasoning stays
 * on cloud Claude by design.
 *
 * Safety: any local error (model not loaded, timeout, bad JSON) transparently
 * falls back to a cloud model, so loops never silently break. Flip the whole
 * thing off with LOCAL_LLM_ENABLED=0.
 */
import Anthropic from "@anthropic-ai/sdk";
import { retrieveLoopContext } from "@/lib/loop-rag";

const LOCAL_ENABLED = process.env.LOCAL_LLM_ENABLED === "1";
const RAG_ENABLED = process.env.LOCAL_LLM_RAG === "1";
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL || "aire-local";
const CLOUD_FALLBACK = process.env.LOCAL_LLM_CLOUD_FALLBACK || "claude-sonnet-4-6";
const NUM_CTX = parseInt(process.env.LOCAL_LLM_NUM_CTX || "16384", 10);
const TIMEOUT_MS = parseInt(process.env.LOCAL_LLM_TIMEOUT_MS || "120000", 10);

/** Which requested cloud models are eligible to be served locally. */
function isLocalTier(model: string): boolean {
  return /haiku/i.test(model);
}

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

let _localCounter = 0;
function localId(prefix: string): string {
  _localCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_localCounter}`;
}

// ── Anthropic -> Ollama param translation ──────────────────────────────────

type AnyParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

function systemToString(system: AnyParams["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system.map((b) => ("text" in b ? b.text : "")).join("\n");
}

function toOllamaMessages(params: AnyParams, systemText: string) {
  const out: Array<Record<string, unknown>> = [];
  if (systemText) out.push({ role: "system", content: systemText });

  for (const m of params.messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    // Block array: split text / tool_use / tool_result into Ollama-shaped msgs.
    const textParts: string[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    for (const block of m.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({ function: { name: block.name, arguments: block.input } });
      } else if (block.type === "tool_result") {
        const content = Array.isArray(block.content)
          ? block.content.map((c) => ("text" in c ? c.text : "")).join("\n")
          : String(block.content ?? "");
        // Ollama represents a tool result as its own message.
        out.push({ role: "tool", content });
      }
    }
    if (m.role === "assistant" && toolCalls.length) {
      out.push({ role: "assistant", content: textParts.join("\n"), tool_calls: toolCalls });
    } else if (textParts.length) {
      out.push({ role: m.role, content: textParts.join("\n") });
    }
  }
  return out;
}

function toOllamaTools(tools: AnyParams["tools"]) {
  if (!tools) return undefined;
  return tools
    .filter((t) => "input_schema" in t)
    .map((t) => ({
      type: "function",
      function: {
        name: (t as Anthropic.Tool).name,
        description: (t as Anthropic.Tool).description ?? "",
        parameters: (t as Anthropic.Tool).input_schema,
      },
    }));
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Local call ──────────────────────────────────────────────────────────────

async function localCreate(params: AnyParams): Promise<Anthropic.Message> {
  let systemText = systemToString(params.system);

  // RAG: inject the most relevant loop specs so the model "understands the loops".
  if (RAG_ENABLED) {
    const queryText = JSON.stringify(params.messages).slice(0, 4000);
    const ctx = await retrieveLoopContext(queryText).catch(() => "");
    if (ctx) systemText = `${systemText}\n\n## RELEVANT AIRÉ LOOP CONTEXT\n${ctx}`;
  }

  const body = {
    model: LOCAL_MODEL,
    messages: toOllamaMessages(params, systemText),
    tools: toOllamaTools(params.tools),
    stream: false,
    think: false, // qwen3 reasoning blocks pollute terse outputs (scores, JSON)
    options: {
      temperature: params.temperature ?? 0.7,
      num_ctx: NUM_CTX,
      num_predict: params.max_tokens ?? 1024,
    },
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let json: any;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const msg = json.message ?? {};
  const content: Anthropic.ContentBlock[] = [];

  const text = stripThinking(String(msg.content ?? ""));
  if (text) content.push({ type: "text", text, citations: [] } as Anthropic.TextBlock);

  for (const call of msg.tool_calls ?? []) {
    const fn = call.function ?? {};
    let input = fn.arguments;
    if (typeof input === "string") {
      try { input = JSON.parse(input); } catch { input = { value: input }; }
    }
    content.push({
      type: "tool_use",
      id: localId("toolu_local"),
      name: fn.name,
      input: input ?? {},
    } as Anthropic.ToolUseBlock);
  }

  // A response must always carry at least one block.
  if (content.length === 0) content.push({ type: "text", text: "", citations: [] } as Anthropic.TextBlock);

  const hasToolUse = content.some((b) => b.type === "tool_use");
  return {
    id: localId("msg_local"),
    type: "message",
    role: "assistant",
    model: `${params.model} (local:${LOCAL_MODEL})`,
    content,
    stop_reason: hasToolUse ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: json.prompt_eval_count ?? 0,
      output_tokens: json.eval_count ?? 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Anthropic.Message;
}

// ── Public facade ─────────────────────────────────────────────────────────

async function create(params: AnyParams): Promise<Anthropic.Message> {
  const useLocal = LOCAL_ENABLED && isLocalTier(params.model) && !(params as any).stream;
  if (useLocal) {
    try {
      return await localCreate(params);
    } catch (err) {
      console.warn(`[llm] local model failed, falling back to ${CLOUD_FALLBACK}:`, (err as Error)?.message);
      return anthropic().messages.create({ ...params, model: CLOUD_FALLBACK });
    }
  }
  return anthropic().messages.create(params);
}

/**
 * Returns an Anthropic-SDK-compatible client. Replace `new Anthropic({...})`
 * and ad-hoc `getClient()` helpers with `getLLM()`.
 */
export function getLLM() {
  return {
    messages: { create },
    // Pass-through for any code that reaches for the raw cloud client.
    get raw() {
      return anthropic();
    },
  };
}
