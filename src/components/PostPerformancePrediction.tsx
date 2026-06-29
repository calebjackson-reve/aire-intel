"use client";

// Post-generation prediction panel shown on /create-post after a post is generated.
// Queries /api/social/predict with the current post context.

import { useState, useEffect } from "react";

interface PredictorSignal {
  label: string;
  impact: "positive" | "neutral" | "warning";
  detail: string;
}

interface SimilarPost {
  caption: string;
  publishedAt: string;
  postType: string;
  isReel: boolean;
  reach?: number;
  engagementRate?: number;
}

interface Prediction {
  predictedReach: number;
  predictedReachLow: number;
  predictedReachHigh: number;
  predictedEngagement: number;
  engagementProbability: number;
  reachTier: "low" | "medium" | "high" | "viral";
  bestPublishDay: string;
  bestPublishHour: number;
  similarPosts: SimilarPost[];
  signals: PredictorSignal[];
  improvementSuggestions: string[];
}

const TIER_COLOR: Record<string, string> = {
  viral: "#F59E0B",
  high: "#2C7A5C",
  medium: "#3B82F6",
  low: "var(--aire-muted)",
};

const IMPACT_ICON: Record<string, string> = {
  positive: "✓",
  warning: "⚠",
  neutral: "●",
};

const IMPACT_COLOR: Record<string, string> = {
  positive: "#2C7A5C",
  warning: "#F59E0B",
  neutral: "var(--aire-muted)",
};

export default function PostPerformancePrediction({
  postType,
  isReel,
  caption,
  platform,
}: {
  postType?: string;
  isReel?: boolean;
  caption?: string;
  platform?: string;
}) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!postType && !caption) return;
    fetchPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType, caption, isReel, platform]);

  async function fetchPrediction() {
    setLoading(true);
    try {
      const res = await fetch("/api/social/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postType, isReel, caption, platform }),
      });
      if (res.ok) setPrediction(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: "20px 24px", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--aire-muted)" }}>PERFORMANCE FORECAST</span>
          <div className="skeleton" style={{ height: 12, width: 80, borderRadius: 6 }} />
        </div>
      </div>
    );
  }

  if (!prediction) return null;

  const { predictedReachLow, predictedReachHigh, predictedEngagement, reachTier, bestPublishDay, bestPublishHour, signals, similarPosts, improvementSuggestions } = prediction;

  const hourLabel = `${bestPublishHour % 12 || 12}–${(bestPublishHour + 2) % 12 || 12} ${bestPublishHour < 12 ? "AM" : "PM"}`;

  return (
    <div className="glass-card" style={{ padding: "22px 24px", marginTop: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--aire-muted)", textTransform: "uppercase" }}>Performance Forecast</span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          color: TIER_COLOR[reachTier], textTransform: "uppercase",
          padding: "3px 10px", borderRadius: 20,
          background: `${TIER_COLOR[reachTier]}18`,
          border: `1px solid ${TIER_COLOR[reachTier]}40`,
        }}>
          {reachTier} reach
        </span>
      </div>

      {/* Main stats */}
      <div className="stat-tile-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--aire-text)", letterSpacing: "-0.02em" }}>
            {predictedReachLow.toLocaleString()}–{predictedReachHigh.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "var(--aire-muted)", letterSpacing: "0.12em", marginTop: 2 }}>PREDICTED REACH</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--aire-text)", letterSpacing: "-0.02em" }}>
            ~{predictedEngagement}
          </div>
          <div style={{ fontSize: 10, color: "var(--aire-muted)", letterSpacing: "0.12em", marginTop: 2 }}>INTERACTIONS</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--aire-text)" }}>{bestPublishDay}</div>
          <div style={{ fontSize: 12, color: "var(--aire-orange)", fontWeight: 600 }}>{hourLabel}</div>
          <div style={{ fontSize: 10, color: "var(--aire-muted)", letterSpacing: "0.12em", marginTop: 1 }}>BEST TIME</div>
        </div>
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          {signals.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
              <span style={{ color: IMPACT_COLOR[s.impact], fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {IMPACT_ICON[s.impact]}
              </span>
              <div>
                <span style={{ color: "var(--aire-text)", fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: "var(--aire-muted)" }}> — {s.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toggle: similar posts + suggestions */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--aire-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: expanded ? 12 : 0 }}
      >
        {expanded ? "▲ HIDE DETAILS" : "▼ SIMILAR POSTS + SUGGESTIONS"}
      </button>

      {expanded && (
        <>
          {similarPosts.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: 8 }}>BASED ON YOUR SIMILAR POSTS</div>
              {similarPosts.map((p, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "var(--aire-card-warm)", borderRadius: 8, marginBottom: 6, fontSize: 11.5 }}>
                  <div style={{ color: "var(--aire-text-2)", lineHeight: 1.4 }}>
                    &ldquo;{p.caption.slice(0, 100)}{p.caption.length > 100 ? "…" : ""}&rdquo;
                  </div>
                  <div style={{ color: "var(--aire-muted)", marginTop: 3, fontSize: 10.5 }}>
                    {p.reach ? `${p.reach.toLocaleString()} reach` : ""}
                    {p.reach && p.engagementRate ? " · " : ""}
                    {p.engagementRate ? `${(p.engagementRate * 100).toFixed(1)}% engagement` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {improvementSuggestions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: 8 }}>IMPROVEMENT SUGGESTIONS</div>
              {improvementSuggestions.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: "var(--aire-orange)", flexShrink: 0 }}>→</span>
                  <span style={{ color: "var(--aire-text-2)", lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
