"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Facebook Friends Match — upload your FB "Download Your Information" export
 * and link friends to your existing contacts in one pass.
 *
 * No Meta API calls. Everything happens on your data, in your browser, with
 * your explicit confirmation per match.
 */

interface MatchCandidate {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  fbFriend: { name: string; url?: string };
  score: number;
  reason: string;
}

interface MatchResponse {
  totalFriendsParsed: number;
  matchesFound: number;
  alreadyLinked: number;
  unmatchedCount: number;
  matches: MatchCandidate[];
}

export default function SocialMatchPage() {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [dropHover, setDropHover] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const format = file.name.endsWith(".json") ? "json" : "html";
      const res = await fetch("/api/contacts/social/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, format }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function confirmMatch(match: MatchCandidate) {
    setConfirmed((prev) => new Set(prev).add(match.leadId));
    await fetch("/api/contacts/social/match", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: match.leadId,
        facebookUrl: match.fbFriend.url ?? `https://www.facebook.com/search/people/?q=${encodeURIComponent(match.fbFriend.name)}`,
        facebookName: match.fbFriend.name,
      }),
    });
  }

  function rejectMatch(match: MatchCandidate) {
    setRejected((prev) => new Set(prev).add(match.leadId));
  }

  const visible = result?.matches.filter((m) => !rejected.has(m.leadId)) ?? [];

  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "1120px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          SOCIAL · FACEBOOK FRIENDS MATCH
        </p>
        <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05, marginBottom: "12px" }}>
          Cross-reference your FB friends
        </h1>
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "4px", marginBottom: "14px", animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) 200ms both" }} />
        <p style={{ fontSize: "13.5px", color: "var(--aire-text-2)", maxWidth: "680px", lineHeight: 1.65 }}>
          Upload your Facebook friends export and AIRE matches it against your contacts. One tap to link, one tap to skip. Nothing is shared with Meta — this is your data on your machine.
        </p>
      </div>

      {/* How-to */}
      <div className="card-warm" style={{ padding: "22px 24px", marginBottom: "20px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.18em", color: "var(--aire-coral-deep)", fontWeight: 600, marginBottom: "12px" }}>
          GET YOUR FRIENDS LIST IN 2 MINUTES
        </p>
        <ol style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 1.85, paddingLeft: "20px", margin: 0 }}>
          <li>
            Go to{" "}
            <a
              href="https://www.facebook.com/dyi"
              target="_blank"
              rel="noopener"
              style={{ color: "var(--aire-coral-deep)", textDecoration: "underline", textUnderlineOffset: "3px" }}
            >
              facebook.com/dyi
            </a>{" "}
            (Settings → Your Information → Download Your Information)
          </li>
          <li>Select <strong style={{ color: "var(--aire-text)" }}>Friends and followers</strong> only. Format: JSON. Date: All time.</li>
          <li>Hit Request Download. Facebook emails you when it&apos;s ready (usually 5-15 min).</li>
          <li>
            Unzip the export, find{" "}
            <code style={{ background: "var(--aire-card)", padding: "2px 8px", borderRadius: "6px", fontSize: "12px", color: "var(--aire-coral-deep)" }}>
              friends_and_following/friends.json
            </code>
          </li>
          <li>Upload it here ↓</li>
        </ol>
      </div>

      {/* Upload */}
      <div
        onMouseEnter={() => setDropHover(true)}
        onMouseLeave={() => setDropHover(false)}
        style={{
          padding: "44px 32px",
          marginBottom: "20px",
          border: `2px dashed ${dropHover ? "var(--aire-coral)" : "var(--aire-border-2)"}`,
          background: dropHover ? "var(--aire-coral-soft)" : "var(--aire-card-warm)",
          borderRadius: "16px",
          textAlign: "center",
          transition: "all 200ms",
        }}
      >
        <label
          htmlFor="fb-upload"
          className="btn-coral"
          style={{ display: "inline-block", cursor: "pointer", textDecoration: "none" }}
        >
          {uploading ? "PARSING..." : "UPLOAD FRIENDS.JSON OR .HTML"}
        </label>
        <input
          id="fb-upload"
          type="file"
          accept=".json,.html,.htm"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <p style={{ fontSize: "11.5px", color: "var(--aire-muted)", marginTop: "14px" }}>
          File stays on your machine until parsed. AIRE only stores matches you confirm.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "16px 20px",
            marginBottom: "20px",
            background: "var(--aire-coral-soft)",
            border: "1px solid rgba(238,129,114,0.4)",
            borderRadius: "12px",
            color: "var(--aire-coral-deep)",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "22px" }}>
            <Stat label="PARSED" value={result.totalFriendsParsed} />
            <Stat label="NEW MATCHES" value={result.matchesFound} color="var(--aire-coral-deep)" />
            <Stat label="ALREADY LINKED" value={result.alreadyLinked} color="#2d7a55" />
            <Stat label="UNMATCHED" value={result.unmatchedCount} color="var(--aire-muted)" />
          </div>

          {visible.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {visible.map((m) => {
                const isConfirmed = confirmed.has(m.leadId);
                return (
                  <div
                    key={m.leadId + m.fbFriend.name}
                    className="card-light"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "14px",
                      padding: "16px 20px",
                      background: isConfirmed ? "var(--aire-mint-soft)" : "var(--aire-card)",
                      borderColor: isConfirmed ? "rgba(184,230,208,0.6)" : "var(--aire-border)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", color: "var(--aire-text)", fontWeight: 500, marginBottom: "5px" }}>
                        {m.leadName}
                        <span style={{ color: "var(--aire-muted)", margin: "0 10px" }}>↔</span>
                        <span style={{ color: "var(--aire-coral-deep)" }}>{m.fbFriend.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px", fontSize: "11.5px", color: "var(--aire-muted)", flexWrap: "wrap", alignItems: "center" }}>
                        <span>{m.reason}</span>
                        {m.leadEmail && <span>· {m.leadEmail}</span>}
                        {m.fbFriend.url && (
                          <a
                            href={m.fbFriend.url}
                            target="_blank"
                            rel="noopener"
                            style={{ color: "var(--aire-coral-deep)", textDecoration: "none" }}
                          >
                            View FB →
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {isConfirmed ? (
                        <span className="pill pill-mint" style={{ fontSize: "10px", letterSpacing: "0.08em", padding: "6px 12px", fontWeight: 600 }}>
                          LINKED ✓
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => rejectMatch(m)}
                            className="btn-ghost"
                            style={{ fontSize: "10px", padding: "8px 14px" }}
                          >
                            SKIP
                          </button>
                          <button
                            onClick={() => confirmMatch(m)}
                            className="btn-coral"
                            style={{ fontSize: "10px", padding: "8px 14px" }}
                          >
                            LINK ↔
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card-warm" style={{ textAlign: "center", padding: "40px 24px", color: "var(--aire-text-2)", fontSize: "14px" }}>
              {result.matchesFound === 0
                ? "No new matches. Your contacts and FB friends don't overlap on names yet."
                : "All matches handled. Nice."}
            </div>
          )}

          <div style={{ marginTop: "26px", textAlign: "center" }}>
            <Link
              href="/contacts"
              style={{ fontSize: "12px", color: "var(--aire-muted)", textDecoration: "none", letterSpacing: "0.06em" }}
            >
              ← Back to contacts
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card-light" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-muted)", marginBottom: "6px" }}>
        {label}
      </div>
      <div className="metric-number" style={{ fontSize: "24px", fontWeight: 700, color: color ?? "var(--aire-text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}
