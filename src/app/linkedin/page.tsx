"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import LinkedInOutreachCard, { type OutreachRecord } from "@/components/LinkedInOutreachCard";

interface LeadWithOutreach {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  stage: string;
  linkedInOutreach: Array<{
    id: string;
    status: string;
    message: string;
    generatedAt: string;
    copiedAt: string | null;
    sentAt: string | null;
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  new_lead: "NEW",
  active: "ACTIVE",
  showing: "SHOWING",
  under_contract: "CONTRACT",
  closed: "CLOSED",
};

export default function LinkedInPage() {
  const [leads, setLeads] = useState<LeadWithOutreach[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded lead: which lead's card is open
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  // Per-lead outreach history: { [leadId]: OutreachRecord[] }
  const [outreachMap, setOutreachMap] = useState<Record<string, OutreachRecord[]>>({});

  // Generating state
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [contextInputs, setContextInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/linkedin/outreach")
      .then((r) => r.json())
      .then((data) => {
        setLeads(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function loadOutreachHistory(leadId: string) {
    const records = await fetch(`/api/linkedin/outreach?leadId=${leadId}`)
      .then((r) => r.json());
    setOutreachMap((prev) => ({ ...prev, [leadId]: records }));
    return records;
  }

  async function handleExpand(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      return;
    }
    setExpandedLeadId(leadId);
    if (!outreachMap[leadId]) {
      await loadOutreachHistory(leadId);
    }
  }

  async function handleGenerate(lead: LeadWithOutreach) {
    setGeneratingFor(lead.id);
    try {
      const res = await fetch("/api/linkedin/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          context: contextInputs[lead.id] ?? "",
        }),
      });
      const newRecord: OutreachRecord = await res.json();

      // Prepend to outreach history
      setOutreachMap((prev) => ({
        ...prev,
        [lead.id]: [newRecord, ...(prev[lead.id] ?? [])],
      }));

      // Update the lead's inline latest status in the list
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id
            ? {
                ...l,
                linkedInOutreach: [
                  {
                    id: newRecord.id,
                    status: newRecord.status,
                    message: newRecord.message,
                    generatedAt: newRecord.generatedAt,
                    copiedAt: newRecord.copiedAt,
                    sentAt: newRecord.sentAt,
                  },
                ],
              }
            : l
        )
      );

      // Auto-expand if not already open
      setExpandedLeadId(lead.id);
    } finally {
      setGeneratingFor(null);
    }
  }

  function handleOutreachUpdate(leadId: string, updated: OutreachRecord) {
    setOutreachMap((prev) => ({
      ...prev,
      [leadId]: (prev[leadId] ?? []).map((r) =>
        r.id === updated.id ? updated : r
      ),
    }));
    // Sync the summary row status too
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              linkedInOutreach: l.linkedInOutreach.map((r) =>
                r.id === updated.id
                  ? { ...r, status: updated.status, copiedAt: updated.copiedAt, sentAt: updated.sentAt }
                  : r
              ),
            }
          : l
      )
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "80px 40px", textAlign: "center", color: "var(--aire-muted)", fontSize: "13px", letterSpacing: "0.14em" }}>
        LOADING...
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: "860px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
        <div>
          <h1
            className="font-display"
            style={{ fontSize: "32px", fontWeight: 500, color: "var(--aire-text)", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}
          >
            LinkedIn Outreach
          </h1>
          <p style={{ fontSize: "12px", color: "var(--aire-muted)", margin: 0, letterSpacing: "0.06em" }}>
            {leads.length} lead{leads.length !== 1 ? "s" : ""} with LinkedIn URL · generate, copy, paste manually
          </p>
        </div>
        <Link
          href="/contacts"
          style={{ fontSize: "11px", letterSpacing: "0.14em", color: "var(--aire-muted)", textDecoration: "none" }}
        >
          ← CONTACTS
        </Link>
      </div>

      {/* Empty state */}
      {leads.length === 0 && (
        <div
          style={{
            background: "var(--aire-card-warm)",
            border: "1px solid var(--aire-border)",
            borderRadius: "16px",
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--aire-muted)", marginBottom: "16px" }}>
            No leads with LinkedIn URLs yet.
          </p>
          <Link
            href="/contacts"
            className="btn-ghost"
            style={{ fontSize: "11px", letterSpacing: "0.14em", padding: "10px 22px", textDecoration: "none" }}
          >
            ADD LINKEDIN URLS IN CONTACTS →
          </Link>
        </div>
      )}

      {/* Lead list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {leads.map((lead) => {
          const latest = lead.linkedInOutreach[0];
          const isExpanded = expandedLeadId === lead.id;
          const isGenerating = generatingFor === lead.id;
          const history = outreachMap[lead.id] ?? [];

          return (
            <div
              key={lead.id}
              style={{
                background: "var(--aire-card)",
                border: "1px solid var(--aire-border)",
                borderRadius: "16px",
                overflow: "hidden",
                transition: "border-color 200ms",
                borderColor: isExpanded ? "var(--aire-coral)" : undefined,
              }}
            >
              {/* Summary row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "18px 22px",
                  cursor: "pointer",
                  gap: "16px",
                }}
                onClick={() => handleExpand(lead.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--aire-text)", margin: "0 0 3px 0" }}>
                      {lead.name}
                    </p>
                    {lead.linkedinUrl && (
                      <p
                        style={{ fontSize: "11px", color: "var(--aire-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {lead.linkedinUrl.replace(/^https?:\/\//, "")}
                      </p>
                    )}
                  </div>

                  {/* Stage pill */}
                  <span
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.14em",
                      color: "var(--aire-muted)",
                      border: "1px solid var(--aire-border)",
                      borderRadius: "999px",
                      padding: "3px 10px",
                      flexShrink: 0,
                    }}
                  >
                    {STAGE_LABELS[lead.stage] ?? lead.stage.toUpperCase()}
                  </span>

                  {/* Latest status dot */}
                  {latest && (
                    <span
                      style={{
                        fontSize: "9px",
                        letterSpacing: "0.14em",
                        color: latest.status === "sent"
                          ? "var(--aire-mint, #6EE7B7)"
                          : latest.status === "copied"
                          ? "var(--aire-cream)"
                          : "var(--aire-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {latest.status === "sent" ? "✓ SENT" : latest.status === "copied" ? "COPIED" : "GENERATED"}
                    </span>
                  )}
                </div>

                {/* Expand chevron */}
                <span style={{ fontSize: "12px", color: "var(--aire-muted)", flexShrink: 0, transition: "transform 200ms", transform: isExpanded ? "rotate(180deg)" : "none" }}>
                  ▾
                </span>
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--aire-border)",
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {/* Context input + generate button */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      value={contextInputs[lead.id] ?? ""}
                      onChange={(e) =>
                        setContextInputs((prev) => ({ ...prev, [lead.id]: e.target.value }))
                      }
                      placeholder="Optional context (e.g. 'met at open house on Bocage Lane')..."
                      className="aire-input"
                      style={{ flex: 1, fontSize: "13px" }}
                    />
                    <button
                      onClick={() => handleGenerate(lead)}
                      disabled={isGenerating}
                      className="btn-coral"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.14em",
                        padding: "9px 20px",
                        cursor: isGenerating ? "wait" : "pointer",
                        opacity: isGenerating ? 0.7 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isGenerating ? "GENERATING…" : "✦ GENERATE"}
                    </button>
                  </div>

                  {/* Outreach history */}
                  {history.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--aire-muted)", fontStyle: "italic" }}>
                      No messages yet. Generate one above.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {history.map((record) => (
                        <LinkedInOutreachCard
                          key={record.id}
                          record={record as OutreachRecord}
                          linkedinUrl={lead.linkedinUrl}
                          onUpdate={(updated) => handleOutreachUpdate(lead.id, updated)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
