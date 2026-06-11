export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { REVE_PIPELINE_SYSTEM } from "@/lib/reve-system-prompt";

const client = new Anthropic();

export async function GET() {
  const plans = await prisma.smartPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { enrollments: true } } },
  });
  return Response.json(plans);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // If action=generate, stream AI-generated plan steps
  if (body.action === "generate") {
    const { name, triggerType, description } = body;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        try {
          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 2000,
            stream: true,
            system: REVE_PIPELINE_SYSTEM,
            messages: [{
              role: "user",
              content: `Create a smart follow-up plan for Rêve Realtors in Baton Rouge, LA.

Plan name: "${name}"
Trigger: ${triggerType}
${description ? `Description: ${description}` : ""}

Generate a JSON array of steps. Each step:
{
  "day": number (day after trigger),
  "method": "text" | "call" | "email" | "task",
  "message": "the exact message to send (for text/email) or task description",
  "subject": "email subject if method is email"
}

Rules:
- 8-12 steps spanning 30-90 days
- Day 1: immediate text
- Vary methods (texts, calls, emails, tasks)
- Messages must sound like Caleb Jackson — direct, professional, warm, Baton Rouge native
- No generic templates — reference real estate context
- For tasks: describe what the agent should do

Return ONLY the JSON array, no explanation.`,
            }],
          });

          let fullText = "";
          for await (const event of response) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              if (!isClosed) {
                try {
                  controller.enqueue(encoder.encode(event.delta.text));
                } catch {
                  isClosed = true;
                }
              }
            }
          }

          isClosed = true;
          controller.close();
        } catch (err) {
          if (!isClosed) {
            isClosed = true;
            controller.error(err);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  // Otherwise create the plan
  const { name, description, triggerType, steps } = body;
  const plan = await prisma.smartPlan.create({
    data: {
      name,
      description,
      triggerType,
      steps: typeof steps === "string" ? steps : JSON.stringify(steps),
    },
  });
  return Response.json(plan, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { id, ...data } = await request.json();
  if (data.steps && typeof data.steps !== "string") {
    data.steps = JSON.stringify(data.steps);
  }
  const plan = await prisma.smartPlan.update({ where: { id }, data });
  return Response.json(plan);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.smartPlan.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
