"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * HotLeadsBubble.
 *
 * Surfaces the top 3 hot leads inline on the dashboard so Caleb can tel:/sms:
 * in one tap without opening the HotListings drawer. Returns null if there
 * are no hot leads — no chrome, no empty state.
 */

interface HotLead {
  loftyId: string;
  name: string;
  phone?: string;
  email?: string;
  stage: string;
  score: number;
  tier: "hot" | "warm";
  lastTouch: string | null;
}

interface ApiResponse {
  hot?: HotLead[];
  warm?: HotLead[];
  total?: number;
  error?: string;
}

export default function HotLeadsBubble() {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/lofty/hot-warm")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        const hot = Array.isArray(d.hot) ? d.hot : [];
        const top3 = [...hot]
          .sort((a, b) => {
            if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
            const at = a.lastTouch ? new Date(a.lastTouch).getTime() : 0;
            const bt = b.lastTouch ? new Date(b.lastTouch).getTime() : 0;
            return bt - at;
          })
          .slice(0, 3);
        setLeads(top3);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="skeleton" style={{ height: "10px", width: "90px", borderRadius: "3px" }} />
        <div style={{ display: "flex", gap: "10px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ flex: 1, height: "62px", borderRadius: "14px" }} />
          ))}
        </div>
      </div>
    );
  }

  if (leads.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-text-2)" }}>
          HOT LEADS
        </span>
        <div style={{ flex: 1, height: "1px", background: "var(--aire-border)" }} />
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {leads.map((lead) => (
          <LeadRow key={lead.loftyId} lead={lead} />
        ))}
      </div>
    </div>
  );
}

function LeadRow({ lead }: { lead: HotLead }) {
  const digits = lead.phone?.replace(/[^\d+]/g, "") ?? "";
  const canCall = digits.length >= 7;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: "1 1 240px",
        minWidth: 0,
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderRadius: "14px",
        padding: "14px 16px",
        boxShadow: hover ? "var(--shadow-card-hover)" : "var(--shadow-card)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <Link
        href={`/contacts?loftyId=${encodeURIComponent(lead.loftyId)}`}
        style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span
            style={{
              fontSize: "13px",
              color: "var(--aire-text)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {lead.name}
          </span>
          {lead.score > 0 && (
            <span
              className="pill-cream"
              style={{
                fontSize: "9px",
                padding: "1px 6px",
                borderRadius: "20px",
                letterSpacing: "0.06em",
                flexShrink: 0,
              }}
            >
              {lead.score}
            </span>
          )}
        </div>
        {lead.phone && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--aire-muted)",
              marginTop: "2px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {lead.phone}
          </div>
        )}
      </Link>

      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {canCall && (
          <a
            href={`tel:${digits}`}
            className="btn-coral"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "5px 10px",
              borderRadius: "999px",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            CALL
          </a>
        )}
        {canCall && (
          <a
            href={`sms:${digits}`}
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "5px 10px",
              borderRadius: "999px",
              background: "var(--aire-card)",
              color: "var(--aire-coral)",
              border: "1px solid rgba(238,129,114,0.30)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            TEXT
          </a>
        )}
      </div>
    </div>
  );
}
