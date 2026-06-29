// Content quality gate — scores AI-generated posts against Rêve brand rules.
// Called inline after every generation. No extra API call for the basic check;
// the AI scoring path is opt-in via scoreWithAI().

export interface QualityResult {
  score: number;          // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  flags: QualityFlag[];
  passed: boolean;        // score >= 70
}

export interface QualityFlag {
  severity: "error" | "warning" | "info";
  rule: string;
  detail: string;
}

// ── Banned phrases (auto-fail if found) ──────────────────────────────────────
const BANNED: Array<{ phrase: RegExp; replacement: string }> = [
  { phrase: /dream home/gi,        replacement: '"this one" or the actual address' },
  { phrase: /trusted advisor/gi,   replacement: "delete it" },
  { phrase: /picture.perfect/gi,   replacement: "delete it" },
  { phrase: /nestled/gi,           replacement: "a real spatial description" },
  { phrase: /just checking in/gi,  replacement: "write a real opener" },
  { phrase: /luxury lifestyle/gi,  replacement: "describe the actual lifestyle" },
  { phrase: /stunning/gi,          replacement: "describe what specifically" },
  { phrase: /make your dreams/gi,  replacement: "delete it" },
  { phrase: /don't miss out/gi,    replacement: "delete it" },
  { phrase: /priced to sell/gi,    replacement: "state the actual price context" },
  { phrase: /won't last long/gi,   replacement: "state the actual DOM or urgency" },
  { phrase: /move.in ready/gi,     replacement: "describe what's been done" },
];

// ── Hook quality heuristics ───────────────────────────────────────────────────
const WEAK_HOOKS = [
  /^excited to (share|announce)/i,
  /^check out/i,
  /^introducing/i,
  /^i('m| am) (proud|excited|thrilled)/i,
  /^happy to/i,
  /^just listed:/i,
];

// ── Format checks ─────────────────────────────────────────────────────────────
const REQUIRED_SECTIONS = ["### CAPTION", "### SLIDE COPY", "### MOTION SPEC"];

export function scorePost(raw: string, caption?: string, bannedHashtags?: string[], platform?: string): QualityResult {
  const flags: QualityFlag[] = [];
  let deductions = 0;

  const text = raw + (caption ?? "");

  // 1. Required sections present (post output format)
  if (raw.length > 100) {
    for (const section of REQUIRED_SECTIONS) {
      if (!raw.includes(section)) {
        flags.push({ severity: "error", rule: "missing_section", detail: `Missing ${section}` });
        deductions += 15;
      }
    }
  }

  // 2. Banned phrases
  for (const { phrase, replacement } of BANNED) {
    if (phrase.test(text)) {
      flags.push({ severity: "error", rule: "banned_phrase", detail: `"${phrase.source.replace(/\\b|\\i|\/gi/g, "")}" found — use: ${replacement}` });
      deductions += 12;
    }
  }

  // 3. Hook quality — first line of caption
  const captionText = caption ?? extractSection(raw, "CAPTION");
  if (captionText) {
    const firstLine = captionText.split("\n")[0].trim();
    for (const weak of WEAK_HOOKS) {
      if (weak.test(firstLine)) {
        flags.push({ severity: "warning", rule: "weak_hook", detail: `Hook is weak: "${firstLine.slice(0, 60)}"` });
        deductions += 8;
        break;
      }
    }
    // Hook too long
    if (firstLine.length > 120) {
      flags.push({ severity: "warning", rule: "hook_too_long", detail: `Hook is ${firstLine.length} chars — aim for < 80` });
      deductions += 5;
    }
    // Hashtag rules are platform-specific
    const tags = (captionText.match(/#\w+/g) ?? []).length;
    const isFb = platform === "facebook";
    const isLi = platform === "linkedin";
    if (isFb) {
      if (tags > 2) {
        flags.push({ severity: "warning", rule: "hashtag_overload_fb", detail: `${tags} hashtags on Facebook — use 0–2 max (FB penalizes stacking)` });
        deductions += 6;
      }
    } else if (isLi) {
      if (tags > 3) {
        flags.push({ severity: "warning", rule: "hashtag_overload_li", detail: `${tags} hashtags on LinkedIn — keep to 1–3 professional tags` });
        deductions += 5;
      }
    } else {
      // Instagram defaults
      if (tags > 10) {
        flags.push({ severity: "warning", rule: "hashtag_overload", detail: `${tags} hashtags — cap at 8` });
        deductions += 5;
      }
      if (tags > 0 && tags < 3) {
        flags.push({ severity: "info", rule: "few_hashtags", detail: `Only ${tags} hashtags — use 5–8 hyperlocal ones` });
        deductions += 3;
      }
    }
  }

  // 4. Slide copy present and structured
  const slides = extractSection(raw, "SLIDE COPY");
  if (slides && raw.includes("### SLIDE COPY")) {
    const slideCount = (slides.match(/^SLIDE \d/gm) ?? []).length;
    if (slideCount < 3) {
      flags.push({ severity: "warning", rule: "too_few_slides", detail: `Only ${slideCount} slides — aim for 4–5` });
      deductions += 5;
    }
    if (slideCount > 6) {
      flags.push({ severity: "info", rule: "too_many_slides", detail: `${slideCount} slides is a lot — consider cutting to 5` });
      deductions += 3;
    }
  }

  // 5. Length check on caption body
  if (captionText) {
    const words = captionText.split(/\s+/).length;
    if (words > 200) {
      flags.push({ severity: "warning", rule: "caption_too_long", detail: `Caption is ${words} words — aim for under 120` });
      deductions += 5;
    }
  }

  // 6. Oracle-banned hashtags (populated by Loop 32 when reach data shows negative lift)
  if (bannedHashtags?.length) {
    const postTags = (captionText?.match(/#\w+/g) ?? []).map(t => t.toLowerCase());
    const banned = bannedHashtags.map(t => t.toLowerCase().replace(/^#/, ""));
    const hits = postTags.filter(t => banned.includes(t.replace("#", "")));
    if (hits.length > 0) {
      flags.push({ severity: "warning", rule: "banned_hashtag", detail: `Remove low-reach hashtags: ${hits.join(", ")}` });
      deductions += hits.length * 5;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return { score, grade, flags, passed: score >= 70 };
}

function extractSection(raw: string, sectionName: string): string {
  const idx = raw.indexOf(`### ${sectionName}`);
  if (idx === -1) return "";
  const next = raw.indexOf("###", idx + 4);
  return next === -1 ? raw.slice(idx + sectionName.length + 5) : raw.slice(idx + sectionName.length + 5, next);
}

export function gradeColor(grade: QualityResult["grade"]): string {
  return { A: "#4ADE80", B: "#86efac", C: "#EE8172", D: "#f87171", F: "#dc2626" }[grade];
}

export function scoreReelHook(hook: string): QualityResult {
  const flags: QualityFlag[] = [];
  let deductions = 0;

  // Length check
  if (hook.length > 125) {
    flags.push({ severity: "warning", rule: "hook_too_long", detail: `Reel hook is ${hook.length} chars — aim for under 125` });
    deductions += 15;
  }

  // Weak opener (reuses same WEAK_HOOKS patterns)
  for (const weak of WEAK_HOOKS) {
    if (weak.test(hook)) {
      flags.push({ severity: "error", rule: "weak_opener", detail: `Reel hook opens weakly: "${hook.slice(0, 60)}"` });
      deductions += 20;
      break;
    }
  }

  // Banned phrases
  for (const { phrase, replacement } of BANNED) {
    if (phrase.test(hook)) {
      flags.push({ severity: "error", rule: "banned_phrase", detail: `"${phrase.source.replace(/\\b|\\i/g, "")}" in reel hook — use: ${replacement}` });
      deductions += 12;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, flags, passed: score >= 80 };
}

export function scoreCarouselSlide(slide: string, isFinalSlide: boolean): QualityResult {
  const flags: QualityFlag[] = [];
  let deductions = 0;

  // Length check — -5 per 10 chars over 80
  if (slide.length > 80) {
    const over = slide.length - 80;
    const penalty = Math.ceil(over / 10) * 5;
    flags.push({ severity: "warning", rule: "slide_too_long", detail: `Slide is ${slide.length} chars — aim for under 80` });
    deductions += Math.min(penalty, 25);
  }

  // No ending punctuation
  const trimmed = slide.trimEnd();
  if (trimmed.length > 0 && !/[.!?…"'»)]$/.test(trimmed) && !/\p{Emoji}$/u.test(trimmed)) {
    flags.push({ severity: "warning", rule: "no_ending_punctuation", detail: "Slide ends mid-thought — add punctuation or an em-dash" });
    deductions += 8;
  }

  // Final slide needs a CTA
  if (isFinalSlide && !/dm|comment|follow|save|share|visit|call|text|link|tap|click/i.test(slide)) {
    flags.push({ severity: "error", rule: "final_slide_no_cta", detail: "Final slide must include a CTA (DM, comment, follow, save, etc.)" });
    deductions += 15;
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, flags, passed: score >= 70 };
}
