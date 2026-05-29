"use client";

import { CSSProperties, ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  width?: number | string;
  style?: CSSProperties;
}

export function Modal({ open, onClose, children, title, width = 480, style }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "fade-in 120ms ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--aire-card-warm)",
          border: "1px solid var(--aire-border-2)",
          borderRadius: "16px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "scale-in 180ms var(--ease-out-expo) both",
          ...style,
        }}
      >
        {title && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 22px",
            borderBottom: "1px solid var(--aire-border)",
          }}>
            <span style={{
              fontSize: "10px",
              letterSpacing: "0.20em",
              fontWeight: 600,
              color: "var(--aire-text)",
              textTransform: "uppercase",
            }}>
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--aire-muted)",
                fontSize: "18px",
                lineHeight: 1,
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: "22px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
