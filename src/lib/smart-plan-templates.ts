// Pre-built smart plan templates. One-click install — no AI required.
// All messages are written in Caleb's voice: short, specific, conversational,
// Baton Rouge-aware, never template-y.

export interface PlanStep {
  day: number;
  method: "text" | "call" | "email" | "task";
  message: string;
  subject?: string;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: "new_lead" | "stage_change" | "no_contact" | "manual";
  category: "nurture" | "reactivation" | "transaction" | "sphere" | "marketing";
  durationDays: number;
  steps: PlanStep[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  // ─── New Lead Welcome ─────────────────────────────────────────────────────
  {
    id: "new_lead_welcome_7d",
    name: "New Lead Welcome — 7 Day Sprint",
    description: "Fast first-touch sequence to convert a fresh lead into a real conversation in the first week.",
    triggerType: "new_lead",
    category: "nurture",
    durationDays: 7,
    steps: [
      { day: 0, method: "text", message: "Hey {firstName} — Caleb here from Rêve Realtors. Just got your info. Quick question: are you looking to move soon, or just keeping an eye on the market? Either way, I'll be useful." },
      { day: 0, method: "task", message: "Look up the lead's source and any prior touches in Lofty. Note anything specific in AIRE notes field." },
      { day: 1, method: "call", message: "First voice call. Goal: confirm timeline, type (buyer/seller), and what they actually need. 5 min max. Leave a voicemail if no answer." },
      { day: 2, method: "text", message: "Hey {firstName} — didn't catch you yesterday. No rush, just wanted to put a face to the name. What's a good window this week for a 5-min call?" },
      { day: 4, method: "email", subject: "Quick intro + what I can do for you", message: "Hey {firstName} —\n\nQuick intro since we haven't connected by phone yet. I'm Caleb Jackson, real estate broker with Rêve Realtors here in Baton Rouge. I work mostly East Baton Rouge, West Feliciana, and Pointe Coupee.\n\nMy approach: I don't push, I solve. Tell me your situation and I'll show you what I'd do if I were in your shoes.\n\nIf you want to chat, here's my Calendly: [link]\nOr just reply with a window that works.\n\n— Caleb\n225-XXX-XXXX" },
      { day: 7, method: "text", message: "Hey {firstName} — last check-in for now. Want to make sure I'm in your phone for whenever you're ready. I'll back off and let you reach out when the timing's right. 👊" },
    ],
  },

  // ─── Cold Lead Reactivation ───────────────────────────────────────────────
  {
    id: "cold_reactivation_30d",
    name: "Cold Lead Reactivation — 30 Day Re-Engage",
    description: "Six-touch sequence for leads that have gone cold 60+ days. Each touch tries a different angle.",
    triggerType: "no_contact",
    category: "reactivation",
    durationDays: 30,
    steps: [
      { day: 0, method: "text", message: "Hey {firstName} — been a minute. Quick check-in: still thinking about a move this year, or has life happened? Either way, I want to make sure I'm not the agent that ghosted." },
      { day: 4, method: "email", subject: "Saw this and thought of you", message: "Hey {firstName} — saw something in the market that reminded me of what you were looking for and figured I'd pass it along. If you want me to keep an eye out for anything specific, just reply and tell me what's changed.\n\n— Caleb" },
      { day: 10, method: "call", message: "Voice call. Tone: not selling, just checking in. If they pick up, ask about life first. If voicemail: 'Hey it's Caleb — no agenda, just wanted to say hi. Call when convenient.'" },
      { day: 17, method: "text", message: "Hey {firstName} — rate moved this week. Worth knowing if you're still in the market. No pitch, just sending the number." },
      { day: 24, method: "text", message: "{firstName} — quick honest one: do you want me to stop reaching out, or keep checking in occasionally? Whatever's helpful." },
      { day: 30, method: "task", message: "If no response by day 30: mark lead as 'cold archive' and move to quarterly sphere cadence. Don't keep pestering." },
    ],
  },

  // ─── Under Contract Milestones ────────────────────────────────────────────
  {
    id: "under_contract_milestones",
    name: "Under Contract Milestones — Inspection to Close",
    description: "Auto-touch the client at each contract milestone so they always feel held through the process.",
    triggerType: "stage_change",
    category: "transaction",
    durationDays: 45,
    steps: [
      { day: 0, method: "text", message: "{firstName} — congrats, we're under contract on {address}. Here's what happens next over the next ~30 days. I'll touch you at each milestone so you never wonder where things are." },
      { day: 1, method: "email", subject: "Your home buying timeline — what to expect", message: "Hey {firstName} —\n\nNow that we're under contract, here's the rough timeline:\n\n• Inspection: usually within 7-10 days\n• Appraisal: 14-21 days\n• Final walkthrough: day before closing\n• Closing: 30-45 days from acceptance\n\nI'll touch base before each one. If anything makes you nervous, text me. That's literally what I'm here for.\n\n— Caleb" },
      { day: 5, method: "task", message: "Confirm inspection scheduled. Send {firstName} the inspector's name + report turnaround time the night before." },
      { day: 7, method: "text", message: "Hey {firstName} — inspection tomorrow. I'll be there. Anything specific you want me to ask the inspector to focus on?" },
      { day: 10, method: "call", message: "Post-inspection debrief call. Walk them through findings, discuss what we're negotiating and what we're letting go. Reset expectations." },
      { day: 14, method: "text", message: "{firstName} — appraisal should be hitting this week. I'll let you know the moment the value comes back. Hold tight." },
      { day: 21, method: "text", message: "Appraisal in — let me know if you want to chat through it." },
      { day: 28, method: "task", message: "Confirm closing date locked. Send {firstName} the title company's address + what to bring (ID, wire instructions, etc.)." },
      { day: 30, method: "text", message: "{firstName} — final walkthrough tomorrow. I'll meet you there at [time]. Almost done. 🤝" },
      { day: 31, method: "text", message: "Closing day. Bring your ID and your patience. See you there — let's get you those keys." },
      { day: 32, method: "task", message: "Post-close: drop off a closing gift (mum, bottle, gift card to a local restaurant). Take photo for social. Tag client if they're cool with it." },
      { day: 45, method: "text", message: "Hey {firstName} — 2 weeks in. How's the new place? Anything settling weird? I know a guy for almost everything if you need a referral." },
    ],
  },

  // ─── Sphere Quarterly Check-In ───────────────────────────────────────────
  {
    id: "sphere_quarterly_90d",
    name: "Sphere Quarterly — Stay in Front of Past Clients",
    description: "Four touches per year. Keeps you top of mind without being a pest. The relationship play.",
    triggerType: "stage_change",
    category: "sphere",
    durationDays: 365,
    steps: [
      { day: 0, method: "text", message: "Hey {firstName} — random check-in. How's the house treating you?" },
      { day: 90, method: "email", subject: "Your home's value — annual snapshot", message: "Hey {firstName} —\n\nQuick annual snapshot of what your home would likely sell for today, based on recent comps in your neighborhood. No pitch — just info. Some folks like to know.\n\n[Generated CMA attached]\n\nIf any neighbors are talking about selling, I'd appreciate the intro.\n\n— Caleb" },
      { day: 180, method: "text", message: "{firstName} — halfway through the year. Any home plans? Renovations, moves, anything I can help with? Or just say 'good' and I'll back off till Q4." },
      { day: 270, method: "task", message: "Send a holiday card or a small token (pumpkin in October, pecan pie at Thanksgiving, whatever fits the relationship). Hand-written note." },
      { day: 365, method: "text", message: "Hey {firstName} — happy {anniversary} in the house! Year flies. Hope it still feels like home." },
    ],
  },

  // ─── Open House Follow-Up ────────────────────────────────────────────────
  {
    id: "open_house_follow_5d",
    name: "Open House Follow-Up — 5 Day Conversion",
    description: "For visitors who signed in at an open house. Move them from 'looker' to real buyer in a week.",
    triggerType: "manual",
    category: "nurture",
    durationDays: 5,
    steps: [
      { day: 0, method: "text", message: "Hey {firstName} — Caleb here, just met you at the {address} open house. Thanks for stopping by. Quick question: what'd you actually think of the place?" },
      { day: 1, method: "email", subject: "{address} — comps + the rest of the picture", message: "Hey {firstName} —\n\nFollowing up on yesterday. I pulled the recent comps for {address} (attached) so you can see how the price compares to what's actually closed nearby. Also tossed in 3 similar homes in the same area you might want to see.\n\nWant to tour any of these? I'm pretty flexible this week.\n\n— Caleb" },
      { day: 2, method: "call", message: "Voice call. If they're interested in {address}, push for an offer conversation. If they're 'still looking', schedule a real buyer consultation." },
      { day: 4, method: "text", message: "Hey {firstName} — that {address} place is getting some attention. If you're seriously considering it, want to chat before it gets locked up?" },
      { day: 5, method: "task", message: "Decision point: are they real or were they tire-kickers? If real, enroll in 'New Lead Welcome' sequence. If not, archive to cold." },
    ],
  },

  // ─── Post-Close Google Review Request ────────────────────────────────────
  // Fires when a lead moves to stage "closed" (day 0 = closing day). Texts
  // are the workhorse (highest open rate); email is the backup; the sequence
  // ends gracefully and never pesters. Replace [REVIEW_LINK] with Caleb's
  // Google review short link (Business Profile → Ask for reviews → copy link),
  // or set it once and the executor substitutes {reviewLink}.
  {
    id: "post_close_review_14d",
    name: "Post-Close Review Request — 14 Day Ask",
    description: "Catch past clients at peak-happiness right after closing and turn it into a Google review. Ends after one gentle final ask — no pestering.",
    triggerType: "stage_change",
    category: "sphere",
    durationDays: 14,
    steps: [
      { day: 1, method: "text", message: "{firstName} — congrats again on {address}, so glad we got you in. If you've got 30 seconds, a quick Google review genuinely helps me more than anything: [REVIEW_LINK]" },
      { day: 2, method: "task", message: "Personal touch: if {firstName} was happy at closing, send a quick voice note or DM thanking them — and mention the review link's in your last text. Make it feel personal, not automated." },
      { day: 5, method: "email", subject: "One quick favor", message: "Hey {firstName} —\n\nHope the first few days at {address} have been smooth. One small favor when you get a sec — a quick Google review means a lot for a local agent and takes about 30 seconds:\n\n[REVIEW_LINK]\n\nNo worries if you're slammed. Either way I'm a text away for anything house-related — contractors, handymen, whatever you need.\n\n— Caleb" },
      { day: 10, method: "text", message: "{firstName} — promise this is the last nudge. If you have a minute for that quick review it'd really help me out: [REVIEW_LINK]. If not, no sweat at all — enjoy the new place." },
      { day: 14, method: "task", message: "Close the loop: did {firstName} leave a review? If yes — send a genuine thank-you and ask if they know anyone thinking of selling. If no — stop here, don't ask again, and move them to 'Sphere Quarterly'." },
    ],
  },

  // ─── Buyer Search Activation ─────────────────────────────────────────────
  {
    id: "buyer_search_activation_14d",
    name: "Buyer Search Activation — 14 Day Tour Prep",
    description: "Two-week sequence to convert a buyer search profile into a signed buyer rep + first tour.",
    triggerType: "manual",
    category: "nurture",
    durationDays: 14,
    steps: [
      { day: 0, method: "text", message: "Hey {firstName} — I've got your search dialed in. Sending listings as they come up. Want a buyer consultation call this week to lock in the strategy?" },
      { day: 2, method: "email", subject: "Your first batch of matches", message: "Hey {firstName} —\n\nHere are the first 5 properties that match what you described. Honest takes on each:\n\n[Generated listing summary]\n\nThis weekend works for tours if you want to hit 2-3 in a row. Let me know.\n\n— Caleb" },
      { day: 5, method: "text", message: "{firstName} — any of those grab you? Quick yes/no per address and I'll set up showings for the ones worth seeing." },
      { day: 7, method: "call", message: "Buyer consultation call. Cover: timeline, preapproval status, must-haves vs nice-to-haves, who else is on the decision, and confirm signing a buyer rep agreement." },
      { day: 10, method: "task", message: "If unrepresented: ask for buyer rep signature. Send the form via Dotloop with a 2-min Loom explaining why it matters." },
      { day: 12, method: "text", message: "Tour day prep — I'll be in front of {address} at [time]. We're hitting 3 houses in [area]. Wear walking shoes." },
      { day: 14, method: "task", message: "Post-tour: same-day debrief. Rank the homes 1-3. Discuss writing an offer. If no spark, refine search criteria." },
    ],
  },
];

export function getTemplate(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find(t => t.id === id);
}
