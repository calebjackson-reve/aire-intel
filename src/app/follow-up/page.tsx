"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ColdLead {
  id: string;
  name: string;
  firstName: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  pricePoint: number | null;
  lastContactDate: string | null;
}

interface Draft {
  leadId: string;
  name: string;
  phone: string | null;
  email: string | null;
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}

type Channel = "sms" | "email" | "both";

interface SendResult {
  leadId: string;
  sms: { ok: boolean; error?: string };
  email: { ok: boolean; error?: string };
}

// Color shortcuts that resolve to the cream/coral palette.
const MINT_DEEP = "#2d7a55";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function defaultChannel(lead: { phone: string | null; email: string | null }): Channel {
  if (lead.phone && lead.email) return "both";
  if (lead.phone) return "sms";
  return "email";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ColdFollowUpBlastPage() {
  const [leads, setLeads] = useState<ColdLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [channels, setChannels] = useState<Record<string, Channel>>({});

  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);

  // Load cold leads (5+ days no contact) on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contacts?cold=5&limit=50");
        const data = (await res.json()) as { leads: ColdLead[] };
        setLeads(data.leads || []);
      } catch {
        setLeads([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected],
  );

  function toggleLead(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  }

  async function generateDrafts() {
    if (selected.size === 0) return;
    setDrafting(true);
    setSendResults(null);
    try {
      const res = await fetch("/api/followup/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", leadIds: Array.from(selected) }),
      });
      const data = (await res.json()) as { drafts: Draft[] };
      setDrafts(data.drafts || []);

      // Seed channel toggles per draft.
      const seed: Record<string, Channel> = {};
      for (const d of data.drafts || []) {
        seed[d.leadId] = defaultChannel(d);
      }
      setChannels(seed);
    } catch {
      setDrafts([]);
    } finally {
      setDrafting(false);
    }
  }

  function updateDraft(leadId: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.leadId === leadId ? { ...d, ...patch } : d)));
  }

  function setChannel(leadId: string, ch: Channel) {
    setChannels((c) => ({ ...c, [leadId]: ch }));
  }

  async function sendAll() {
    if (drafts.length === 0) return;
    setSending(true);
    try {
      const payload = drafts.map((d) => ({
        leadId: d.leadId,
        channel: channels[d.leadId] ?? defaultChannel(d),
        smsBody: d.smsBody,
        emailSubject: d.emailSubject,
        emailBody: d.emailBody,
      }));
      const res = await fetch("/api/followup/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", messages: payload }),
      });
      const data = (await res.json()) as { results: SendResult[] };
      setSendResults(data.results || []);
    } catch {
      setSendResults([]);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setDrafts([]);
    setChannels({});
    setSendResults(null);
    setSelected(new Set());
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Back link */}
        <div style={{ marginBottom: "14px" }}>
          <Link
            href="/"
            style={{
              fontSize: "10px",
              letterSpacing: "0.18em",
              color: "var(--aire-text-2)",
              textDecoration: "none",
            }}
          >
            ← DASHBOARD
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <p
            style={{
              fontSize: "11px",
              letterSpacing: "0.20em",
              color: "var(--aire-text-2)",
              marginBottom: "10px",
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            COLD FOLLOW-UP BLAST
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: "36px",
              color: "var(--aire-text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Re-engage your stale pipeline.
          </h1>
          <div
            style={{
              width: "32px",
              height: "2px",
              background: "var(--aire-coral)",
              marginTop: "14px",
            }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: "62px", borderRadius: "12px" }}
              />
            ))}
          </div>
        )}

        {/* Empty state — italic muted on warm card */}
        {!loading && leads.length === 0 && (
          <div
            className="card-warm"
            style={{
              padding: "64px 40px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.22em",
                color: MINT_DEEP,
                marginBottom: "14px",
                fontWeight: 600,
              }}
            >
              ALL CLEAR
            </p>
            <p
              className="font-display"
              style={{
                fontSize: "22px",
                color: "var(--aire-text-2)",
                fontStyle: "italic",
                fontWeight: 500,
              }}
            >
              All leads are warm. Nothing to follow up on.
            </p>
          </div>
        )}

        {/* STAGE 1: lead selection (only when no drafts yet) */}
        {!loading && leads.length > 0 && drafts.length === 0 && (
          <>
            {/* Select-all + count */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--aire-border)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  fontSize: "11px",
                  letterSpacing: "0.16em",
                  color: "var(--aire-text-2)",
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{
                    width: "16px",
                    height: "16px",
                    accentColor: "var(--aire-coral)",
                    cursor: "pointer",
                  }}
                />
                SELECT ALL ({leads.length})
              </label>
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--aire-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {selected.size} selected
              </p>
            </div>

            {/* Cold lead list */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "24px",
              }}
            >
              {leads.map((lead) => {
                const isChecked = selected.has(lead.id);
                const days = daysSince(lead.lastContactDate);
                return (
                  <label
                    key={lead.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr auto auto",
                      gap: "16px",
                      alignItems: "center",
                      padding: "14px 18px",
                      background: isChecked ? "var(--aire-card-warm)" : "var(--aire-card)",
                      border: "1px solid",
                      borderColor: isChecked ? "rgba(238,129,114,0.45)" : "var(--aire-border)",
                      borderRadius: "12px",
                      cursor: "pointer",
                      transition: "border-color 150ms, background 150ms",
                      boxShadow: isChecked ? "var(--shadow-card)" : "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleLead(lead.id)}
                      style={{
                        width: "16px",
                        height: "16px",
                        accentColor: "var(--aire-coral)",
                        cursor: "pointer",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--aire-text)",
                          marginBottom: "3px",
                        }}
                      >
                        {lead.name}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--aire-muted)",
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        {lead.phone && <span>{lead.phone}</span>}
                        {lead.email && <span>{lead.email}</span>}
                        {!lead.phone && !lead.email && (
                          <span style={{ color: "var(--aire-coral-deep)" }}>no contact info</span>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.12em",
                        color: "var(--aire-text-2)",
                        textTransform: "uppercase",
                        fontWeight: 500,
                      }}
                    >
                      {lead.stage.replace(/_/g, " ")}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--aire-coral-deep)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                      }}
                    >
                      {days === null ? "never contacted" : `${days}d cold`}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* CTA */}
            <div
              style={{
                position: "sticky",
                bottom: "20px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                onClick={generateDrafts}
                disabled={selected.size === 0 || drafting}
                className="btn-coral"
                style={{
                  fontSize: "12px",
                  padding: "14px 28px",
                  opacity: selected.size === 0 || drafting ? 0.5 : 1,
                  cursor: selected.size === 0 || drafting ? "not-allowed" : "pointer",
                  boxShadow:
                    selected.size > 0 && !drafting
                      ? "0 8px 24px rgba(238,129,114,0.25)"
                      : "none",
                }}
              >
                {drafting
                  ? "GENERATING..."
                  : `✦ GENERATE PERSONALIZED MESSAGES (${selected.size})`}
              </button>
            </div>
          </>
        )}

        {/* STAGE 2: draft review */}
        {drafts.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--aire-border)",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.20em",
                  color: "var(--aire-text-2)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                }}
              >
                REVIEW · {drafts.length} {drafts.length === 1 ? "DRAFT" : "DRAFTS"}
              </p>
              <button onClick={reset} className="btn-ghost">
                ← START OVER
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              {drafts.map((draft) => {
                const ch = channels[draft.leadId] ?? defaultChannel(draft);
                const result = sendResults?.find((r) => r.leadId === draft.leadId);
                return (
                  <DraftCard
                    key={draft.leadId}
                    draft={draft}
                    channel={ch}
                    result={result}
                    onChannel={(c) => setChannel(draft.leadId, c)}
                    onPatch={(p) => updateDraft(draft.leadId, p)}
                  />
                );
              })}
            </div>

            {/* SEND ALL */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              {!sendResults && (
                <button
                  onClick={sendAll}
                  disabled={sending}
                  className="btn-primary"
                  style={{
                    fontSize: "12px",
                    letterSpacing: "0.18em",
                    padding: "16px 36px",
                    opacity: sending ? 0.5 : 1,
                    cursor: sending ? "not-allowed" : "pointer",
                  }}
                >
                  {sending ? "SENDING..." : `SEND ALL (${drafts.length}) →`}
                </button>
              )}
              {sendResults && (
                <button
                  onClick={reset}
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    padding: "14px 28px",
                    background: "var(--aire-mint)",
                    color: "var(--aire-ink)",
                    border: "none",
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✓ DONE — RUN ANOTHER BLAST
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Draft card ─────────────────────────────────────────────────────────────

function DraftCard({
  draft,
  channel,
  result,
  onChannel,
  onPatch,
}: {
  draft: Draft;
  channel: Channel;
  result: SendResult | undefined;
  onChannel: (c: Channel) => void;
  onPatch: (p: Partial<Draft>) => void;
}) {
  const channelOpts: { key: Channel; label: string; disabled: boolean }[] = [
    { key: "sms", label: "SMS", disabled: !draft.phone },
    { key: "email", label: "EMAIL", disabled: !draft.email },
    { key: "both", label: "BOTH", disabled: !draft.phone || !draft.email },
  ];

  const smsCount = draft.smsBody.length;

  // Compute result indicator state per channel.
  function channelStatus(forCh: "sms" | "email"): "idle" | "ok" | "err" | "skip" {
    if (!result) return "idle";
    const wanted = channel === "both" || channel === forCh;
    if (!wanted) return "skip";
    const r = result[forCh];
    return r.ok ? "ok" : "err";
  }

  const smsState = channelStatus("sms");
  const emailState = channelStatus("email");

  // Overall send state colors per-card border accent.
  const fullSuccess = result?.sms.ok && result?.email.ok;
  const anyFail = result && (!result.sms.ok || !result.email.ok);

  return (
    <div
      style={{
        background: "var(--aire-card)",
        border: "1px solid",
        borderColor: result
          ? fullSuccess
            ? "rgba(184,230,208,0.55)"
            : "rgba(238,129,114,0.30)"
          : "var(--aire-border)",
        borderRadius: "14px",
        padding: "18px",
        boxShadow: "var(--shadow-card)",
        transition: "box-shadow 320ms var(--ease-apple), border-color 200ms",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "16px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link
            href={`/contacts/${draft.leadId}`}
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--aire-text)",
              textDecoration: "none",
            }}
          >
            {draft.name}
          </Link>
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "4px",
              fontSize: "11px",
              color: "var(--aire-muted)",
              flexWrap: "wrap",
            }}
          >
            {draft.phone && <span>{draft.phone}</span>}
            {draft.email && <span>{draft.email}</span>}
          </div>
        </div>

        {/* Channel toggle — pill row, active = ink */}
        <div style={{ display: "flex", gap: "5px" }}>
          {channelOpts.map((opt) => {
            const active = channel === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => !opt.disabled && onChannel(opt.key)}
                disabled={opt.disabled}
                className={active ? "pill-ink" : "pill"}
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  padding: "6px 13px",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                  opacity: opt.disabled ? 0.35 : 1,
                  fontWeight: active ? 700 : 500,
                  border: active ? "1px solid transparent" : undefined,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SMS section */}
      {(channel === "sms" || channel === "both") && (
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.16em",
                color: "var(--aire-text-2)",
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              SMS BODY
              {smsState === "ok" && (
                <span
                  style={{
                    color: MINT_DEEP,
                    marginLeft: "10px",
                    background: "var(--aire-mint-soft)",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontWeight: 600,
                  }}
                >
                  ✓ SENT
                </span>
              )}
              {smsState === "err" && (
                <span
                  style={{
                    color: "var(--aire-coral-deep)",
                    marginLeft: "10px",
                    background: "var(--aire-coral-soft)",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontWeight: 600,
                  }}
                >
                  ✗ {result?.sms.error}
                </span>
              )}
            </p>
            <p
              style={{
                fontSize: "10px",
                color: smsCount > 160 ? "var(--aire-coral-deep)" : "var(--aire-muted)",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 500,
              }}
            >
              {smsCount} / 160
            </p>
          </div>
          <textarea
            value={draft.smsBody}
            onChange={(e) => onPatch({ smsBody: e.target.value })}
            rows={3}
            className="aire-input"
            style={{
              width: "100%",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>
      )}

      {/* Email section */}
      {(channel === "email" || channel === "both") && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.16em",
                color: "var(--aire-text-2)",
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              EMAIL
              {emailState === "ok" && (
                <span
                  style={{
                    color: MINT_DEEP,
                    marginLeft: "10px",
                    background: "var(--aire-mint-soft)",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontWeight: 600,
                  }}
                >
                  ✓ SENT
                </span>
              )}
              {emailState === "err" && (
                <span
                  style={{
                    color: "var(--aire-coral-deep)",
                    marginLeft: "10px",
                    background: "var(--aire-coral-soft)",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontWeight: 600,
                  }}
                >
                  ✗ {result?.email.error}
                </span>
              )}
            </p>
          </div>
          <input
            type="text"
            value={draft.emailSubject}
            onChange={(e) => onPatch({ emailSubject: e.target.value })}
            placeholder="Subject"
            className="aire-input"
            style={{
              width: "100%",
              marginBottom: "6px",
            }}
          />
          <textarea
            value={draft.emailBody}
            onChange={(e) => onPatch({ emailBody: e.target.value })}
            rows={5}
            className="aire-input"
            style={{
              width: "100%",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>
      )}
    </div>
  );
}
