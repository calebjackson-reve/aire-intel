"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
      padding: "48px 24px",
      textAlign: "center",
    }}>
      {icon && (
        <div style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: "var(--aire-card)",
          border: "1px solid var(--aire-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "4px",
          color: "var(--aire-muted)",
        }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--aire-text-2)" }}>{title}</p>
      {description && (
        <p style={{ fontSize: "12px", color: "var(--aire-muted)", maxWidth: "280px", lineHeight: 1.5 }}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-ghost"
          style={{ marginTop: "8px", fontSize: "11px", letterSpacing: "0.12em" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
