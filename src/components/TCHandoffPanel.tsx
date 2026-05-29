"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * TC Handoff Panel.
 *
 * Shows under-contract deals and lets Caleb send a complete TC packet in one
 * click. Replaces the old Morning Brief slot on the dashboard — same real
 * estate, much higher leverage. Every minute saved coordinating with the TC
 * is a minute back on prospecting.
 */

interface Deal {
  id: string;
  name: string;
  address: string | null;
  pricePoint: number | null;
  nextActionDate: string | null;
  nextActionNote: string | null;
  handoffSentAt: string | null;
}

interface TeamConfig {
  tc: {
    name: string | null;
    email: string | null;
    phone: string | null;
    configured: boolean;
  };
}

interface ApiResponse {
  team: TeamConfig;
  deals: Deal[];
}

export default function TCHandoffPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/handoff/tc")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function sendPacket(deal: Deal) {
    if (!data?.team.tc.configured) return;
    setSending(deal.id);
    try {
      const res = await fetch("/api/handoff/tc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: deal.id }),
      });
      const { packet } = await res.json();

      // Open mail client with everything pre-filled
      const to = packet.to ?? "";
      const subject = encodeURIComponent(packet.subject);
      const body = encodeURIComponent(packet.body);
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;

      // Optimistically mark as handed off
      setData((prev) =>
        prev
          ? {
              ...prev,
              deals: prev.deals.map((d) =>
                d.id === deal.id ? { ...d, handoffSentAt: new Date().toISOString() } : d,
              ),
            }
          : prev,
      );
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: "22px" }}>
        <div className="skeleton" style={{ height: "16px", width: "140px", marginBottom: "12px", borderRadius: "4px" }} />
        <div className="skeleton" style={{ height: "12px", width: "220px", borderRadius: "4px" }} />
      </div>
    );
  }

  const deals = data?.deals ?? [];
  const tcConfigured = data?.team.tc.configured ?? false;
  const pending = deals.filter((d) => !d.handoffSentAt);
  const pendingCount = pending.length;
  const sentCount = deals.length - pendingCount;
  const allClear = pendingCount === 0;
  const progressColor = allClear ? "var(--aire-mint)" : "var(--aire-coral)";
  const statusColor = allClear ? "#2d7a55" : "var(--aire-coral-deep)";

  return (
    <div className="glass-card" style={{ padding: "22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-text-2)", textTransform: "uppercase" }}>
            TC HANDOFF
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--aire-border)" }} />
        </div>
        {data?.team.tc.name && (
          <span style={{ fontSize: "10px", color: "var(--aire-muted)" }}>
            → {data.team.tc.name.split(" ")[0]}
          </span>
        )}
      </div>

      {!tcConfigured && (
        <div style={{ padding: "18px 0", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "var(--aire-text-2)", marginBottom: "12px" }}>
            Add your TC to enable one-click handoffs.
          </p>
          <Link
            href="/settings"
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: "8px",
              background: "var(--aire-coral-soft)",
              color: "var(--aire-coral-deep)",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid rgba(238,129,114,0.30)",
            }}
          >
            Configure TC →
          </Link>
        </div>
      )}

      {tcConfigured && deals.length === 0 && (
        <p style={{ fontSize: "12px", color: "var(--aire-muted)", fontStyle: "italic", padding: "12px 0" }}>
          No deals under contract right now.
        </p>
      )}

      {tcConfigured && deals.length > 0 && (
        <>
          {/* Progress header — "3 of 12 packets sent" with bar */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--aire-text)", fontWeight: 500 }}>
                {sentCount} of {deals.length} packets sent
              </span>
              <span style={{ fontSize: "10px", color: statusColor, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                {allClear ? "ALL CLEAR" : `${pendingCount} PENDING`}
              </span>
            </div>
            <div style={{
              height: "4px",
              background: "var(--aire-bg-deep)",
              borderRadius: "4px",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${(sentCount / Math.max(deals.length, 1)) * 100}%`,
                height: "100%",
                background: progressColor,
                transition: "width 380ms ease-out",
              }} />
            </div>
          </div>

          {/* Mini table — pending deals first, then sent */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[...deals]
              .sort((a, b) => Number(!!a.handoffSentAt) - Number(!!b.handoffSentAt))
              .slice(0, 10)
              .map((deal) => {
                const sent = !!deal.handoffSentAt;
                const nextActionShort = deal.nextActionDate
                  ? new Date(deal.nextActionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : null;
                return (
                  <div
                    key={deal.id}
                    style={{
                      padding: "9px 11px",
                      background: sent ? "var(--aire-mint-soft)" : "var(--aire-card-warm)",
                      border: `1px solid ${sent ? "rgba(184,230,208,0.30)" : "var(--aire-border)"}`,
                      borderRadius: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "baseline" }}>
                        <Link
                          href={`/contacts/${deal.id}`}
                          style={{ fontSize: "12px", color: "var(--aire-text)", fontWeight: 500, textDecoration: "none" }}
                        >
                          {deal.name}
                        </Link>
                        {nextActionShort && (
                          <span style={{ fontSize: "10px", color: "#a37e1c", letterSpacing: "0.04em", fontWeight: 600 }}>
                            · {nextActionShort}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--aire-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {deal.address ?? "Address TBD"}
                        {deal.pricePoint && ` · $${(deal.pricePoint / 1000).toFixed(0)}k`}
                      </div>
                    </div>
                    {sent ? (
                      <span style={{ fontSize: "10px", color: "#2d7a55", letterSpacing: "0.1em", fontWeight: 600 }}>
                        SENT ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => sendPacket(deal)}
                        disabled={sending === deal.id}
                        className="btn-coral"
                        style={{
                          padding: "5px 10px",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          borderRadius: "999px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          color: "var(--aire-ink)",
                        }}
                      >
                        {sending === deal.id ? "…" : "SEND →"}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          {deals.length > 10 && (
            <Link
              href="/pipeline"
              style={{
                display: "block",
                fontSize: "11px",
                color: "var(--aire-coral-deep)",
                textAlign: "center",
                marginTop: "10px",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              View all {deals.length} active deals →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
