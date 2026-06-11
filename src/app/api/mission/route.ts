export const dynamic = "force-dynamic";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";

/**
 * The Daily Mission engine.
 *
 * This is the heart of AIRE. It does the thinking so the agent doesn't have to.
 * Returns exactly 3 prioritized moves for today, each with the message pre-written
 * and one-tap-ready. No browsing, no deciding — just execute.
 *
 * Prioritization rules (in order):
 *   1. Time-sensitive: under-contract milestones due today/tomorrow
 *   2. Hot signal: new leads <48h old, never contacted
 *   3. Cold but valuable: was active, went cold 7-21 days
 *   4. Sphere check-in: closed/referral leads at 90+ days
 *   5. Content: weekly market post if it's Wed-Sat and nothing posted this week
 *
 * Hard rules:
 *   - Never more than 3 moves (decision fatigue defeats the whole point)
 *   - Always end with the easiest one (momentum compounds)
 *   - Every move ships with a pre-written message
 */

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface Move {
  id: string;
  rank: 1 | 2 | 3;
  type: "call" | "text" | "email" | "post" | "task";
  title: string;
  why: string;
  leadId?: string;
  leadName?: string;
  phone?: string;
  email?: string;
  prefilledMessage?: string;
  emailSubject?: string;
  estMinutes: number;
  href?: string;
}

export async function GET() {
  const now = Date.now();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  });
  const hour = new Date().toLocaleString("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/Chicago",
  });
  const hourNum = parseInt(hour, 10);
  const greeting = hourNum < 12 ? "Good morning" : hourNum < 17 ? "Good afternoon" : "Good evening";
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat

  // ─── Pull pipeline state ─────────────────────────────────────────────
  const [activeLeads, contractLeads, sphereLeads, recentPost] = await Promise.all([
    prisma.lead.findMany({
      where: { stage: { in: ["new_lead", "active", "showing"] } },
      orderBy: [{ lastContactDate: "asc" }, { createdAt: "desc" }],
      include: { timeline_logs: { take: 3, orderBy: { createdAt: "desc" } } },
      take: 30,
    }),
    prisma.lead.findMany({
      where: { stage: "under_contract" },
      orderBy: { nextActionDate: "asc" },
    }),
    prisma.lead.findMany({
      where: {
        OR: [
          { stage: "closed" },
          { source: { contains: "sphere" } },
          { source: { contains: "referral" } },
        ],
        AND: [
          {
            OR: [
              { lastContactDate: null },
              { lastContactDate: { lt: new Date(now - 90 * 86_400_000) } },
            ],
          },
        ],
      },
      take: 10,
      orderBy: { lastContactDate: "asc" },
    }),
    (async () => {
      const start = new Date();
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return prisma.generatedPost.findFirst({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: "desc" },
      });
    })(),
  ]);

  // ─── Build context blocks for the AI ────────────────────────────────
  const daysSince = (d: Date | null) =>
    d ? Math.floor((now - new Date(d).getTime()) / 86_400_000) : null;

  const pipelineSnapshot = {
    hotLeads: activeLeads
      .filter((l) => {
        const ds = daysSince(l.lastContactDate);
        return ds === null || ds <= 2;
      })
      .slice(0, 8)
      .map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        stage: l.stage,
        pricePoint: l.pricePoint,
        motivation: l.motivation,
        source: l.source,
        daysSinceContact: daysSince(l.lastContactDate),
        recentNotes: l.timeline_logs.map((t) => `${t.method}: ${t.note?.slice(0, 80) ?? ""}`).join(" | "),
      })),
    coldLeads: activeLeads
      .filter((l) => {
        const ds = daysSince(l.lastContactDate);
        return ds !== null && ds >= 5 && ds <= 30;
      })
      .slice(0, 8)
      .map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        stage: l.stage,
        pricePoint: l.pricePoint,
        motivation: l.motivation,
        daysSinceContact: daysSince(l.lastContactDate),
        recentNotes: l.timeline_logs.map((t) => `${t.method}: ${t.note?.slice(0, 80) ?? ""}`).join(" | "),
      })),
    underContract: contractLeads.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      pricePoint: l.pricePoint,
      nextActionDate: l.nextActionDate,
      nextActionNote: l.nextActionNote,
      daysSinceContact: daysSince(l.lastContactDate),
    })),
    sphereDue: sphereLeads.slice(0, 5).map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      daysSinceContact: daysSince(l.lastContactDate),
    })),
    contentStatus: {
      postedThisWeek: !!recentPost,
      lastPostType: recentPost?.postType,
      isContentDay: dayOfWeek >= 3 && dayOfWeek <= 6, // Wed-Sat
    },
  };

  // ─── Ask the AI to pick the 3 moves ─────────────────────────────────
  const userPrompt = `Today is ${today}. It is ${greeting.toLowerCase().split(" ")[1]}.

Caleb is one person running his entire business. He has a TC and a showing assistant, that's it. He cannot do 20 things today. He needs you to pick the 3 highest-impact moves for the next 90 minutes.

Pipeline snapshot:
${JSON.stringify(pipelineSnapshot, null, 2)}

PICK EXACTLY 3 MOVES. Order them by impact × urgency. Rules:

1. If there's an under-contract milestone due in next 48h → move 1
2. If there's a hot lead never contacted or last touched <48h ago → high priority
3. Cold leads that were ACTIVE (had real engagement) outrank cold sphere check-ins
4. Don't pick 3 follow-ups in a row — vary the type (call, text, email, post)
5. Last move should be the lightest lift — momentum matters
6. Skip content move unless it's Wed-Sat AND nothing was posted this week

For each move, write the ACTUAL MESSAGE he should send. Not a template. Not "Hey checking in." A real, specific, Caleb-voice message that references their actual situation. Under 3 sentences. No "just wanted to" or "just checking in" — ever.

Return ONLY this JSON, no other text:
{
  "intro": "one short line — encouraging, specific to today's pipeline, NOT generic. Like a coach who saw the tape.",
  "moves": [
    {
      "rank": 1,
      "type": "call" | "text" | "email" | "post" | "task",
      "title": "Short imperative — 'Call Sarah M.' or 'Text the Johnsons'",
      "why": "One sentence on why this matters NOW. Reference real context (price, days cold, what they were looking at).",
      "leadId": "the id from the snapshot, or null if it's a content/task move",
      "leadName": "name or null",
      "prefilledMessage": "the actual message to send — Caleb's voice, ready to copy/paste. For calls, write the OPENER they should say.",
      "emailSubject": "only if type=email",
      "estMinutes": 5
    },
    { ...rank 2 },
    { ...rank 3 }
  ]
}`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: REVE_PIPELINE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned no JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    // Enrich moves with lookup data (phone, email, href)
    const leadIndex = new Map(
      [...activeLeads, ...contractLeads, ...sphereLeads].map((l) => [l.id, l]),
    );
    const moves: Move[] = (parsed.moves ?? []).slice(0, 3).map((m: Move, i: number) => {
      const lead = m.leadId ? leadIndex.get(m.leadId) : null;
      return {
        id: `${Date.now()}-${i}`,
        rank: (i + 1) as 1 | 2 | 3,
        type: m.type,
        title: m.title,
        why: m.why,
        leadId: m.leadId,
        leadName: lead?.name ?? m.leadName,
        phone: lead?.phone ?? undefined,
        email: lead?.email ?? undefined,
        prefilledMessage: m.prefilledMessage,
        emailSubject: m.emailSubject,
        estMinutes: m.estMinutes ?? 5,
        href: m.leadId ? `/contacts/${m.leadId}` : m.type === "post" ? "/create-post" : undefined,
      };
    });

    return Response.json({
      date: today,
      greeting,
      intro: parsed.intro,
      moves,
      meta: {
        hotCount: pipelineSnapshot.hotLeads.length,
        coldCount: pipelineSnapshot.coldLeads.length,
        underContractCount: pipelineSnapshot.underContract.length,
        postedThisWeek: pipelineSnapshot.contentStatus.postedThisWeek,
        aiStatus: "ok",
        source: "ai",
      },
    });
  } catch (err) {
    // Fallback: deterministic mission from pipeline data, no AI
    const fallback = buildFallbackMission(pipelineSnapshot, dayOfWeek);
    return Response.json({
      date: today,
      greeting,
      intro: fallback.intro,
      moves: fallback.moves,
      meta: {
        hotCount: pipelineSnapshot.hotLeads.length,
        coldCount: pipelineSnapshot.coldLeads.length,
        underContractCount: pipelineSnapshot.underContract.length,
        postedThisWeek: pipelineSnapshot.contentStatus.postedThisWeek,
        aiStatus: "fallback",
        source: "template",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// Deterministic fallback mission if AI fails. Still useful, just less personalized.
function buildFallbackMission(
  snapshot: {
    hotLeads: Array<{ id: string; name: string; pricePoint: number | null; daysSinceContact: number | null }>;
    coldLeads: Array<{ id: string; name: string; pricePoint: number | null; daysSinceContact: number | null }>;
    underContract: Array<{ id: string; name: string; address: string | null; nextActionNote: string | null }>;
    sphereDue: Array<{ id: string; name: string }>;
    contentStatus: { postedThisWeek: boolean; isContentDay: boolean };
  },
  _dayOfWeek: number,
): { intro: string; moves: Move[] } {
  const moves: Move[] = [];

  // Move 1: under contract milestone
  if (snapshot.underContract[0]) {
    const l = snapshot.underContract[0];
    moves.push({
      id: `fb-1`,
      rank: 1,
      type: "text",
      title: `Check in with ${l.name}`,
      why: `${l.name} is under contract at ${l.address ?? "their property"}. Keep the deal moving.`,
      leadId: l.id,
      leadName: l.name,
      prefilledMessage: `Hey ${l.name.split(" ")[0]} — quick update on ${l.address ?? "the property"}. Where are we on inspection / financing? Want to make sure nothing slips.`,
      estMinutes: 5,
      href: `/contacts/${l.id}`,
    });
  }

  // Move 2: top cold lead
  if (snapshot.coldLeads[0]) {
    const l = snapshot.coldLeads[0];
    moves.push({
      id: `fb-2`,
      rank: 2,
      type: "text",
      title: `Reach out to ${l.name}`,
      why: `${l.daysSinceContact} days cold. Was looking ${l.pricePoint ? `at $${l.pricePoint.toLocaleString()}` : "actively"} — re-engage.`,
      leadId: l.id,
      leadName: l.name,
      prefilledMessage: `${l.name.split(" ")[0]}, saw something this week that made me think of you. You still in the market or did things shift?`,
      estMinutes: 3,
      href: `/contacts/${l.id}`,
    });
  }

  // Move 3: content or sphere
  if (snapshot.contentStatus.isContentDay && !snapshot.contentStatus.postedThisWeek) {
    moves.push({
      id: `fb-3`,
      rank: 3,
      type: "post",
      title: "Post weekly market update",
      why: "Nothing posted this week. Stay on the algorithm. Stay top-of-mind.",
      prefilledMessage: "Generate market update from /create-post",
      estMinutes: 10,
      href: "/create-post",
    });
  } else if (snapshot.sphereDue[0]) {
    const l = snapshot.sphereDue[0];
    moves.push({
      id: `fb-3`,
      rank: 3,
      type: "text",
      title: `Sphere check-in: ${l.name}`,
      why: `90+ days quiet. One text keeps the door open.`,
      leadId: l.id,
      leadName: l.name,
      prefilledMessage: `${l.name.split(" ")[0]} — been a minute. How's the house treating y'all?`,
      estMinutes: 2,
      href: `/contacts/${l.id}`,
    });
  }

  return {
    intro: moves.length > 0
      ? `${moves.length} move${moves.length > 1 ? "s" : ""} to make a dent in the next hour.`
      : "Pipeline is quiet. Use this time to prospect or post.",
    moves,
  };
}
