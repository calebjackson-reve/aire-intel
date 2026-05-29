// Voice Corpus — AIRE Platform
//
// The communication agents must sound like Caleb, not "fake AI slop." The most
// reliable way to do that is to show the model how Caleb ACTUALLY writes — so we
// mine his real sent messages out of the ContactLog (outbound text + email),
// scrub PII, dedupe, and keep the substantive ones as few-shot examples.
//
// Flow:
//   mineVoiceCorpus()  → pull + clean candidate samples from outbound logs
//   saveVoiceCorpus()  → persist the curated set to Setting key "voice_corpus"
//   getVoiceCorpus()   → read the curated set (used at generation time)
//   buildVoiceSystemBlock() → REVE_VOICE_DELTA + the examples, for the system prompt
//
// If too few real samples exist, Caleb can paste more into voice-corpus.seed.ts.

import { prisma } from "./prisma";
import { REVE_VOICE_DELTA } from "./reve-system-prompt";
import { VOICE_CORPUS_SEED } from "./voice-corpus.seed";

const SETTING_KEY = "voice_corpus";
const MIN_LEN = 15;
const MAX_LEN = 700;

export interface VoiceSample {
  channel: "text" | "email";
  body: string;
  stage?: string;
  type?: string;
}

// Strip auto-generated sync markers like [Lofty#123] / [Milestone:inspection] / [AIRE].
const MARKER_RE = /\[(lofty#[^\]]*|milestone:[^\]]*|aire[^\]]*)\]/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/** Remove PII + sync markers; collapse whitespace. Lead name redacted to [name]. */
export function scrub(body: string, leadName?: string | null): string {
  let s = body.replace(MARKER_RE, " ");
  s = s.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  if (leadName) {
    for (const part of leadName.split(/\s+/).filter((p) => p.length >= 2)) {
      const esc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`\\b${esc}\\b`, "gi"), "[name]");
    }
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Mine candidate voice samples from outbound text/email logs. Excludes AI-generated
 * messages (method "ai_message") so we learn Caleb's hand, not the model's echo.
 */
export async function mineVoiceCorpus(limit = 50): Promise<VoiceSample[]> {
  const logs = await prisma.contactLog.findMany({
    where: {
      direction: "outbound",
      method: { in: ["text", "email"] },
      note: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 600, // scan a generous window, then filter/dedupe down to `limit`
    select: {
      method: true,
      note: true,
      lead: { select: { name: true, stage: true, type: true } },
    },
  });

  const seen = new Set<string>();
  const samples: VoiceSample[] = [];

  const tryAdd = (raw: string, channel: "text" | "email", stage?: string | null, type?: string | null, leadName?: string | null): boolean => {
    const body = scrub(raw, leadName);
    if (body.length < MIN_LEN || body.length > MAX_LEN) return false;
    // Skip messages that are essentially just a link.
    if (/^https?:\/\/\S+$/i.test(body)) return false;
    const key = body.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    samples.push({ channel, body, stage: stage ?? undefined, type: type ?? undefined });
    return true;
  };

  for (const log of logs) {
    if (!log.note) continue;
    tryAdd(log.note, log.method === "email" ? "email" : "text", log.lead?.stage, log.lead?.type, log.lead?.name);
    if (samples.length >= limit) break;
  }

  // Fallback / supplement: merge any hand-pasted real messages from the seed file.
  // Mined logs win on dedupe (they're added first); the seed fills out a thin corpus.
  for (const s of VOICE_CORPUS_SEED) {
    if (samples.length >= limit) break;
    tryAdd(s.body, s.channel, s.stage, s.type);
  }

  return samples;
}

export async function getVoiceCorpus(): Promise<VoiceSample[]> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  if (!row?.value) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? (v as VoiceSample[]) : [];
  } catch {
    return [];
  }
}

export async function saveVoiceCorpus(samples: VoiceSample[]): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(samples) },
    update: { value: JSON.stringify(samples) },
  });
}

/**
 * Build the system-prompt block: the "write less like a brochure" delta plus a
 * handful of real examples. Returns just the delta when no corpus is available.
 */
export function buildVoiceSystemBlock(samples: VoiceSample[], max = 8): string {
  if (samples.length === 0) return REVE_VOICE_DELTA;

  const picks = samples.slice(0, max);
  const examples = picks
    .map((s, i) => `Example ${i + 1} (${s.channel}${s.stage ? `, ${s.stage}` : ""}):\n"${s.body}"`)
    .join("\n\n");

  return `${REVE_VOICE_DELTA}

## HOW CALEB ACTUALLY WRITES (real sent messages — match this voice exactly)
These are Caleb's own words. Mirror the rhythm, brevity, punctuation habits, and
informality. Do NOT copy them verbatim — write a fresh message in the same voice.

${examples}`;
}
