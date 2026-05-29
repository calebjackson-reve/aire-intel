import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { REVE_LINKEDIN_SYSTEM } from "@/lib/reve-system-prompt";

const client = new Anthropic();

/**
 * GET /api/linkedin/outreach?leadId=xxx
 * Returns all outreach records for a lead, newest first.
 *
 * GET /api/linkedin/outreach
 * Returns all leads with a linkedinUrl set, each with their latest outreach status.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  if (leadId) {
    const records = await prisma.linkedInOutreach.findMany({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
    });
    return Response.json(records);
  }

  // Queue view — all leads with a LinkedIn URL, with latest outreach status
  const leads = await prisma.lead.findMany({
    where: { linkedinUrl: { not: null } },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      linkedinUrl: true,
      stage: true,
      linkedInOutreach: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: { id: true, status: true, message: true, generatedAt: true, copiedAt: true, sentAt: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return Response.json(leads);
}

/**
 * POST /api/linkedin/outreach
 * Body: { leadId: string, context?: string }
 *
 * Generates a LinkedIn connection message via Claude, saves it, returns the record.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, context } = body as { leadId: string; context?: string };

  if (!leadId) {
    return Response.json({ error: "leadId is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      name: true,
      firstName: true,
      stage: true,
      areas: true,
      motivation: true,
      timeline: true,
      linkedinUrl: true,
      notes: true,
    },
  });

  if (!lead) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const leadContext = [
    `Name: ${lead.name}`,
    lead.areas ? `Location/interest: ${lead.areas}` : null,
    lead.stage !== "new_lead" ? `Pipeline stage: ${lead.stage}` : null,
    lead.motivation ? `Motivation: ${lead.motivation}` : null,
    lead.timeline ? `Timeline: ${lead.timeline}` : null,
    context ? `Additional context: ${context}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 200,
    system: REVE_LINKEDIN_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write a LinkedIn connection request for this lead:\n\n${leadContext}\n\nRemember: under 300 characters. One sentence.`,
      },
    ],
  });

  const message =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";

  if (!message) {
    return Response.json({ error: "AI returned empty message" }, { status: 500 });
  }

  const record = await prisma.linkedInOutreach.create({
    data: {
      leadId,
      message,
      status: "message_generated",
    },
  });

  return Response.json(record, { status: 201 });
}

/**
 * PATCH /api/linkedin/outreach
 * Body: { id: string, status?: string, notes?: string }
 *
 * Updates status (copied | sent) or notes on an outreach record.
 * Stamps copiedAt / sentAt timestamps automatically.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, status, notes } = body as {
    id: string;
    status?: "copied" | "sent";
    notes?: string;
  };

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status !== undefined) {
    data.status = status;
    if (status === "copied") data.copiedAt = new Date();
    if (status === "sent") data.sentAt = new Date();
  }
  if (notes !== undefined) data.notes = notes;

  const record = await prisma.linkedInOutreach.update({
    where: { id },
    data,
  });

  return Response.json(record);
}
