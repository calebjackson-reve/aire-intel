export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Action types that support Phase B auto-execution
const AUTO_EXEC_TYPES = [
  "draft_message",
  "post_content",
  "create_lofty_task",
  "send_client_email",
  "follow_up_text",
] as const;

function settingKey(actionType: string) {
  return `agent.${actionType}.autoExecute`;
}

// GET /api/agents/settings — return all Phase B auto-execute flags
export async function GET() {
  const keys = AUTO_EXEC_TYPES.map(settingKey);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value === "true"]));

  const settings = AUTO_EXEC_TYPES.map((type) => ({
    actionType: type,
    autoExecute: map[settingKey(type)] ?? false,
    label: {
      draft_message: "Draft messages — auto-send after approval",
      post_content: "Post content — auto-publish when approved",
      create_lofty_task: "Lofty tasks — auto-create immediately",
      send_client_email: "Client emails — auto-send when approved",
      follow_up_text: "Follow-up texts — auto-send when approved",
    }[type],
    risk: {
      draft_message: "high",
      post_content: "medium",
      create_lofty_task: "low",
      send_client_email: "high",
      follow_up_text: "high",
    }[type],
  }));

  return Response.json({ settings });
}

// PUT /api/agents/settings — toggle a Phase B auto-execute flag
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { actionType, autoExecute } = body;

  if (!AUTO_EXEC_TYPES.includes(actionType)) {
    return Response.json({ error: "Unknown action type" }, { status: 400 });
  }

  const key = settingKey(actionType);
  const value = autoExecute ? "true" : "false";

  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });

  return Response.json({ ok: true, actionType, autoExecute });
}
