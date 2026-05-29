"use client";

import { CSSProperties, ReactNode } from "react";

type CardVariant = "default" | "warm" | "ink" | "deep";

interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  padding?: string | number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}

const BASE: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid var(--aire-border)",
  boxShadow: "var(--shadow-card)",
  position: "relative",
  overflow: "hidden",
  transition: "box-shadow 280ms var(--ease-apple), border-color 200ms",
};

const VARIANTS: Record<CardVariant, CSSProperties> = {
  default: { background: "var(--aire-card)" },
  warm:    { background: "var(--aire-card-warm)" },
  ink: {
    background: "rgba(238,129,114,0.06)",
    border: "1px solid rgba(238,129,114,0.18)",
  },
  deep: { background: "var(--aire-bg-deep)" },
};

export function Card({ children, variant = "default", padding = "20px", className, style, onClick, hover = true }: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        ...BASE,
        ...VARIANTS[variant],
        padding,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={hover && !onClick ? undefined : undefined}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{
      fontSize: "9px",
      letterSpacing: "0.20em",
      color: "var(--aire-muted)",
      fontWeight: 500,
      textTransform: "uppercase",
      marginBottom: "14px",
      ...style,
    }}>
      {children}
    </p>
  );
}

export function CardDivider() {
  return <div style={{ height: "1px", background: "var(--aire-border)", margin: "16px 0" }} />;
}
