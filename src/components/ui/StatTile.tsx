"use client";

import { CSSProperties, ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string | number;
  delta?: string;         // e.g. "+12%" — positive shown in mint, negative in coral
  deltaPositive?: boolean; // explicit override
  sub?: string;           // secondary info below value
  accent?: string;        // override color for value
  icon?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}

export function StatTile({ label, value, delta, deltaPositive, sub, accent, icon, style, onClick }: StatTileProps) {
  const isPositive = deltaPositive !== undefined ? deltaPositive : delta ? !delta.startsWith("-") : undefined;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "12px",
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: onClick ? "border-color 200ms, box-shadow 200ms" : undefined,
        ...style,
      }}
      onMouseEnter={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--aire-border-2)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-card-hover)";
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--aire-border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      } : undefined}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <span style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-muted)", textTransform: "uppercase", fontWeight: 500 }}>
          {label}
        </span>
        {icon && <span style={{ color: "var(--aire-muted)", opacity: 0.7 }}>{icon}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          className="metric-number"
          style={{ fontSize: "22px", color: accent ?? "var(--aire-text)" }}
        >
          {value}
        </span>
        {delta && (
          <span style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            fontWeight: 600,
            color: isPositive ? "var(--aire-mint)" : "var(--status-urgent)",
          }}>
            {delta}
          </span>
        )}
      </div>

      {sub && (
        <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "4px" }}>{sub}</p>
      )}
    </div>
  );
}
