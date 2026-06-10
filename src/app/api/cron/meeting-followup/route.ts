// Cron: meeting-followup — scans for calendly_followup_pending items past scheduledFor,
// generates post-meeting draft via generateDraft(), converts to draft_message for approval.
// AIRE: loop:calendly-post-meeting-followup
//
// Runs every 15 minutes (vercel.json cron). Validates CRON_SECRET bearer token.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDraft } from "@/lib/draft-agent";
import { logError, withRetry } from "@/lib/error-memory";

export async function POST(req: NextRequest) {
  // AIRE: loop:calendly-post-meeting-followup — auth
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // AIRE: loop:calendly-post-meeting-followup — find pending follow-up items past their scheduledFor
  const items = await prisma.actionQueue.findMany({
    where: {
      type: "calendly_followup_pending",
      status: "pending",
      scheduledFor: { lte: now },
    },
    take: 10,
    orderBy: { scheduledFor: "asc" },
  });

  const results: { id: string; leadId: string | null; ok: boolean; error?: string }[] = [];

  for (const item of items) {
    const payload = item.payload as {
      leadId: string;
      meetingType?: string;
      meetingTime?: string;
      meetingEndTime?: string;
      calendlyEventId?: string;
      inviteeName?: string;
    };

    try {
      // AIRE: loop:calendly-post-meeting-followup — generate post-meeting draft
      const draft = await withRetry(
        () =>
          generateDraft({
            leadId: payload.leadId,
            channel: "email",
            source: "followup",
            instruction: `Post-meeting follow-up after ${payload.meetingType ?? "meeting"} with ${payload.inviteeName ?? "the client"}. Thank them, recap what was discussed, and offer a clear next step.`,
          }),
        { type: "ai", source: "cron/meeting-followup" }
      );

      // Convert from pending to reviewable draft — status stays "pending" for human approval
      // AIRE: loop:calendly-post-meeting-followup
      await prisma.actionQueue.update({
        where: { id: item.id },
        data: {
          type: "draft_message",
          payload: {
            ...payload,
            draftBody: draft.body,
            draftSubject: draft.subject,
            draftChannel: draft.channel,
          },
        },
      });

      results.push({ id: item.id, leadId: item.leadId, ok: true });
    } catch (err) {
      await logError("ai", "cron/meeting-followup", err, {
        itemId: item.id,
        leadId: payload.leadId,
        calendlyEventId: payload.calendlyEventId,
      });
      results.push({ id: item.id, leadId: item.leadId, ok: false, error: String(err) });
    }
  }

  return Response.json({ processed: results.length, results });
}
