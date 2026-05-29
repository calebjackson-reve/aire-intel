"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";
import DarwinSyncButton from "./DarwinSyncButton";

const CORAL = "#EE8172";
const CREAM = "#EFDD84";

type Period = "ytd" | "qtd" | "mtd" | "wtd";
type Metric = "gci" | "volume" | "units" | "pipeline" | "leads";

interface Stats {
  period: Period;
  current: { gci: number; volume: number; units: number; pipelineValue: number };
  lastYear: { gci: number; volume: number; units: number };
  monthlySeries: { month: string; gci: number; volume: number; units: number }[];
  cumulativeSeries: { month: string; gci: number; volume: number; units: number }[];
  leadsSeries: { month: string; leads: number; monthly: number }[];
  goals: { gci: number | null; volume: number | null; units: number | null };
}

const METRICS: { key: Metric; label: string; sub: string; color: string; format: (n: number) => string }[] = [
  { key: "gci", label: "GCI", sub: "Gross Commission", color: CORAL, format: n => `$${(n / 1000).toFixed(0)}k` },
  { key: "volume", label: "Volume", sub: "Closed Volume", color: CORAL, format: n => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}k` },
  { key: "units", label: "Units", sub: "Deals Closed", color: CORAL, format: n => String(n) },
  { key: "pipeline", label: "Pipeline", sub: "Active Value", color: CORAL, format: n => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}k` },
  { key: "leads", label: "Leads", sub: "Sphere Growth", color: CORAL, format: n => String(n) },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
];

export default function KPITracker({ onLogDeal }: { onLogDeal: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [metric, setMetric] = useState<Metric>("gci");
  const [period, setPeriod] = useState<Period>("ytd");

  useEffect(() => {
    fetch(`/api/deals/stats?period=${period}`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [period]);

  const m = METRICS.find(x => x.key === metric)!;

  // Build chart series + headline value based on selected metric
  const series = (() => {
    if (!stats) return [];
    if (metric === "leads") return stats.leadsSeries.map(s => ({ x: s.month, y: s.leads, monthly: s.monthly }));
    const key = metric === "pipeline" ? "gci" : metric;
    return stats.cumulativeSeries.map(s => ({
      x: s.month,
      y: (s as unknown as Record<string, number>)[key],
      monthly: (stats.monthlySeries[stats.cumulativeSeries.indexOf(s)] as unknown as Record<string, number>)[key] ?? 0,
    }));
  })();

  const valueFor = (key: Metric): number => {
    if (!stats) return 0;
    if (key === "gci") return stats.current.gci;
    if (key === "volume") return stats.current.volume;
    if (key === "units") return stats.current.units;
    if (key === "pipeline") return stats.current.pipelineValue;
    if (key === "leads") return stats.leadsSeries[stats.leadsSeries.length - 1]?.leads ?? 0;
    return 0;
  };

  const headlineValue = valueFor(metric);

  const lastYearValue = (() => {
    if (!stats || metric === "pipeline" || metric === "leads") return null;
    if (metric === "gci") return stats.lastYear.gci;
    if (metric === "volume") return stats.lastYear.volume;
    if (metric === "units") return stats.lastYear.units;
    return null;
  })();

  const goal = (() => {
    if (!stats) return null;
    if (metric === "gci") return stats.goals.gci;
    if (metric === "volume") return stats.goals.volume;
    if (metric === "units") return stats.goals.units;
    return null;
  })();

  const yoyDelta = lastYearValue && lastYearValue > 0 ? ((headlineValue - lastYearValue) / lastYearValue) * 100 : null;
  const goalPct = goal && goal > 0 ? (headlineValue / goal) * 100 : null;

  return (
    <div className="animate-fade-up" style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top control row: period toggle + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={period === p.key ? "pill-ink" : "pill"}
              style={{
                fontSize: "10px",
                letterSpacing: "0.16em",
                padding: "6px 14px",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "all 200ms",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <DarwinSyncButton onSynced={() => window.location.reload()} />
          <button
            onClick={onLogDeal}
            className="btn-coral"
            style={{ fontFamily: "inherit" }}
          >
            + LOG A DEAL
          </button>
        </div>
      </div>

      {/* Horizontal grid of metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
        }}
      >
        {METRICS.map(metricDef => {
          const isActive = metric === metricDef.key;
          const v = valueFor(metricDef.key);
          return (
            <button
              key={metricDef.key}
              onClick={() => setMetric(metricDef.key)}
              style={{
                background: "var(--aire-card)",
                border: `1px solid ${isActive ? "var(--aire-border-2)" : "var(--aire-border)"}`,
                borderRadius: "16px",
                padding: "22px",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: isActive ? "var(--shadow-card-hover)" : "var(--shadow-card)",
                transition: "box-shadow 320ms var(--ease-apple), border-color 200ms var(--ease-apple), transform 200ms var(--ease-apple)",
                transform: isActive ? "translateY(-1px)" : "none",
                position: "relative",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.boxShadow = "var(--shadow-card)";
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  color: "var(--aire-text-2)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: "10px",
                }}
              >
                {metricDef.label}
              </div>
              <div
                className="metric-number"
                style={{
                  fontSize: "38px",
                  color: "var(--aire-text)",
                  lineHeight: 1,
                }}
              >
                {metricDef.format(v)}
              </div>
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: "22px",
                    right: "22px",
                    bottom: "16px",
                    height: "2px",
                    background: "var(--aire-coral)",
                    borderRadius: "2px",
                    opacity: 0.9,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Chart panel — light card */}
      <div
        style={{
          background: "var(--aire-card)",
          border: "1px solid var(--aire-border)",
          borderRadius: "16px",
          padding: "24px 28px 18px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Headline row */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                color: "var(--aire-text-2)",
                textTransform: "uppercase",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              {m.sub} — {period.toUpperCase()}
            </p>
            <div
              className="metric-number"
              style={{
                fontSize: "54px",
                color: "var(--aire-text)",
                lineHeight: 1,
              }}
            >
              {m.format(headlineValue)}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "14px", alignItems: "center", flexWrap: "wrap" }}>
              {yoyDelta !== null && (
                <span
                  className={yoyDelta >= 0 ? "pill-mint" : "pill-coral"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    letterSpacing: "0.04em",
                    fontWeight: 600,
                    border: "1px solid",
                  }}
                >
                  {yoyDelta >= 0 ? "▲" : "▼"} {Math.abs(yoyDelta).toFixed(1)}% vs last year
                </span>
              )}
              {goalPct !== null && (
                <span style={{ fontSize: "11px", color: "var(--aire-text-2)", letterSpacing: "0.04em" }}>
                  {goalPct.toFixed(0)}% of {m.format(goal!)} goal
                </span>
              )}
            </div>

            {/* Goal % bar */}
            {goalPct !== null && (
              <div
                style={{
                  marginTop: "12px",
                  width: "260px",
                  maxWidth: "100%",
                  height: "4px",
                  background: "var(--aire-bg-deep)",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, goalPct)}%`,
                    background: "var(--aire-coral)",
                    borderRadius: "999px",
                    transition: "width 600ms var(--ease-out-expo)",
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CORAL} stopOpacity={0.30} />
                <stop offset="100%" stopColor={CORAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(26,26,28,0.06)" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: "#9B9B9F", fontSize: 10, letterSpacing: "0.06em" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9B9B9F", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={n => m.format(n).replace("$", "")}
            />
            <Tooltip
              contentStyle={{
                background: "var(--aire-card)",
                border: "1px solid var(--aire-border)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-card-hover)",
                fontSize: "11px",
                color: "var(--aire-text)",
              }}
              labelStyle={{ color: "var(--aire-text-2)", letterSpacing: "0.08em" }}
              formatter={(value) => [m.format(Number(value)), m.label]}
            />
            {goal && (
              <ReferenceLine
                y={goal}
                stroke={CREAM}
                strokeDasharray="4 4"
                label={{
                  value: `Goal: ${m.format(goal)}`,
                  fill: "#8a7a18",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="y"
              stroke={CORAL}
              strokeWidth={2}
              fill={`url(#grad-${metric})`}
              dot={false}
              activeDot={{ r: 4, fill: CORAL, stroke: "var(--aire-card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
