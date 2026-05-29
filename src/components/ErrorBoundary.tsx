"use client";

import { Component, ReactNode } from "react";
import Link from "next/link";

interface Props {
  children: ReactNode;
  source?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to error memory system
    try {
      const res = await fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ui",
          source: this.props.source ?? "React component",
          message: error.message,
          stack: error.stack,
          context: { componentStack: info.componentStack.slice(0, 500) },
        }),
      });
      const data = await res.json();
      this.setState({ errorId: data.id });
    } catch {
      // Don't fail silently — error logging failure is itself logged to console
      console.error("[ErrorBoundary] Failed to log error to error memory");
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "300px", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px",
      }}>
        <div style={{
          maxWidth: "500px", textAlign: "center",
          background: "rgba(238,129,114,0.04)",
          border: "1px solid rgba(238,129,114,0.15)",
          borderRadius: "12px",
          padding: "32px",
        }}>
          <p style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--reve-coral)", marginBottom: "16px" }}>
            SYSTEM ERROR — LOGGED TO ERROR MEMORY
          </p>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--reve-text)", marginBottom: "8px" }}>
            {this.state.error?.message ?? "Something went wrong"}
          </p>
          {this.state.errorId && (
            <p style={{ fontSize: "10px", color: "var(--reve-muted)", marginBottom: "20px", fontFamily: "monospace" }}>
              Error ID: {this.state.errorId}
            </p>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorId: null })}
              style={{
                fontSize: "11px", letterSpacing: "0.12em", padding: "9px 18px",
                background: "var(--reve-coral)", color: "var(--reve-black)",
                border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 700,
              }}
            >
              RETRY
            </button>
            <Link
              href="/system"
              style={{
                fontSize: "11px", letterSpacing: "0.12em", padding: "9px 18px",
                background: "none", color: "var(--reve-muted)",
                border: "1px solid var(--reve-border)", borderRadius: "8px", textDecoration: "none",
              }}
            >
              VIEW ERROR LOG
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
