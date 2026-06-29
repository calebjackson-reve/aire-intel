"use client";

import { useEffect, useState } from "react";

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  itemsProcessed: number;
  actionsQueued: number;
  errorLog: unknown[] | null;
  durationMs: number | null;
}

const AGENT_LABELS: Record<string, string> = {
  new_lead_intake: "New Lead Intake",
  lead_revival: "Lead Revival",
  transaction_watchdog: "Transaction Watchdog",
  market_intel: "Market Intelligence",
  content_scheduler: "Content Scheduler",
  morning_brief: "Morning Brief",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "#065F46",
  partial: "#F59E0B",
  failed: "#EE8172",
  running: "#728AC5",
};

function statusDot(status: string) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: STATUS_COLORS[status] ?? "#555",
        marginRight: "6px",
      }}
    />
  );
}

function duration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default function AgentsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerState, setTriggerState] = useState<Record<string, "idle" | "loading" | "done">>(
    {}
  );

  useEffect(() => {
    fetch("/api/agents/runs")
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function triggerAgent(agent: string) {
    setTriggerState((s) => ({ ...s, [agent]: "loading" }));
    await fetch(`/api/agents/${agent}`).catch(() => null);
    setTriggerState((s) => ({ ...s, [agent]: "done" }));
    // Refresh runs
    fetch("/api/agents/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []));
    setTimeout(() => setTriggerState((s) => ({ ...s, [agent]: "idle" })), 3000);
  }

  const agents = Object.keys(AGENT_LABELS).filter((a) => a !== "new_lead_intake");

  return (
    <main style={{ paddingLeft: "24px", paddingRight: "24px", paddingTop: "40px", paddingBottom: "60px", maxWidth: "900px" }}>
      <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.15em", color: "#555" }}>AIRÉ</p>
      <h1 style={{ margin: "6px 0 24px", fontWeight: 300, fontSize: "26px", color: "#fff" }}>
        Agent Observability
      </h1>

      {/* Manual triggers */}
      <div className="glass-card" style={{ padding: "16px 20px", marginBottom: "32px" }}>
        <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#555", letterSpacing: "0.08em" }}>
          MANUAL TRIGGER
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {agents.map((agent) => {
            const state = triggerState[agent] ?? "idle";
            return (
              <button
                key={agent}
                className="btn-ghost"
                style={{ fontSize: "12px", padding: "6px 14px", opacity: state === "loading" ? 0.6 : 1 }}
                disabled={state === "loading"}
                onClick={() => triggerAgent(agent)}
              >
                {state === "done" ? "✓ " : ""}
                {AGENT_LABELS[agent]}
                {state === "loading" ? "…" : ""}
              </button>
            );
          })}
          <button
            className="btn-primary"
            style={{ fontSize: "12px", padding: "6px 14px" }}
            onClick={async () => {
              setTriggerState({ "run-all": "loading" });
              await fetch("/api/agents/run-all").catch(() => null);
              setTriggerState({ "run-all": "done" });
              fetch("/api/agents/runs").then((r) => r.json()).then((d) => setRuns(d.runs ?? []));
              setTimeout(() => setTriggerState({}), 3000);
            }}
          >
            {triggerState["run-all"] === "loading" ? "Running…" : triggerState["run-all"] === "done" ? "✓ Done" : "Run All"}
          </button>
        </div>
      </div>

      {/* Run history */}
      <div>
        <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#555", letterSpacing: "0.08em" }}>
          RECENT RUNS
        </p>

        {loading && (
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: "56px", borderRadius: "8px", marginBottom: "8px" }} />
            ))}
          </div>
        )}

        {!loading && runs.length === 0 && (
          <p style={{ color: "#555", fontSize: "14px" }}>No agent runs yet. Trigger one above.</p>
        )}

        {runs.map((run) => (
          <div
            key={run.id}
            className="glass-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "12px 16px",
              marginBottom: "8px",
              borderRadius: "8px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {statusDot(run.status)}
                <span style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>
                  {AGENT_LABELS[run.agentType] ?? run.agentType}
                </span>
                <span style={{ fontSize: "12px", color: "#555" }}>{timeAgo(run.startedAt)}</span>
              </div>
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#888", display: "flex", gap: "12px" }}>
                <span>{run.itemsProcessed} processed</span>
                <span>{run.actionsQueued} queued</span>
                <span>{duration(run.durationMs)}</span>
                {run.errorLog && (run.errorLog as unknown[]).length > 0 && (
                  <span style={{ color: "#EE8172" }}>{(run.errorLog as unknown[]).length} error{(run.errorLog as unknown[]).length > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: STATUS_COLORS[run.status] ?? "#555",
                letterSpacing: "0.06em",
              }}
            >
              {run.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
