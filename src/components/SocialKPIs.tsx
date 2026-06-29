"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SocialKPIData {
  followers: number;
  accountsReached: number;
  reachDelta: number;
  nonFollowerPct: number;
  totalInteractions: number;
  interactionDelta: number;
  peakDay: string;
  topPostCaption?: string;
  topPostEngagementRate?: number;
  importedAt?: string;
  hasData: boolean;
}

function KPICard({ label, value, subtext, trend, accent }: {
  label: string;
  value: string;
  subtext?: string;
  trend?: number;
  accent?: "orange" | "green" | "default";
}) {
  const accentColor = accent === "orange" ? "var(--aire-orange)" : accent === "green" ? "#2C7A5C" : "var(--aire-text)";
  return (
    <div className="stat-tile" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--aire-muted)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, color: accentColor, letterSpacing: "-0.02em" }}>{value}</span>
      {(subtext || trend !== undefined) && (
        <span style={{ fontSize: 11, color: trend !== undefined && trend > 0 ? "#2C7A5C" : trend !== undefined && trend < 0 ? "#EE8172" : "var(--aire-muted)" }}>
          {trend !== undefined && trend > 0 && "▲ "}
          {trend !== undefined && trend < 0 && "▼ "}
          {trend !== undefined ? `${Math.abs(trend)}%` : ""}
          {subtext && (trend !== undefined ? " · " : "") + subtext}
        </span>
      )}
    </div>
  );
}

export default function SocialKPIs() {
  const [data, setData] = useState<SocialKPIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch("/api/social/kpis");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: "20px 26px" }}>
        <div className="skeleton" style={{ height: 16, width: 140, borderRadius: 8 }} />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="glass-card" style={{ padding: "22px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="aire-eyebrow">Social Intelligence</span>
          <Link href="/social" className="btn-ghost" style={{ fontSize: 10, padding: "5px 12px", letterSpacing: "0.12em" }}>
            IMPORT DATA →
          </Link>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--aire-muted)", lineHeight: 1.6 }}>
          Import your Instagram export to unlock performance KPIs, reach forecasts, and content insights.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: "22px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span className="aire-eyebrow">Social Intelligence</span>
        <Link href="/social-analytics" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--aire-orange)", textDecoration: "none", fontWeight: 600 }}>
          FULL ANALYTICS →
        </Link>
      </div>

      <div className="stat-tile-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPICard
          label="Accounts Reached"
          value={data.accountsReached >= 1000 ? `${(data.accountsReached / 1000).toFixed(1)}K` : String(data.accountsReached)}
          trend={Math.round(data.reachDelta)}
          accent="orange"
        />
        <KPICard
          label="Interactions"
          value={data.totalInteractions >= 1000 ? `${(data.totalInteractions / 1000).toFixed(1)}K` : String(data.totalInteractions)}
          trend={Math.round(data.interactionDelta)}
          accent="green"
        />
        <KPICard
          label="Followers"
          value={data.followers.toLocaleString()}
          subtext={`${data.nonFollowerPct.toFixed(0)}% non-follower reach`}
        />
        <KPICard
          label="Peak Day"
          value={data.peakDay}
          subtext="best time to post"
        />
      </div>

      {data.topPostCaption && (
        <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--aire-card-warm)", borderRadius: 10, border: "1px solid var(--aire-border)" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--aire-muted)", marginBottom: 4 }}>TOP PERFORMING POST</div>
          <div style={{ fontSize: 12.5, color: "var(--aire-text-2)", lineHeight: 1.5 }}>
            &ldquo;{data.topPostCaption.slice(0, 100)}{data.topPostCaption.length > 100 ? "…" : ""}&rdquo;
          </div>
          {data.topPostEngagementRate && (
            <div style={{ fontSize: 11, color: "#2C7A5C", marginTop: 4, fontWeight: 600 }}>
              {(data.topPostEngagementRate * 100).toFixed(1)}% engagement rate
            </div>
          )}
        </div>
      )}
    </div>
  );
}
