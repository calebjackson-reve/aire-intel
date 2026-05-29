// Template library — used as a fallback when Anthropic API is unavailable
// (rate-limited, credits empty, network failure, etc.).
//
// Each template uses variable substitution:
//   {firstName}  → lead's first name (defaults to "there")
//   {priceRange} → price range string
//   {areas}      → areas of interest
//   {stage}      → pipeline stage label
//
// All templates are written in Caleb's voice — short, specific, conversational,
// no template-y "I hope this finds you well" energy.

export interface TemplateContext {
  firstName: string | null;
  name: string;
  pricePoint?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  areas?: string | null;
  stage: string;
  type?: string | null;
  daysSinceContact?: number | null;
  motivation?: string | null;
  source?: string | null;
}

// ─── Generic cold reactivation templates (8 variants) ────────────────────────

const COLD_TEMPLATES = [
  "Hey {firstName} — been a minute. Quick check-in: still thinking about {areaPhrase} or has the search shifted? Rates moved this week and I wanted to flag it.",
  "{firstName}, quick one — saw a couple of new {pricePhrase} listings come up that fit what you described. Want me to send the addresses?",
  "Hey {firstName}, market here in BR has been moving. Was thinking about your situation — still looking, or did life happen?",
  "{firstName} — circling back. I held off because I didn't want to be pushy, but I have a feeling now's actually a smart window. Worth a 5-min call this week?",
  "Hey {firstName}, no pressure — just want to make sure I'm not the agent that ghosted you. Where's your head at on the home search?",
  "{firstName}, been a while. Two questions: (1) still planning to move, and (2) is your timeline still {timelinePhrase}? Just want to make sure I'm useful when you need me.",
  "Hey {firstName} — quick honest check-in. I've got a few buyers I'm working with and your name kept coming to mind. Anything change on your end?",
  "{firstName}, I came across something interesting today that made me think of you. Free for a 2-min text update on where you're at?",
];

// ─── Stage-specific templates ────────────────────────────────────────────────

const ACTIVE_STAGE_TEMPLATES = [
  "Hey {firstName} — wanted to keep momentum going. What's the next thing you need from me to move forward?",
  "{firstName}, just sent over an updated list of homes that hit your filters. Anything jumping out?",
  "Hey {firstName}, are we still aiming for {timelinePhrase}? Want to make sure my schedule lines up with yours.",
];

const SHOWING_STAGE_TEMPLATES = [
  "Hey {firstName} — wanted to debrief on the showings. What stood out, what was a no?",
  "{firstName}, any of those properties still on your mind? I can re-tour anything or pull comps if you want to make an offer.",
  "Hey {firstName}, between us — which one are you actually thinking about? Let's strategize before the market does.",
];

const NEW_LEAD_TEMPLATES = [
  "Hey {firstName}, this is Caleb with Rêve Realtors here in Baton Rouge. Got your info — want to make this stupid easy for you. What's your situation, buyer or seller side?",
  "{firstName} — Caleb here. Saw you came in as a lead. Whether you're months out or this weekend, my job is to make it simple. What's the dream?",
  "Hey {firstName}, this is Caleb. Real quick — what kicked off the search? Sometimes that one detail tells me everything I need to know.",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPriceRange(ctx: TemplateContext): string {
  if (ctx.priceMin && ctx.priceMax) {
    return `$${(ctx.priceMin / 1000).toFixed(0)}–$${(ctx.priceMax / 1000).toFixed(0)}k`;
  }
  if (ctx.pricePoint) {
    return `~$${(ctx.pricePoint / 1000).toFixed(0)}k`;
  }
  return "your price range";
}

function formatAreas(ctx: TemplateContext): string {
  if (!ctx.areas) return "the area you were looking at";
  const list = ctx.areas.split(",").map(a => a.trim()).filter(Boolean);
  if (list.length === 0) return "the area you were looking at";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} or ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, or ${list[list.length - 1]}`;
}

function pickTemplate(ctx: TemplateContext): string {
  // Stage-specific first
  if (ctx.stage === "showing" && SHOWING_STAGE_TEMPLATES.length) {
    return SHOWING_STAGE_TEMPLATES[Math.floor(Math.random() * SHOWING_STAGE_TEMPLATES.length)];
  }
  if (ctx.stage === "active" && ACTIVE_STAGE_TEMPLATES.length) {
    return ACTIVE_STAGE_TEMPLATES[Math.floor(Math.random() * ACTIVE_STAGE_TEMPLATES.length)];
  }
  if (ctx.stage === "new_lead" && ctx.daysSinceContact === null) {
    // Never-contacted new lead → use the intro templates
    return NEW_LEAD_TEMPLATES[Math.floor(Math.random() * NEW_LEAD_TEMPLATES.length)];
  }
  // Default: cold reactivation
  return COLD_TEMPLATES[Math.floor(Math.random() * COLD_TEMPLATES.length)];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderTemplate(ctx: TemplateContext): string {
  const template = pickTemplate(ctx);

  const firstName = (ctx.firstName || ctx.name?.split(" ")[0] || "there").trim();
  const pricePhrase = formatPriceRange(ctx);
  const areaPhrase = formatAreas(ctx);
  const timelinePhrase = "this year"; // generic — could be smarter if lead.timeline is known

  return template
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{pricePhrase\}/g, pricePhrase)
    .replace(/\{areaPhrase\}/g, areaPhrase)
    .replace(/\{timelinePhrase\}/g, timelinePhrase)
    .replace(/\{stage\}/g, ctx.stage.replace(/_/g, " "))
    .trim();
}
