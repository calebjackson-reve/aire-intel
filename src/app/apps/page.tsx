"use client";

import Link from "next/link";

const APPS = [
  {
    id: "mls",
    label: "Paragon MLS",
    description: "Search listings, pull comps, view active/sold inventory for GBRAR",
    href: "/mls",
    color: "var(--aire-coral)",
    internal: true,
  },
  {
    id: "crm",
    label: "Rêve CRM",
    description: "Lead management, tasks, campaigns, contact history via Lofty",
    href: "/crm",
    color: "var(--aire-mint)",
    internal: true,
  },
  {
    id: "docusign",
    label: "DocuSign",
    description: "Send, sign, and track contracts and disclosures",
    href: "https://app.docusign.com",
    color: "var(--aire-cream)",
    internal: false,
  },
  {
    id: "dotloop",
    label: "Dotloop",
    description: "Transaction management and document storage",
    href: "https://dotloop.com",
    color: "var(--aire-text-2)",
    internal: false,
  },
  {
    id: "canva",
    label: "Canva",
    description: "Quick graphics and social content when the Post Engine isn't enough",
    href: "https://canva.com",
    color: "var(--aire-text-2)",
    internal: false,
  },
  {
    id: "calendar",
    label: "Google Calendar",
    description: "Showings, closings, listing appointments, team schedule",
    href: "https://calendar.google.com",
    color: "var(--aire-text-2)",
    internal: false,
  },
];

export default function AppsHub() {
  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "1360px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          APPS HUB
        </p>
        <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05 }}>
          All Your Tools
        </h1>
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "14px", animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) 200ms both" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
        {APPS.map((app, i) => {
          const Card = (
            <div
              className="card-light"
              style={{
                borderLeft: `3px solid ${app.color}`,
                padding: "22px 22px",
                cursor: "pointer",
                animation: `fade-up 600ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
                textDecoration: "none",
                display: "block",
                height: "100%",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--aire-text)", letterSpacing: "0.01em" }}>
                  {app.label}
                </span>
                <span className={app.internal ? "pill pill-coral" : "pill"} style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "3px 9px" }}>
                  {app.internal ? "EMBEDDED" : "EXTERNAL ↗"}
                </span>
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--aire-text-2)", lineHeight: 1.6 }}>
                {app.description}
              </p>
            </div>
          );

          return app.internal ? (
            <Link key={app.id} href={app.href} style={{ textDecoration: "none" }}>
              {Card}
            </Link>
          ) : (
            <a key={app.id} href={app.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              {Card}
            </a>
          );
        })}
      </div>

      <div className="card-warm" style={{ marginTop: "40px", padding: "22px 24px" }}>
        <p style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          NOTE ON EMBEDDING
        </p>
        <p style={{ fontSize: "12.5px", color: "var(--aire-text-2)", lineHeight: 1.7 }}>
          Paragon and the CRM open embedded inside AIRE. If a service blocks iframe embedding (a security setting some apps use), you&apos;ll see an &ldquo;Open in New Tab&rdquo; fallback — the app opens but in a separate window. This is a server-side restriction, not something we can override.
        </p>
      </div>
    </div>
  );
}
