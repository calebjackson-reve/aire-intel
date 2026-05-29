"use client";

import { useState, useEffect } from "react";

interface ErrorLog {
  id: string;
  type: string;
  source: string;
  message: string;
  context: string | null;
  attempts: number;
  resolved: boolean;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface Pattern {
  type: string;
  source: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  message: string;
  errorIds: string[];
  severity: "critical" | "high" | "medium";
}

interface Health {
  score: number;
  trend: "improving" | "stable" | "degrading";
  summary: string;
}

// Map error types to pill classes (used to render type chips)
const TYPE_PILL: Record<string, string> = {
  api_failure: "pill-coral",
  validation:  "pill-cream",
  sync:        "pill",
  ui:          "pill",
  ai:          "pill-mint",
  lofty:       "pill-cream",
  paragon:     "pill",
  meta:        "pill-coral",
  dotloop:     "pill-mint",
};

// Severity hue tokens
const SEVERITY_TOKENS: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "var(--aire-coral-deep)", bg: "var(--aire-coral-soft)", border: "rgba(238,129,114,0.25)" },
  high:     { color: "#8a7a18",                bg: "var(--aire-cream-soft)", border: "rgba(239,221,132,0.4)" },
  medium:   { color: "var(--aire-text-2)",     bg: "var(--aire-card-warm)",  border: "var(--aire-border)" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SystemPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    setLoading(true);
    const [errorsData, healthData] = await Promise.all([
      fetch("/api/errors").then(r => r.json()).catch(() => []),
      fetch("/api/errors?action=health").then(r => r.json()).catch(() => null),
    ]);
    setErrors(Array.isArray(errorsData) ? errorsData : []);
    if (healthData) {
      setHealth(healthData.health);
      setPatterns(healthData.patterns ?? []);
    }
    setLoading(false);
  }

  async function loadHealth() {
    const data = await fetch("/api/errors?action=health").then(r => r.json()).catch(() => null);
    if (data) {
      setHealth(data.health);
      setPatterns(data.patterns ?? []);
    }
  }

  async function resolveError(id: string, resolution = "Manually resolved") {
    setResolving(id);
    await fetch("/api/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved: true, resolution }),
    });
    setErrors(prev => prev.map(e => e.id === id ? { ...e, resolved: true, resolution } : e));
    setResolving(null);
    loadHealth();
  }

  async function clearResolved() {
    await fetch("/api/errors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setErrors(prev => prev.filter(e => !e.resolved));
    loadHealth();
  }

  const displayed = errors.filter(e => {
    if (filter === "unresolved") return !e.resolved;
    if (filter === "resolved") return e.resolved;
    return true;
  });

  const unresolvedCount = errors.filter(e => !e.resolved).length;
  const resolvedCount   = errors.filter(e => e.resolved).length;

  // Last 24h, last 7d
  const now = Date.now();
  const last24h = errors.filter(e => now - new Date(e.createdAt).getTime() < 86400000).length;
  const last7d  = errors.filter(e => now - new Date(e.createdAt).getTime() < 7 * 86400000).length;

  const healthy = health && health.score >= 90;
  const degraded = health && health.score < 70;
  const scoreColor = !health
    ? "var(--aire-muted)"
    : healthy
      ? "#2d7a55"   // mint deep
      : degraded
        ? "var(--aire-coral-deep)"
        : "#8a7a18"; // cream deep

  const trendIcon  = health?.trend === "improving" ? "↑" : health?.trend === "degrading" ? "↓" : "—";
  const trendColor = health?.trend === "improving"
    ? "#2d7a55"
    : health?.trend === "degrading"
      ? "var(--aire-coral-deep)"
      : "var(--aire-text-2)";
  const trendPill = health?.trend === "improving" ? "pill-mint" : health?.trend === "degrading" ? "pill-coral" : "pill";

  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "1360px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>SYSTEM HEALTH</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "24px", flexWrap: "wrap" }}>
          <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05 }}>
            Karpathy loop
          </h1>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span className="metric-number" style={{ fontSize: "56px", color: scoreColor, lineHeight: 1 }}>
              {health?.score ?? "—"}
            </span>
            <span style={{ fontSize: "13px", color: "var(--aire-muted)", letterSpacing: "0.04em" }}>/ 100</span>
            {health && (
              <span className={trendPill} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "3px 10px", borderRadius: "999px",
                fontSize: "10px", letterSpacing: "0.10em", fontWeight: 600,
                marginLeft: "8px",
              }}>
                {trendIcon} {health.trend.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        {health?.summary && (
          <p style={{ fontSize: "13px", color: "var(--aire-text-2)", marginTop: "12px", lineHeight: 1.5, maxWidth: "560px" }}>
            {health.summary}
          </p>
        )}
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "16px" }} />
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "14px",
        marginBottom: "20px",
      }}>
        {[
          { label: "ERRORS TODAY",       value: last24h,        accent: last24h > 0 ? "coral" : null },
          { label: "ERRORS THIS WEEK",   value: last7d,         accent: null },
          { label: "UNRESOLVED",         value: unresolvedCount, accent: unresolvedCount > 0 ? "coral" : null },
          { label: "RESOLVED",           value: resolvedCount,   accent: resolvedCount > 0 ? "mint" : null },
        ].map(({ label, value, accent }) => (
          <div key={label} className="card-light" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "8px", fontWeight: 500 }}>{label}</div>
            <div className="metric-number" style={{
              fontSize: "32px",
              color: accent === "coral" ? "var(--aire-coral-deep)" : accent === "mint" ? "#2d7a55" : "var(--aire-text)",
              lineHeight: 1,
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Patterns */}
      <div className="card-light" style={{ padding: "22px 24px", marginBottom: "20px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "16px", fontWeight: 500 }}>
          DETECTED PATTERNS · LAST 24H
        </p>
        {patterns.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="live-dot" />
            <p style={{ fontSize: "13px", color: "#2d7a55" }}>No recurring error patterns detected.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
            {patterns.map((p, i) => {
              const tok = SEVERITY_TOKENS[p.severity] ?? SEVERITY_TOKENS.medium;
              return (
                <div key={i} style={{
                  display: "flex", gap: "16px", alignItems: "flex-start",
                  padding: "14px 16px",
                  background: tok.bg,
                  border: `1px solid ${tok.border}`,
                  borderRadius: "12px",
                }}>
                  <div style={{ textAlign: "center", minWidth: "44px" }}>
                    <div className="metric-number" style={{ fontSize: "26px", color: tok.color, lineHeight: 1 }}>{p.count}</div>
                    <div style={{ fontSize: "8px", letterSpacing: "0.12em", color: "var(--aire-muted)", marginTop: "2px" }}>HITS</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: "10px", letterSpacing: "0.10em",
                        color: tok.color, background: "var(--aire-card)",
                        border: `1px solid ${tok.border}`,
                        borderRadius: "999px", padding: "2px 10px", fontWeight: 600,
                      }}>
                        {p.severity.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{p.type} · {p.source}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--aire-text)", marginBottom: "4px", lineHeight: 1.5 }}>{p.message.slice(0, 120)}</p>
                    <p style={{ fontSize: "10px", color: "var(--aire-muted)" }}>First {timeAgo(p.firstSeen)} · Last {timeAgo(p.lastSeen)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter + actions bar */}
      <div className="card-warm" style={{
        padding: "14px 20px", marginBottom: "14px",
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
          ERROR LOG
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {(["all", "unresolved", "resolved"] as const).map(f => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px", fontSize: "10px", letterSpacing: "0.12em", fontWeight: 600,
                  background: active ? "var(--aire-ink)" : "transparent",
                  color: active ? "var(--aire-text-inv)" : "var(--aire-text-2)",
                  border: active ? "1px solid var(--aire-ink)" : "1px solid var(--aire-border)",
                  borderRadius: "999px",
                  cursor: "pointer",
                  transition: "all 200ms",
                }}
              >
                {f.toUpperCase()}
              </button>
            );
          })}
          {resolvedCount > 0 && (
            <button onClick={clearResolved} className="btn-ghost" style={{ padding: "6px 14px", fontSize: "10px", color: "var(--aire-coral-deep)", borderColor: "rgba(238,129,114,0.3)" }}>
              CLEAR RESOLVED
            </button>
          )}
          <button onClick={loadAll} className="btn-ghost" style={{ padding: "6px 14px", fontSize: "10px" }}>↺ REFRESH</button>
        </div>
      </div>

      {/* Error list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "72px" }} />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card-warm" style={{ padding: "56px", textAlign: "center" }}>
          <p style={{ fontFamily: "'Recoleta', 'Fraunces', Georgia, serif", fontSize: "32px", color: "#2d7a55", marginBottom: "8px" }}>✓</p>
          <p style={{ fontSize: "13px", color: "var(--aire-text-2)", fontStyle: "italic" }}>
            {filter === "unresolved" ? "No unresolved errors. System nominal." : "No errors in this view."}
          </p>
        </div>
      ) : (
        <div className="card-light" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {displayed.map((err, i) => {
            const pillClass = TYPE_PILL[err.type] ?? "pill";
            return (
              <div
                key={err.id}
                className="interactive-row"
                style={{
                  padding: "14px 18px",
                  borderRadius: "10px",
                  opacity: err.resolved ? 0.55 : 1,
                  animation: `fade-up 250ms var(--ease-out-expo) ${i * 20}ms both`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span className={pillClass} style={{
                        display: "inline-flex", alignItems: "center",
                        fontSize: "9px", letterSpacing: "0.10em", fontWeight: 600,
                        padding: "2px 9px", borderRadius: "999px",
                      }}>
                        {err.type.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{err.source}</span>
                      {err.attempts > 1 && (
                        <span style={{ fontSize: "10px", color: "#8a7a18", letterSpacing: "0.04em" }}>
                          · {err.attempts} attempts
                        </span>
                      )}
                      {err.resolved && (
                        <span style={{ fontSize: "10px", letterSpacing: "0.10em", color: "#2d7a55", fontWeight: 600 }}>✓ RESOLVED</span>
                      )}
                    </div>
                    <p style={{ fontSize: "13px", color: err.resolved ? "var(--aire-muted)" : "var(--aire-text)", marginBottom: err.resolution ? "4px" : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {err.message}
                    </p>
                    {err.resolution && (
                      <p style={{ fontSize: "11px", color: "#2d7a55" }}>↳ {err.resolution}</p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>{timeAgo(err.createdAt)}</span>
                    {!err.resolved && (
                      <button
                        onClick={() => resolveError(err.id)}
                        disabled={resolving === err.id}
                        className="btn-ghost"
                        style={{ padding: "5px 14px", fontSize: "9px", letterSpacing: "0.10em" }}
                      >
                        {resolving === err.id ? "..." : "RESOLVE"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
