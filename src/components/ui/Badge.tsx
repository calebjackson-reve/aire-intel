"use client";

import { CSSProperties, ReactNode } from "react";

type BadgeVariant = "default" | "coral" | "cream" | "mint" | "muted" | "urgent" | "active" | "warm" | "cold";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  style?: CSSProperties;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, CSSProperties> = {
  default: {
    background: "var(--aire-card-warm)",
    color: "var(--aire-text-2)",
    border: "1px solid var(--aire-border)",
  },
  coral: {
    background: "var(--aire-coral-soft)",
    color: "var(--aire-coral)",
    border: "1px solid rgba(238,129,114,0.20)",
  },
  cream: {
    background: "var(--aire-cream-soft)",
    color: "var(--aire-cream)",
    border: "1px solid rgba(239,221,132,0.20)",
  },
  mint: {
    background: "var(--aire-mint-soft)",
    color: "var(--aire-mint)",
    border: "1px solid rgba(110,231,183,0.20)",
  },
  muted: {
    background: "transparent",
    color: "var(--aire-muted)",
    border: "1px solid var(--aire-border)",
  },
  urgent: {
    background: "rgba(238,129,114,0.12)",
    color: "var(--status-urgent)",
    border: "1px solid rgba(238,129,114,0.25)",
  },
  active: {
    background: "rgba(110,231,183,0.10)",
    color: "var(--status-active)",
    border: "1px solid rgba(110,231,183,0.25)",
  },
  warm: {
    background: "rgba(239,221,132,0.10)",
    color: "var(--aire-cream)",
    border: "1px solid rgba(239,221,132,0.25)",
  },
  cold: {
    background: "var(--status-cold)",
    color: "var(--status-cold-text)",
    border: "1px solid transparent",
  },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: "var(--aire-muted)",
  coral: "var(--aire-coral)",
  cream: "var(--aire-cream)",
  mint: "var(--aire-mint)",
  muted: "var(--aire-muted)",
  urgent: "var(--status-urgent)",
  active: "var(--status-active)",
  warm: "var(--aire-cream)",
  cold: "var(--status-cold-text)",
};

export function Badge({ children, variant = "default", style, dot }: BadgeProps) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: dot ? "5px" : undefined,
      padding: "3px 8px",
      borderRadius: "6px",
      fontSize: "10px",
      letterSpacing: "0.10em",
      fontWeight: 500,
      whiteSpace: "nowrap",
      ...VARIANT_STYLES[variant],
      ...style,
    }}>
      {dot && (
        <span style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          background: DOT_COLORS[variant],
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}

// Stage-specific badge convenience
export function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    new_lead:       { label: "NEW", variant: "default" },
    active:         { label: "ACTIVE", variant: "active" },
    showing:        { label: "SHOWING", variant: "warm" },
    under_contract: { label: "CONTRACT", variant: "coral" },
    closed:         { label: "CLOSED", variant: "mint" },
  };
  const { label, variant } = map[stage] ?? { label: stage.toUpperCase(), variant: "default" as BadgeVariant };
  return <Badge variant={variant}>{label}</Badge>;
}
