"use client";

import EmbeddedApp from "@/components/EmbeddedApp";

export default function CRMPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 57px)" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "10px 20px",
          background: "var(--reve-surface)",
          borderBottom: "1px solid var(--reve-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--reve-muted)" }}>
            RÊVE CRM
          </span>
          <div style={{ width: "1px", height: "12px", background: "var(--reve-border)" }} />
          <span style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--reve-muted)" }}>
            POWERED BY LOFTY
          </span>
        </div>
        <a
          href="https://crm.reverealtors.com/admin/home/home/my"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "10px",
            letterSpacing: "0.12em",
            color: "var(--reve-muted)",
            textDecoration: "none",
          }}
        >
          OPEN IN NEW TAB ↗
        </a>
      </div>

      <EmbeddedApp
        url="https://crm.reverealtors.com/admin/home/home/my"
        title="Rêve CRM"
        label="crm"
      />
    </div>
  );
}
