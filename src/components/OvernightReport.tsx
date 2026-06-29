"use client";

import { useEffect, useState } from "react";
import { Check, Moon, ChevronRight } from "lucide-react";

interface ReportRow {
  agentType: string;
  label: string;
  status: string;
  itemsProcessed: number;
  actionsQueued: number;
  at: string;
  durationMs: number | null;
}
interface Overnight {
  ranCount: number;
  report: ReportRow[];
  pendingCount: number;
  reelReady: number;
  totalActionsQueued: number;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function OvernightReport() {
  const [data, setData] = useState<Overnight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/overnight")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="glass-card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "16px" }}>
        <Moon size={15} style={{ color: "var(--aire-text-2)" }} />
        <span className="aire-eyebrow">Overnight Report</span>
        {data && data.ranCount > 0 && (
          <span className="live-dot" style={{ marginLeft: "auto" }} />
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: "30px", borderRadius: "8px" }} />
          ))}
        </div>
      ) : !data || data.ranCount === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--aire-muted)", fontStyle: "italic", margin: "auto 0" }}>
          No overnight runs yet. Agents report here each morning.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {data.report.slice(0, 5).map((r) => (
              <div
                key={r.agentType}
                style={{
                  display: "flex", alignItems: "center", gap: "11px",
                  padding: "10px 0", borderBottom: "1px solid var(--aire-border)",
                }}
              >
                <span
                  style={{
                    width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                    background: r.status === "failed" ? "rgba(226,100,92,0.14)" : "var(--aire-orange-soft)",
                    display: "grid", placeItems: "center",
                  }}
                >
                  <Check size={12} style={{ color: r.status === "failed" ? "var(--status-urgent)" : "var(--aire-orange-deep)" }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", color: "var(--aire-text)", lineHeight: 1.3 }}>{r.label}</p>
                  <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "1px" }}>
                    {r.actionsQueued > 0 ? `${r.actionsQueued} queued · ` : ""}{timeAgo(r.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {data.pendingCount > 0 && (
            <a
              href="#approve-queue"
              style={{
                display: "flex", alignItems: "center", gap: "8px", marginTop: "14px",
                padding: "11px 14px", borderRadius: "12px", textDecoration: "none",
                background: "var(--aire-orange-soft)", color: "var(--aire-orange-deep)",
                fontSize: "12.5px", fontWeight: 600,
              }}
            >
              {data.pendingCount} item{data.pendingCount === 1 ? "" : "s"} waiting for your approval
              <ChevronRight size={15} style={{ marginLeft: "auto" }} />
            </a>
          )}
        </>
      )}
    </div>
  );
}
