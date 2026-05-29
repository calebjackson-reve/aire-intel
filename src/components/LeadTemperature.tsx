"use client";

// Lead Temperature widget — shows the 0–100 score, its hot/warm/cool/cold level,
// and (when the learned model is active) the top factors driving the close
// probability. Fetches /api/leads/score?id= which returns the component breakdown.

import { useEffect, useState } from "react";

interface Contributor {
  feature: string;
  bucket: string;
  winRate: number;
  delta: number;
}

interface Breakdown {
  total: number;
  recency: number;
  engagement: number;
  closeProbability: number;
  learned: boolean;
  contributors: Contributor[];
}

interface ScoreResponse {
  id: string;
  score: number;
  level: "hot" | "warm" | "cool" | "cold";
  breakdown: Breakdown;
}

const LEVEL_COLOR: Record<string, string> = {
  hot: "var(--aire-coral)",
  warm: "var(--aire-cream)",
  cool: "var(--aire-text-2)",
  cold: "var(--aire-muted)",
};

const FEATURE_LABEL: Record<string, string> = {
  stage: "Stage",
  priceBand: "Price",
  source: "Source",
  type: "Type",
  timeline: "Timeline",
  preApproved: "Pre-approval",
};

export default function LeadTemperature({ leadId }: { leadId: string }) {
  const [data, setData] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/leads/score?id=${leadId}`)
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
          LEAD TEMPERATURE
        </p>
        <p style={{ fontSize: "12px", color: "var(--aire-muted)", marginTop: "12px" }}>
          {loading ? "Scoring…" : "Unavailable"}
        </p>
      </div>
    );
  }

  const { score, level, breakdown } = data;
  const color = LEVEL_COLOR[level] ?? "var(--aire-text-2)";

  return (
    <div className="card-light" style={{ padding: "20px" }}>
      <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "14px", fontWeight: 500 }}>
        LEAD TEMPERATURE
      </p>

      {/* Score + level */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
        <span className="metric-number" style={{ fontSize: "32px", color, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: "11px", letterSpacing: "0.14em", color, fontWeight: 600, textTransform: "uppercase" }}>
          {level}
        </span>
        <span style={{ fontSize: "10px", color: "var(--aire-muted)", marginLeft: "auto" }}>
          {breakdown.learned ? "learned model" : "baseline"}
        </span>
      </div>

      {/* Component bar */}
      <ComponentBar
        segments={[
          { label: "Warmth (recency)", value: breakdown.recency, max: 30, color: "var(--aire-coral)" },
          { label: "Engagement", value: breakdown.engagement, max: 25, color: "var(--aire-cream)" },
          { label: "Close probability", value: breakdown.closeProbability, max: 45, color: "var(--aire-mint)" },
        ]}
      />

      {/* Why — top contributing factors (learned model only) */}
      {breakdown.learned && breakdown.contributors.length > 0 && (
        <div style={{ marginTop: "16px", borderTop: "1px solid var(--aire-border)", paddingTop: "14px" }}>
          <p style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted)", marginBottom: "10px", fontWeight: 500 }}>
            WHY
          </p>
          {breakdown.contributors.map((c, i) => {
            const positive = c.delta >= 0;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>
                  {FEATURE_LABEL[c.feature] ?? c.feature}: <span style={{ color: "var(--aire-muted)" }}>{c.bucket}</span>
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: positive ? "var(--aire-mint)" : "var(--aire-coral)" }}>
                  {Math.round(c.winRate * 100)}% close
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComponentBar({ segments }: { segments: { label: string; value: number; max: number; color: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {segments.map((s, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
            <span style={{ fontSize: "10px", color: "var(--aire-muted)" }}>{s.label}</span>
            <span style={{ fontSize: "10px", color: "var(--aire-text-2)" }}>{s.value}/{s.max}</span>
          </div>
          <div style={{ height: "4px", background: "var(--aire-border)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (s.value / s.max) * 100)}%`, height: "100%", background: s.color, borderRadius: "2px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
