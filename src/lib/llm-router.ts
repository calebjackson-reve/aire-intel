import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "./settings";
import { withRetry } from "./error-memory";
import { prisma } from "./prisma";

export type AIRETask =
  | "lead_enrich"
  | "intent_detect"
  | "error_classify"
  | "doc_summarize"
  | "market_summarize"
  | "loop_health_check"
  | "competitor_digest"
  | "sms_brief"
  | "listing_copy"
  | "client_email"
  | "client_sms"
  | "negotiation_draft"
  | "social_caption"
  | "smart_plan_step"
  | "strategic_analysis";

const LOCAL_TASKS = new Set<AIRETask>([
  "lead_enrich", "intent_detect", "error_classify",
  "doc_summarize", "market_summarize", "loop_health_check",
  "competitor_digest", "sms_brief",
]);

export interface RouteResult {
  content: string;
  task: AIRETask;
  tier: "local" | "cloud";
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RouteOptions {
  task: AIRETask;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  noRetry?: boolean;
}

async function getClient(task: AIRETask) {
  if (LOCAL_TASKS.has(task)) {
    const [baseURL, model] = await Promise.all([
      getSetting("OLLAMA_BASE_URL"),
      getSetting("OLLAMA_MODEL"),
    ]);
    return {
      client: new Anthropic({ baseURL: baseURL ?? "http://localhost:11434/v1", apiKey: "ollama" }),
      model: model ?? "hermes3:8b",
      tier: "local" as const,
      maxTokens: 1024,
    };
  }
  return {
    client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    tier: "cloud" as const,
    maxTokens: 2048,
  };
}

export async function routeLLM(opts: RouteOptions): Promise<RouteResult> {
  const config = await getClient(opts.task);
  const start = Date.now();
  const run = async () => config.client.messages.create({
    model: config.model,
    max_tokens: opts.maxTokens ?? config.maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const response = opts.noRetry ? await run() : await withRetry(run, { maxAttempts: 3, label: `llm-router:${opts.task}` });
  const content = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
  const latencyMs = Date.now() - start;
  logUsage({ task: opts.task, tier: config.tier, model: config.model, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, latencyMs }).catch(() => {});
  return { content, task: opts.task, tier: config.tier, model: config.model, latencyMs, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export async function routeLLMJson<T = unknown>(opts: RouteOptions & { schema?: string }): Promise<T> {
  const systemPrompt = [opts.systemPrompt ?? "", "Respond ONLY with valid JSON. No markdown fences, no explanation, no preamble.", opts.schema ? `Schema: ${opts.schema}` : ""].filter(Boolean).join("\n");
  const result = await routeLLM({ ...opts, systemPrompt });
  return JSON.parse(result.content.replace(/```json|```/g, "").trim()) as T;
}

export async function classifyError(entry: { type: string; source: string; message: string; stack?: string | null; context?: string | null }) {
  return routeLLMJson<{ severity: "critical"|"warning"|"info"; category: string; suggestedAction: string; autoFixable: boolean }>({
    task: "error_classify",
    systemPrompt: "You are an error triage agent for AIRE, a Next.js real estate platform. Classify errors and suggest the most concrete fix possible. autoFixable means a script or code change could resolve it without human review.",
    userPrompt: `Classify this error:\n${JSON.stringify(entry, null, 2)}`,
    schema: '{ severity: "critical"|"warning"|"info", category: string, suggestedAction: string, autoFixable: boolean }',
  });
}

export async function detectIntent(message: string) {
  return routeLLMJson<{ intent: "buying"|"selling"|"renting"|"investing"|"just_browsing"|"unknown"; urgency: "high"|"medium"|"low"; keySignals: string[] }>({
    task: "intent_detect",
    systemPrompt: "You are a real estate intent classifier for a Baton Rouge, Louisiana agent.",
    userPrompt: `Classify this message:\n"${message}"`,
    schema: '{ intent: "buying"|"selling"|"renting"|"investing"|"just_browsing"|"unknown", urgency: "high"|"medium"|"low", keySignals: string[] }',
  });
}

export async function generateSmsSummaryLocal(context: string, fallback: string): Promise<string> {
  const result = await routeLLM({
    task: "sms_brief",
    noRetry: true,
    userPrompt: `Write a morning brief SMS for Caleb Jackson (REALTOR®, Rêve Realtors® Baton Rouge).\nUnder 280 chars. Plain text only. No emojis. Conversational, not robotic.\n\nContext:\n${context}\n\nSMS only — no preamble.`,
  });
  return result.content.trim() || fallback;
}

async function logUsage(entry: { task: string; tier: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[AIRE Router] ${entry.tier.toUpperCase()} | ${entry.task} | ${entry.model} | ${entry.latencyMs}ms | in:${entry.inputTokens} out:${entry.outputTokens}`);
  }
  try {
    await (prisma as any).usageLog?.create({ data: { source: `llm-router:${entry.task}`, ...entry, createdAt: new Date() } });
  } catch {}
}
