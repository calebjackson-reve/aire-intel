"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * LoopPanel — shows the Dotloop transaction(s) linked to a contact.
 *
 * Renders nothing if the contact has no linked loops. When linked, shows:
 *   - Loop name + status chip
 *   - Address + price
 *   - Closing date countdown
 *   - Signed / pending document counts
 *   - Top 3 participants (role + name + email)
 *   - Deep link to open the loop in Dotloop's web UI
 *
 * Designed for the right-sidebar slot on /contacts/[id].
 */

interface Loop {
  id: string;
  dotloopId: string;
  name: string;
  status: string;
  loopType: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  closingDate: string | null;
  expectedClosingDate: string | null;
  contractDate: string | null;
  salePrice: number | null;
  participantsJson: string | null;
  signedDocsCount: number;
  pendingDocsCount: number;
  lastSyncedAt: string;
}

interface Participant {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}

type StatusPill = { className: string; color: string };

// Maps loop status → AIRE pill style class + label color for the badge text.
const STATUS_PILL: Record<string, StatusPill> = {
  PRE_OFFER: { className: "pill", color: "var(--aire-text-2)" },
  UNDER_CONTRACT: { className: "pill pill-coral", color: "var(--aire-coral-deep)" },
  PENDING: { className: "pill pill-coral", color: "var(--aire-coral-deep)" },
  SOLD: { className: "pill pill-mint", color: "#2d7a55" },
  CLOSED: { className: "pill pill-mint", color: "#2d7a55" },
  LEASED: { className: "pill pill-mint", color: "#2d7a55" },
  WITHDRAWN: { className: "pill", color: "var(--aire-text-2)" },
  TERMINATED: { className: "pill", color: "var(--aire-text-2)" },
};

function fmtPrice(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days}d away`;
}

export default function LoopPanel({ leadId }: { leadId: string }) {
  const [loops, setLoops] = useState<Loop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch all loops, filter to ones linked to this lead.
    // (Cheap enough — most agents have <50 active loops.)
    fetch("/api/dotloop")
      .then((r) => r.json())
      .then((data: { loops: (Loop & { leadId: string | null })[] }) => {
        const linked = (data.loops ?? []).filter((l) => l.leadId === leadId);
        setLoops(linked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [leadId]);

  if (loading) return null;
  if (loops.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <p
          style={{
            fontSize: "10px",
            letterSpacing: "0.16em",
            color: "var(--aire-text-2)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          DOTLOOP{loops.length > 1 ? ` · ${loops.length}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {loops.map((loop, idx) => {
          const participants: Participant[] = loop.participantsJson
            ? (JSON.parse(loop.participantsJson) as Participant[])
            : [];
          const principals = participants.filter((p) => /BUYER|SELLER/i.test(p.role ?? ""));
          const closing = loop.closingDate ?? loop.expectedClosingDate;
          const pill = STATUS_PILL[loop.status] ?? { className: "pill", color: "var(--aire-text-2)" };
          const docTotal = loop.signedDocsCount + loop.pendingDocsCount;

          return (
            <div
              key={loop.id}
              style={{
                borderTop: idx > 0 ? "1px solid var(--aire-border)" : "none",
                paddingTop: idx > 0 ? "14px" : 0,
              }}
            >
              {/* Name + status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--aire-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {loop.name}
                </span>
                <span
                  className={pill.className}
                  style={{
                    fontSize: "9px",
                    letterSpacing: "0.12em",
                    padding: "3px 9px",
                    color: pill.color,
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {loop.status.replace(/_/g, " ")}
                </span>
              </div>

              {/* Address + price */}
              {loop.streetAddress && (
                <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginBottom: "6px" }}>
                  {loop.streetAddress}{loop.city ? `, ${loop.city}` : ""} · {fmtPrice(loop.salePrice)}
                </p>
              )}

              {/* Closing countdown */}
              {closing && (
                <p style={{ fontSize: "11px", color: "#a37e1c", marginBottom: "10px", fontWeight: 500 }}>
                  Closing {new Date(closing).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {daysUntil(closing)}
                </p>
              )}

              {/* Docs counter */}
              {docTotal > 0 && (
                <div style={{ display: "flex", gap: "12px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#2d7a55", letterSpacing: "0.04em" }}>
                    ✓ {loop.signedDocsCount} signed
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: loop.pendingDocsCount > 0 ? "var(--aire-coral-deep)" : "var(--aire-muted)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {loop.pendingDocsCount > 0 ? `◯ ${loop.pendingDocsCount} pending` : "all signed"}
                  </div>
                </div>
              )}

              {/* Top 3 principals */}
              {principals.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
                  {principals.slice(0, 3).map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <span style={{ color: "var(--aire-text-2)" }}>
                        {p.name}
                        <span
                          style={{
                            color: "var(--aire-muted)",
                            marginLeft: "6px",
                            fontSize: "9px",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {p.role?.replace(/_/g, " ")}
                        </span>
                      </span>
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          style={{ color: "var(--aire-muted)", textDecoration: "none", fontSize: "10px" }}
                        >
                          ✉
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Deep link to Dotloop — ink pill */}
              <Link
                href={`https://app.dotloop.com/my/loops/${loop.dotloopId}`}
                target="_blank"
                rel="noopener"
                className="btn-primary"
                style={{
                  display: "inline-block",
                  fontSize: "10px",
                  letterSpacing: "0.10em",
                  padding: "8px 14px",
                  textDecoration: "none",
                  borderRadius: "999px",
                  fontWeight: 600,
                }}
              >
                OPEN IN DOTLOOP ↗
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
