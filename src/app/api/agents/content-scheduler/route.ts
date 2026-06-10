import { prisma } from "@/lib/prisma";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";

// Content Scheduler Agent — runs at 4:00 AM CT (10:00 UTC) via Vercel cron
// Determines today's content type, generates a post, queues for approval

const SCHEDULE: Record<number, string> = {
  0: "client_story",      // Sunday
  1: "market_update",     // Monday
  2: "listing_spotlight", // Tuesday
  3: "educational",       // Wednesday
  4: "market_update",     // Thursday
  5: "listing_spotlight", // Friday
  6: "reel",              // Saturday
};

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runContentScheduler();
}

export async function GET() {
  return runContentScheduler();
}

async function runContentScheduler() {
  const runId = await startRun("content_scheduler");
  const today = getTodayCT();

  try {
    // Idempotency — if already ran today, return existing
    const existing = await prisma.actionQueue.findFirst({
      where: { agentType: "content_scheduler", briefDate: today },
      select: { id: true },
    });
    if (existing) {
      await finishRun(runId, { itemsProcessed: 0, actionsQueued: 0 });
      return Response.json({ ok: true, skipped: true, reason: "Already ran today" });
    }

    const dayOfWeek = new Date(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    ).getDay();

    // Determine today's content type from schedule
    const ctDayOfWeek = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
    }).format(new Date());
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const ctDay = dayMap[ctDayOfWeek] ?? dayOfWeek;
    const contentType = SCHEDULE[ctDay] ?? "market_update";

    let caption = "";
    let brief = "";
    let trendSignalId: string | undefined;

    if (contentType === "educational") {
      // Pull from TrendSignal table
      const trend = await prisma.trendSignal.findFirst({
        where: { status: "new" },
        orderBy: { score: "desc" },
        select: { id: true, topic: true, hook: true, detail: true },
      });
      if (trend) {
        trendSignalId = trend.id;
        brief = `Educational post about: ${trend.topic}. Hook: ${trend.hook ?? ""}. ${trend.detail ?? ""}`;
        caption = await generateCaption(contentType, brief);
        await prisma.trendSignal.update({ where: { id: trend.id }, data: { status: "queued" } });
      }
    } else if (contentType === "listing_spotlight") {
      // Pull a recent active listing or Zillow hot listing
      const zillow = await prisma.zillowHotListing.findFirst({
        where: { usedInPostId: null },
        orderBy: [{ viewCount: "desc" }, { fetchedAt: "desc" }],
        select: { id: true, address: true, city: true, price: true, beds: true, baths: true, viewCount: true },
      });
      if (zillow) {
        brief = `Listing spotlight: ${zillow.address}, ${zillow.city}. Price: $${zillow.price?.toLocaleString() ?? "TBD"}. ${zillow.beds ?? "?"}bd/${zillow.baths ?? "?"}ba. Zillow views: ${zillow.viewCount ?? 0}`;
        caption = await generateCaption(contentType, brief);
      }
    } else if (contentType === "client_story") {
      // Pull a recently closed lead
      const closed = await prisma.lead.findFirst({
        where: { stage: "closed" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, address: true, type: true },
      });
      if (closed) {
        brief = `Client story: ${closed.type === "buyer" ? "Buyers" : "Sellers"} closing on ${closed.address ?? "their dream home"}`;
        caption = await generateCaption(contentType, brief);
      }
    } else {
      brief = `${contentType.replace("_", " ")} for Baton Rouge real estate market — Rêve Realtors`;
      caption = await generateCaption(contentType, brief);
    }

    if (!caption) {
      caption = `${contentType.replace(/_/g, " ")} — Caleb Jackson | Rêve Realtors® Baton Rouge`;
    }

    // Create ContentProject
    const project = await prisma.contentProject.create({
      data: {
        type: contentType,
        status: "drafting",
        brief,
        captionDraft: caption,
        platform: "instagram,facebook",
        trendSignalId: trendSignalId ?? null,
      },
    });

    // Queue for approval
    await prisma.actionQueue.create({
      data: {
        type: "post_content",
        agentType: "content_scheduler",
        priority: 3,
        briefDate: today,
        requiresApproval: true,
        payload: {
          contentProjectId: project.id,
          contentType,
          caption: caption.slice(0, 200),
          platform: "instagram,facebook",
          brief,
        },
      },
    });

    await finishRun(runId, { itemsProcessed: 1, actionsQueued: 1 });

    return Response.json({
      ok: true,
      runId,
      contentType,
      contentProjectId: project.id,
      captionPreview: caption.slice(0, 100),
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

async function generateCaption(contentType: string, brief: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  const prompts: Record<string, string> = {
    market_update: "Write a 2-sentence Instagram caption for a Baton Rouge real estate market update. Be specific, professional, use one data point. No hashtag spam.",
    listing_spotlight: "Write a punchy 2-sentence Instagram caption for a listing spotlight. Lead with the lifestyle, not specs. Mention Rêve Realtors® subtly.",
    educational: "Write a 2-sentence educational Instagram caption for Baton Rouge home buyers/sellers. Make the insight feel exclusive. Direct, not fluffy.",
    client_story: "Write a warm, brief 2-sentence Instagram caption celebrating a client closing. Genuine, not canned.",
    reel: "Write a 1-sentence hook for a real estate Reel. It should stop the scroll. No emojis in the hook.",
    client_story_repost: "Write a 2-sentence Instagram caption for a client story repost.",
  };

  const systemPrompt = prompts[contentType] ?? prompts.market_update;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: `${systemPrompt}\n\nContext: ${brief}\n\nCaption only — no preamble.` }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return "";
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}
