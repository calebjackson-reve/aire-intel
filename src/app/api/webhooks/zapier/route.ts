export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { processInboundReplyAction } from "@/lib/inbound-reply"; // AIRE: loop:inbound-reply-handler

/**
 * Inbound Zapier webhook receiver — the counterpart to src/lib/zapier.ts.
 *
 * Outbound: AIRE → Zapier (fire-and-forget events from triggerZap()).
 * Inbound (this route): Zapier → AIRE — accepts events from arbitrary
 * Zaps and translates them into AIRE actions (lead.create, activity.log,
 * lead.update). Auth = shared secret in X-AIRE-Secret header, compared
 * to ZAPIER_INBOUND_SECRET configured in /settings.
 *
 * Zaps Caleb might wire upstream:
 *   - Wufoo / Typeform / Squarespace submission → lead.created
 *   - Gmail filter "buyer inquiry"              → activity.logged (inbound email)
 *   - Google Calendar event tagged "showing"    → activity.logged (showing)
 *   - SMS reply caught elsewhere                → activity.logged (inbound text)
 *   - External CRM stage change                 → lead.update
 */

type InboundEvent =
  | { event: "ping" }
  | {
      event: "lead.created";
      name: string;
      email?: string;
      phone?: string;
      source?: string;
      type?: string;
      tags?: string;
      notes?: string;
    }
  | {
      event: "activity.logged";
      leadIdentifier: string;
      method: string;
      note?: string;
      direction?: "inbound" | "outbound";
    }
  | {
      event: "lead.update";
      leadIdentifier: string;
      patch: Record<string, unknown>;
    };

// Fields a Zap is allowed to patch on a lead. Anything outside this set
// is silently dropped — prevents arbitrary writes through the webhook.
const PATCHABLE_FIELDS = new Set([
  "stage",
  "tags",
  "nextActionDate",
  "nextActionNote",
  "notes",
  "pricePoint",
  "priceMin",
  "priceMax",
  "motivation",
  "timeline",
]);

// Prisma's @default(cuid()) produces "c" + 24 lower-case alphanum chars.
const CUID_RE = /^c[a-z0-9]{24,}$/i;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

/**
 * Resolve a lead by one of: AIRE id (cuid), Lofty id (numeric), email, or phone.
 * Tried in that order. Returns null if nothing matches.
 */
async function findLead(identifier: string) {
  if (!identifier) return null;

  if (CUID_RE.test(identifier)) {
    const byId = await prisma.lead.findUnique({ where: { id: identifier } });
    if (byId) return byId;
  }

  const byLofty = await prisma.lead.findUnique({ where: { loftyId: identifier } });
  if (byLofty) return byLofty;

  if (identifier.includes("@")) {
    const byEmail = await prisma.lead.findFirst({ where: { email: identifier } });
    if (byEmail) return byEmail;
  }

  const digits = identifier.replace(/\D/g, "");
  if (digits.length >= 7) {
    const byPhone = await prisma.lead.findFirst({
      where: { phone: { contains: digits } },
    });
    if (byPhone) return byPhone;
  }

  return null;
}

export async function POST(request: NextRequest) {
  // Auth: shared secret in header, configured in /settings.
  const secret = await getSetting("ZAPIER_INBOUND_SECRET");
  if (!secret) {
    return fail("ZAPIER_INBOUND_SECRET not configured in /settings", 401);
  }
  const headerSecret = request.headers.get("x-aire-secret");
  if (headerSecret !== secret) {
    return fail("Invalid or missing X-AIRE-Secret", 401);
  }

  let body: InboundEvent;
  try {
    body = (await request.json()) as InboundEvent;
  } catch {
    return fail("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object" || !("event" in body)) {
    return fail("Missing 'event' field", 400);
  }

  try {
    switch (body.event) {
      case "ping": {
        const timestamp = new Date().toISOString();
        console.log("[zapier-webhook] received ping", timestamp);
        return Response.json({ ok: true, pong: true, timestamp });
      }

      case "lead.created": {
        if (!body.name?.trim()) {
          return fail("'name' is required for lead.created", 400);
        }
        const lead = await prisma.lead.create({
          data: {
            name: body.name.trim(),
            email: body.email?.trim() || null,
            phone: body.phone?.trim() || null,
            source: body.source?.trim() || "zapier_webhook",
            type: body.type?.trim() || "buyer",
            tags: body.tags?.trim() || null,
            notes: body.notes?.trim() || null,
            stage: "new_lead",
          },
        });
        console.log("[zapier-webhook] received lead.created", lead.id);
        return Response.json({ ok: true, leadId: lead.id });
      }

      case "activity.logged": {
        if (!body.leadIdentifier || !body.method) {
          return fail("'leadIdentifier' and 'method' are required", 400);
        }
        const lead = await findLead(body.leadIdentifier);
        if (!lead) {
          return fail(
            `No lead found for identifier "${body.leadIdentifier}" — tried AIRE id, Lofty id, email, and phone`,
            404,
          );
        }
        const log = await prisma.contactLog.create({
          data: {
            leadId: lead.id,
            method: body.method,
            note: body.note ?? null,
            direction: body.direction ?? "inbound",
          },
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { lastContactDate: new Date() },
        });
        console.log("[zapier-webhook] received activity.logged", lead.id, log.id);

        // AIRE: loop:inbound-reply-handler — classify inbound text/email replies and queue a draft
        const effectiveDirection = body.direction ?? "inbound";
        if (
          effectiveDirection === "inbound" &&
          (body.method === "text" || body.method === "email")
        ) {
          await processInboundReplyAction({
            leadId: lead.id,
            leadName: lead.name,
            leadStage: lead.stage,
            leadPhone: lead.phone ?? null,
            leadEmail: lead.email ?? null,
            content: body.note ?? "",
            channel: body.method as "text" | "email",
          }).catch((err) => console.error("[zapier-webhook] inbound-reply error:", err));
        }

        return Response.json({ ok: true, leadId: lead.id, logId: log.id });
      }

      case "lead.update": {
        if (!body.leadIdentifier || !body.patch || typeof body.patch !== "object") {
          return fail("'leadIdentifier' and 'patch' object are required", 400);
        }
        const lead = await findLead(body.leadIdentifier);
        if (!lead) {
          return fail(
            `No lead found for identifier "${body.leadIdentifier}" — tried AIRE id, Lofty id, email, and phone`,
            404,
          );
        }

        // Whitelist filter — drop anything outside PATCHABLE_FIELDS.
        const data: Record<string, unknown> = {};
        const updated: string[] = [];
        for (const [key, value] of Object.entries(body.patch)) {
          if (!PATCHABLE_FIELDS.has(key)) continue;
          if (value === undefined) continue;
          // Coerce ISO strings → Date for known date fields.
          if (key === "nextActionDate" && typeof value === "string") {
            data[key] = new Date(value);
          } else {
            data[key] = value;
          }
          updated.push(key);
        }

        if (updated.length === 0) {
          return fail("patch contained no whitelisted fields", 400);
        }

        await prisma.lead.update({ where: { id: lead.id }, data });
        console.log("[zapier-webhook] received lead.update", lead.id, updated);
        return Response.json({ ok: true, leadId: lead.id, updated });
      }

      default: {
        return fail(
          `Unsupported event "${(body as { event: string }).event}" — expected ping | lead.created | activity.logged | lead.update`,
          400,
        );
      }
    }
  } catch (err) {
    console.error("[zapier-webhook] error", err);
    return fail(String(err instanceof Error ? err.message : err), 500);
  }
}

// Quick health check / Zap-setup ping.
export async function GET() {
  return Response.json({ ok: true, service: "AIRE Zapier inbound webhook receiver" });
}
