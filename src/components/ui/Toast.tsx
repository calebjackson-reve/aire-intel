"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const COLORS: Record<ToastVariant, { bg: string; border: string; dot: string }> = {
  success: { bg: "var(--aire-card-warm)", border: "rgba(110,231,183,0.30)", dot: "var(--aire-mint)" },
  error:   { bg: "var(--aire-card-warm)", border: "rgba(238,129,114,0.30)", dot: "var(--aire-coral)" },
  warning: { bg: "var(--aire-card-warm)", border: "rgba(239,221,132,0.30)", dot: "var(--aire-cream)" },
  info:    { bg: "var(--aire-card-warm)", border: "var(--aire-border-2)",   dot: "var(--aire-text-2)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { id, message, variant }]);
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timers.current[id];
    }, 3500);
  }, []);

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: "fixed",
        bottom: "88px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        alignItems: "center",
        pointerEvents: "none",
      }}>
        {toasts.map(t => {
          const c = COLORS[t.variant];
          return (
            <div
              key={t.id}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: "10px",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                animation: "fade-up 250ms var(--ease-out-expo) both",
                maxWidth: "360px",
                pointerEvents: "auto",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
              <span style={{ fontSize: "13px", color: "var(--aire-text)", lineHeight: 1.4 }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
