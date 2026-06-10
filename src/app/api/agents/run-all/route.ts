import { verifyCronSecret, cronUnauthorized } from "@/lib/cron-auth";

// POST /api/agents/run-all — trigger all agents in sequence (for dev/testing and manual runs)
// GET version is also allowed for quick manual trigger from the browser
export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runAll();
}

export async function GET() {
  return runAll();
}

async function runAll() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.CRON_SECRET ?? "";
  const headers = { authorization: `Bearer ${secret}` };

  const agents = [
    "market-intel",
    "content-scheduler",
    "transaction-watchdog",
    "revival",
    "morning-brief",
  ];

  const results: Record<string, { ok: boolean; status?: number; error?: string }> = {};

  for (const agent of agents) {
    try {
      const res = await fetch(`${baseUrl}/api/agents/${agent}`, { method: "GET", headers });
      const data = await res.json().catch(() => ({}));
      results[agent] = { ok: res.ok, status: res.status, ...("runId" in data ? { runId: data.runId } : {}) };
    } catch (err) {
      results[agent] = { ok: false, error: String(err) };
    }
  }

  const allOk = Object.values(results).every((r) => r.ok);

  return Response.json({ ok: allOk, agents: results });
}
