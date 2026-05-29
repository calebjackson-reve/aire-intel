"use client";

import { useEffect, useState, CSSProperties } from "react";

interface Props {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    stage: string;
  };
  onAIFollowUp: () => void;
  onScrollToLog: () => void;
  onSendTCPacket: () => void;
}

const panelStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 50,
  width: 70,
  flexDirection: "column",
  gap: 2,
  padding: "8px 4px",
  background: "var(--aire-ink)",
  color: "var(--aire-text-inv)",
  border: "none",
  borderRadius: 16,
  boxShadow: "var(--shadow-ink)",
};

const buttonBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  height: 56,
  width: "100%",
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
  transition: "background 0.15s ease",
  position: "relative",
};

const iconStyle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
};

const labelStyle: CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 500,
};

type Btn = {
  key: string;
  href?: string;
  onClick?: () => void;
  icon: string;
  label: string;
  /** Per-button override color (e.g. mint for TC) — defaults to cream. */
  color?: string;
  /** Render a small coral dot under the icon to flag primary action. */
  coralDot?: boolean;
};

export default function ContactQuickActions({
  lead,
  onAIFollowUp,
  onScrollToLog,
  onSendTCPacket,
}: Props) {
  const [visible, setVisible] = useState<boolean>(true);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setVisible(window.innerWidth >= 768);
    }
  }, []);

  if (!visible) return null;

  const buttons: Btn[] = [];

  if (lead.phone) {
    buttons.push({
      key: "call",
      href: `tel:${lead.phone}`,
      icon: "☎",
      label: "Call",
      coralDot: true,
    });
    buttons.push({
      key: "text",
      href: `sms:${lead.phone}`,
      icon: "✉",
      label: "Text",
    });
  }

  if (lead.email) {
    buttons.push({
      key: "email",
      href: `mailto:${lead.email}`,
      icon: "@",
      label: "Email",
    });
  }

  buttons.push({
    key: "ai",
    onClick: onAIFollowUp,
    icon: "✦",
    label: "AI",
    coralDot: true,
  });

  buttons.push({
    key: "log",
    onClick: onScrollToLog,
    icon: "✎",
    label: "Log",
  });

  if (lead.stage === "under_contract") {
    buttons.push({
      key: "tc",
      onClick: onSendTCPacket,
      icon: "→",
      label: "TC",
      color: "var(--aire-mint)",
    });
  }

  const renderInner = (b: Btn) => {
    const color = b.color ?? "var(--aire-text-inv)";
    return (
      <>
        <span style={{ ...iconStyle, color }}>{b.icon}</span>
        <span style={{ ...labelStyle, color }}>{b.label}</span>
        {b.coralDot && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              bottom: 4,
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--aire-coral)",
            }}
          />
        )}
      </>
    );
  };

  return (
    <div style={{ ...panelStyle, display: "flex" }} aria-label="Contact quick actions">
      {buttons.map((b) => {
        const hovered = hoverKey === b.key;
        const style: CSSProperties = {
          ...buttonBaseStyle,
          background: hovered ? "var(--aire-ink-soft)" : "transparent",
        };
        const common = {
          onMouseEnter: () => setHoverKey(b.key),
          onMouseLeave: () => setHoverKey(null),
          style,
        };
        if (b.href) {
          return (
            <a key={b.key} href={b.href} {...common}>
              {renderInner(b)}
            </a>
          );
        }
        return (
          <button key={b.key} type="button" onClick={b.onClick} {...common}>
            {renderInner(b)}
          </button>
        );
      })}
    </div>
  );
}
