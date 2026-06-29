#!/usr/bin/env node
/**
 * llm-eval.mjs — prove the local model is good enough, task by task.
 *
 * Replays representative AIRÉ haiku-tier prompts against the local `aire-local`
 * model and cloud Claude, then uses a cloud judge to score whether the local
 * output is acceptable. Output tells you which call sites are safe to keep local
 * and which should stay on cloud.
 *
 * Usage:  node --env-file=.env scripts/llm-eval.mjs
 */
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL || "aire-local";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const JUDGE_MODEL = "claude-sonnet-4-6";

const CASES = [
  {
    name: "caption-score",
    system: "Score this real estate social caption 0-100 for brand authenticity + engagement + audience fit. Reply with ONLY the number.",
    user: "Just closed on a little brick ranch off Jefferson Hwy. Keys handed over at 4:58pm on a Friday. First home for a teacher who waited 3 years. 70085.",
    check: "Output must be ONLY a number 0-100, nothing else.",
  },
  {
    name: "lead-classify",
    system: "Classify this inbound real estate lead message as one of: HOT, WARM, COLD, SPAM. Reply with ONLY the label.",
    user: "Hey saw your listing on Government St — can we see it this weekend? Pre-approved up to 450k.",
    check: "Output must be exactly one of HOT/WARM/COLD/SPAM. Correct answer is HOT.",
  },
  {
    name: "reply-draft",
    system: "Draft a 1-2 sentence text reply from Caleb (REALTOR, Baton Rouge). Warm, personal, never corporate. No 'just checking in'.",
    user: "Lead texted: 'Is the house on Stanford still available?'",
    check: "Must be 1-2 sentences, sound human/Southern, confirm availability or offer to check, no banned corporate phrases.",
  },
];

async function local(c) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      messages: [{ role: "system", content: c.system }, { role: "user", content: c.user }],
      stream: false, think: false, options: { temperature: 0.5, num_predict: 256 },
    }),
  });
  const j = await res.json();
  return (j.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function cloud(model, system, user, maxTokens = 256) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await res.json();
  return j.content?.[0]?.text?.trim() ?? `ERROR: ${JSON.stringify(j).slice(0, 200)}`;
}

async function judge(c, localOut, cloudOut) {
  const verdict = await cloud(
    JUDGE_MODEL,
    "You grade a local LLM against cloud Claude for a real estate assistant. Reply EXACTLY: 'PASS <0-10> — <reason>' or 'FAIL <0-10> — <reason>'.",
    `TASK: ${c.system}\nINPUT: ${c.user}\nACCEPTANCE: ${c.check}\n\nLOCAL OUTPUT:\n${localOut}\n\nCLOUD REFERENCE:\n${cloudOut}\n\nIs the LOCAL output acceptable for production?`,
    150,
  );
  return verdict;
}

async function main() {
  if (!API_KEY) { console.error("ANTHROPIC_API_KEY missing — run with: node --env-file=.env scripts/llm-eval.mjs"); process.exit(1); }
  console.log(`Eval: ${LOCAL_MODEL} (local) vs cloud Claude\n${"=".repeat(60)}`);
  let pass = 0;
  for (const c of CASES) {
    const lo = await local(c);
    const co = await cloud("claude-haiku-4-5", c.system, c.user);
    const v = await judge(c, lo, co);
    if (/^PASS/i.test(v)) pass++;
    console.log(`\n■ ${c.name}`);
    console.log(`  LOCAL : ${lo.replace(/\n/g, " ").slice(0, 120)}`);
    console.log(`  CLOUD : ${co.replace(/\n/g, " ").slice(0, 120)}`);
    console.log(`  JUDGE : ${v}`);
  }
  console.log(`\n${"=".repeat(60)}\nResult: ${pass}/${CASES.length} tasks safe to run locally.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
