"use client";

// Sell-Intent widget — shows the 0–100 likelihood a homeowner is thinking about
// selling, blending PropStream property attributes (equity, tenure, absentee,
// pre-foreclosure) with first-party engagement. Distinct from lead temperature.
// Marketing-prioritization signal only (see docs/intent-data-legal.md).

import { useEffect, useState } from "react";

interface Factor {
  label: string;
  points: number;
}
interface IntentResponse {
  id: string;
  score: number;
  level: "high" | "moderate" | "low";
  hasPropertyData: boolean;
  factors: Factor[];
}

const LEVEL_COLOR: Record<string, string> = {
  high: "var(--aire-mint)",
  moderate: "var(--aire-cream)",
  low: "var(--aire-muted)",
};

export default function SellIntent({ leadId }: { leadId: string }) {
  const [data, setData] = useState<IntentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/leads/intent?id=${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && typeof d.score === "number") setData(d);
        if (alive) setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [leadId]);

  if (loading || !data) {
    return (
      <div className="card-light" style={{ padding: "20px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
          SELL INTENT
        </p>
        <p style={{ fontSize: "12px", color: "var(--aire-muted)", marginTop: "12px" }}>
          {loading ? "Scoring…" : "Unavailable"}
        </p>
      </div>
    );
  }

  const color = LEVEL_COLOR[data.level] ?? "var(--aire-muted)";

  return (
    <div className="card-light" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
          SELL INTENT
        </p>
        <span style={{ fontSize: "9px", color: "var(--aire-muted)" }}>
          {data.hasPropertyData ? "property + engagement" : "engagement only"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
        <span className="metric-number" style={{ fontSize: "32px", color, lineHeight: 1 }}>
          {data.score}
        </span>
        <span style={{ fontSize: "11px", letterSpacing: "0.14em", color, fontWeight: 600, textTransform: "uppercase" }}>
          {data.level}
        </span>
      </div>

      {!data.hasPropertyData && (
        <p style={{ fontSize: "10px", color: "var(--aire-muted)", lineHeight: 1.5, marginBottom: "10px" }}>
          No PropStream data yet — import a CSV to sharpen this. Based on engagement signals only.
        </p>
      )}

      {data.factors.length > 0 && (
        <div style={{ borderTop: "1px solid var(--aire-border)", paddingTop: "12px" }}>
          {data.factors.map((f, i) => {
            const positive = f.points >= 0;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{f.label}</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: positive ? "var(--aire-mint)" : "var(--aire-coral)" }}>
                  {positive ? "+" : ""}{f.points}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
