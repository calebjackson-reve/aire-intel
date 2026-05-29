"use client";

import { useState } from "react";

/**
 * Social handles + one-tap deep links for a contact.
 *
 * Each handle gets two actions:
 *   1. Open profile (web/app)
 *   2. Open DM (Messenger / IG)
 *
 * For unset platforms, an inline "Suggest" button hits the AI guesser.
 * Caleb picks the right handle from the suggestions and we save it.
 */

interface Lead {
  id: string;
  instagramHandle?: string | null;
  facebookUrl?: string | null;
  facebookName?: string | null;
  linkedinUrl?: string | null;
  tiktokHandle?: string | null;
  twitterHandle?: string | null;
}

interface Suggestion {
  suggestions: string[];
  lookupUrls: string[];
}

export default function SocialPanel({ lead, onUpdate }: { lead: Lead; onUpdate: (patch: Partial<Lead>) => void }) {
  const [editing, setEditing] = useState(false);
  const [ig, setIg] = useState(lead.instagramHandle ?? "");
  const [fb, setFb] = useState(lead.facebookUrl ?? "");
  const [li, setLi] = useState(lead.linkedinUrl ?? "");
  const [tt, setTt] = useState(lead.tiktokHandle ?? "");
  const [tw, setTw] = useState(lead.twitterHandle ?? "");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion | null>(null);
  const [saving, setSaving] = useState(false);

  function clean(s: string) {
    return s.trim().replace(/^@/, "");
  }

  function igProfileUrl(handle: string) {
    return `https://www.instagram.com/${clean(handle)}/`;
  }
  function igDmUrl(handle: string) {
    return `https://ig.me/m/${clean(handle)}`;
  }
  function fbProfileUrl(url: string) {
    if (url.startsWith("http")) return url;
    if (url.includes("facebook.com")) return `https://${url.replace(/^https?:\/\//, "")}`;
    return `https://www.facebook.com/${clean(url)}`;
  }
  function fbDmUrl(url: string) {
    // m.me works for usernames; for numeric URLs we fall back to Messenger search
    const handle = url.replace(/^https?:\/\/(www\.)?facebook\.com\//, "").replace(/\/$/, "");
    if (/^\d+$/.test(handle) || handle.includes("profile.php")) {
      return url; // can't deep-link to numeric, just open profile
    }
    return `https://m.me/${handle}`;
  }

  async function fetchSuggestions() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/contacts/social/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      setSuggestions(data);
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const patch = {
        instagramHandle: clean(ig) || null,
        facebookUrl: fb.trim() || null,
        linkedinUrl: li.trim() || null,
        tiktokHandle: clean(tt) || null,
        twitterHandle: clean(tw) || null,
      };
      await fetch("/api/contacts/social/match", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, ...patch }),
      });
      onUpdate(patch);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const hasAny = !!(lead.instagramHandle || lead.facebookUrl || lead.linkedinUrl || lead.tiktokHandle || lead.twitterHandle);

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
        <p style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-text-2)", textTransform: "uppercase", fontWeight: 500 }}>
          SOCIAL
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          className="btn-ghost"
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            padding: "4px 10px",
            borderRadius: "999px",
          }}
        >
          {editing ? "CANCEL" : "EDIT"}
        </button>
      </div>

      {!editing && (
        <>
          {!hasAny && (
            <div style={{ padding: "8px 0" }}>
              <p style={{ fontSize: "12px", color: "var(--aire-text-2)", fontStyle: "italic", marginBottom: "12px" }}>
                No social handles linked yet.
              </p>
              <button
                onClick={fetchSuggestions}
                disabled={suggesting}
                className="btn-coral"
                style={{
                  padding: "8px 14px",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  borderRadius: "999px",
                }}
              >
                {suggesting ? "..." : "✦ SUGGEST IG HANDLES"}
              </button>

              {suggestions && (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ fontSize: "10px", color: "var(--aire-text-2)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    AI GUESSES — VERIFY EACH ONE
                  </p>
                  {suggestions.suggestions.map((h, i) => (
                    <div
                      key={h}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "var(--aire-card-warm)",
                        border: "1px solid var(--aire-border)",
                        borderRadius: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--aire-text)",
                          flex: 1,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        @{h}
                      </span>
                      <a
                        href={suggestions.lookupUrls[i]}
                        target="_blank"
                        rel="noopener"
                        style={{
                          fontSize: "10px",
                          color: "var(--aire-text-2)",
                          textDecoration: "none",
                          padding: "4px 9px",
                          border: "1px solid var(--aire-border)",
                          borderRadius: "999px",
                          letterSpacing: "0.06em",
                        }}
                      >
                        CHECK ↗
                      </a>
                      <button
                        onClick={() => {
                          setIg(h);
                          setEditing(true);
                        }}
                        className="pill-coral"
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "4px 10px",
                          letterSpacing: "0.06em",
                          border: "1px solid rgba(238,129,114,0.25)",
                          cursor: "pointer",
                          borderRadius: "999px",
                        }}
                      >
                        USE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasAny && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lead.instagramHandle && (
                <Handle
                  label="Instagram"
                  value={`@${lead.instagramHandle}`}
                  primary={{ label: "Profile", url: igProfileUrl(lead.instagramHandle) }}
                  secondary={{ label: "DM", url: igDmUrl(lead.instagramHandle) }}
                />
              )}
              {lead.facebookUrl && (
                <Handle
                  label="Facebook"
                  value={lead.facebookName ?? lead.facebookUrl}
                  primary={{ label: "Profile", url: fbProfileUrl(lead.facebookUrl) }}
                  secondary={{ label: "Message", url: fbDmUrl(lead.facebookUrl) }}
                />
              )}
              {lead.linkedinUrl && (
                <Handle
                  label="LinkedIn"
                  value="View"
                  primary={{ label: "Profile", url: lead.linkedinUrl.startsWith("http") ? lead.linkedinUrl : `https://${lead.linkedinUrl}` }}
                />
              )}
              {lead.tiktokHandle && (
                <Handle
                  label="TikTok"
                  value={`@${lead.tiktokHandle}`}
                  primary={{ label: "Profile", url: `https://www.tiktok.com/@${clean(lead.tiktokHandle)}` }}
                />
              )}
              {lead.twitterHandle && (
                <Handle
                  label="X / Twitter"
                  value={`@${lead.twitterHandle}`}
                  primary={{ label: "Profile", url: `https://x.com/${clean(lead.twitterHandle)}` }}
                  secondary={{ label: "DM", url: `https://x.com/messages/compose?recipient_id=${clean(lead.twitterHandle)}` }}
                />
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Field label="Instagram" placeholder="sarah.johnson_la (no @)" value={ig} onChange={setIg} />
          <Field label="Facebook URL or handle" placeholder="facebook.com/sarah.j or sarah.j" value={fb} onChange={setFb} />
          <Field label="LinkedIn URL" placeholder="linkedin.com/in/sarahjohnson" value={li} onChange={setLi} />
          <Field label="TikTok" placeholder="sarahjohnson (no @)" value={tt} onChange={setTt} />
          <Field label="X / Twitter" placeholder="sarahjohnson (no @)" value={tw} onChange={setTw} />
          <button
            onClick={save}
            disabled={saving}
            className="btn-coral"
            style={{
              marginTop: "6px",
              padding: "10px 14px",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              borderRadius: "999px",
            }}
          >
            {saving ? "SAVING..." : "SAVE SOCIAL"}
          </button>
        </div>
      )}
    </div>
  );
}

function Handle({
  label,
  value,
  primary,
  secondary,
}: {
  label: string;
  value: string;
  primary: { label: string; url: string };
  secondary?: { label: string; url: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        background: "var(--aire-card-warm)",
        border: "1px solid var(--aire-border)",
        borderRadius: "12px",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontSize: "9px",
            letterSpacing: "0.16em",
            color: "var(--aire-muted)",
            marginBottom: "2px",
            textTransform: "uppercase",
          }}
        >
          {label.toUpperCase()}
        </p>
        <p style={{ fontSize: "12px", color: "var(--aire-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </p>
      </div>
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        <GhostPillLink href={primary.url} label={primary.label} />
        {secondary && <GhostPillLink href={secondary.url} label={secondary.label} />}
      </div>
    </div>
  );
}

function GhostPillLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--aire-coral-deep)";
        e.currentTarget.style.borderColor = "rgba(238,129,114,0.35)";
        e.currentTarget.style.background = "var(--aire-coral-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--aire-text-2)";
        e.currentTarget.style.borderColor = "var(--aire-border)";
        e.currentTarget.style.background = "var(--aire-card)";
      }}
      style={{
        fontSize: "10px",
        color: "var(--aire-text-2)",
        background: "var(--aire-card)",
        textDecoration: "none",
        padding: "5px 11px",
        border: "1px solid var(--aire-border)",
        borderRadius: "999px",
        letterSpacing: "0.06em",
        fontWeight: 500,
        transition: "color 150ms, border-color 150ms, background 150ms",
      }}
    >
      {label.toUpperCase()}
    </a>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p
        style={{
          fontSize: "9px",
          letterSpacing: "0.16em",
          color: "var(--aire-muted)",
          marginBottom: "4px",
          textTransform: "uppercase",
        }}
      >
        {label.toUpperCase()}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="aire-input"
        style={{ width: "100%", boxSizing: "border-box", fontSize: "12px" }}
      />
    </div>
  );
}
