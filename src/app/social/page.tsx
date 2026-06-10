"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ScheduledPost {
  id: string;
  platform: string;
  caption: string;
  imageUrl: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  status: string;
  createdAt: string;
}

interface ConnectionStatus {
  facebook: { connected: boolean; pageId: string | null };
  instagram: { connected: boolean; igId: string | null };
}

const STATUS_PILL: Record<string, string> = {
  published: "pill-mint",
  scheduled: "pill-cream",
  draft: "pill",
  failed: "pill-coral",
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  both: "FB + IG",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SocialPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Compose form
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [platform, setPlatform] = useState<"facebook" | "instagram" | "both">("both");
  const [publishNow, setPublishNow] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/social").then(r => r.json()),
      fetch("/api/social?action=status").then(r => r.json()),
    ]).then(([postsData, statusData]) => {
      setPosts(postsData);
      setStatus(statusData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handlePublish() {
    setPublishing(true);
    setPublishResult(null);

    if (publishNow) {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", caption, imageUrl, platform }),
      });
      const data = await res.json();
      if (data.ok) {
        setPublishResult("Published successfully.");
        setCaption(""); setImageUrl("");
        const fresh = await fetch("/api/social").then(r => r.json());
        setPosts(fresh);
      } else {
        setPublishResult(`Error: ${data.error}`);
      }
    } else {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, imageUrl, platform, scheduledFor: scheduledFor || null }),
      });
      const post = await res.json();
      setPosts(prev => [post, ...prev]);
      setPublishResult("Saved to drafts.");
      setCaption(""); setImageUrl("");
    }
    setPublishing(false);
  }

  return (
    <div style={{ padding: "32px 40px 60px", maxWidth: "1360px", margin: "0 auto" }}>

      {/* Hero header */}
      <div style={{ marginBottom: "28px", position: "relative", overflow: "hidden", borderRadius: "24px", padding: "28px 34px", background: "linear-gradient(135deg, #065F46 0%, #0A7C5C 100%)", boxShadow: "0 20px 60px rgba(6,95,70,0.25)" }}>
        <div style={{ position: "absolute", top: -30, right: -10, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <p style={{ fontSize: "10px", letterSpacing: "0.22em", color: "rgba(255,255,255,0.55)", marginBottom: "10px", fontWeight: 600 }}>SOCIAL</p>
        <h1 className="font-display" style={{ fontSize: "38px", color: "#fff", lineHeight: 1.05, marginBottom: "8px" }}>
          Post to your audience
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)" }}>Facebook · Instagram · LinkedIn</p>
      </div>

      {/* Connection chips */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" }}>
        {[
          { key: "facebook", label: "Facebook", con: status?.facebook.connected, sub: status?.facebook.pageId ? `Page ${status.facebook.pageId}` : "Not connected" },
          { key: "instagram", label: "Instagram", con: status?.instagram.connected, sub: status?.instagram.igId ? `@${status.instagram.igId}` : "Not connected" },
        ].map(({ key, label, con, sub }) => (
          <span key={key} style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "6px 14px", borderRadius: "999px",
            fontSize: "11px", letterSpacing: "0.04em",
            border: con ? "1px solid rgba(6,95,70,0.20)" : "1px solid rgba(245,158,11,0.25)",
            background: con ? "rgba(6,95,70,0.07)" : "rgba(245,158,11,0.08)",
            color: con ? "var(--aire-green)" : "#92400E",
          }}>
            <span style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: con ? "#2d7a55" : "var(--aire-coral-deep)",
              animation: con ? "pulse-dot 2s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontWeight: 600 }}>{label}</span>
            <span style={{ opacity: 0.75 }}>· {sub}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gap: "20px", alignItems: "start" }}>

        {/* Post history */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <span style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-muted)", fontWeight: 500 }}>
              POST HISTORY · {posts.length} TOTAL
            </span>
            <Link href="/create-post" style={{ fontSize: "11px", letterSpacing: "0.10em", color: "var(--aire-coral-deep)", textDecoration: "none", fontWeight: 600 }}>
              + CREATE WITH AI →
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: "82px" }} />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="card-warm" style={{ padding: "48px", textAlign: "center" }}>
              <p style={{ fontFamily: "'Recoleta', 'Fraunces', Georgia, serif", fontSize: "28px", color: "var(--aire-faint)", fontStyle: "italic" }}>◎</p>
              <p style={{ fontSize: "13px", color: "var(--aire-text-2)", marginTop: "14px", fontStyle: "italic" }}>
                No posts yet. Quiet feed, focused work.
              </p>
              <Link href="/create-post" className="btn-coral" style={{ display: "inline-block", marginTop: "20px", textDecoration: "none" }}>
                GENERATE POST WITH AI →
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {posts.map((post, i) => (
                <div
                  key={post.id}
                  className="card-light interactive-row"
                  style={{
                    padding: "18px 22px",
                    animation: `fade-up 300ms var(--ease-out-expo) ${i * 30}ms both`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <span className={STATUS_PILL[post.status] ?? "pill"} style={{
                        display: "inline-flex", alignItems: "center",
                        fontSize: "10px", letterSpacing: "0.10em", fontWeight: 600,
                        padding: "3px 10px", borderRadius: "999px",
                      }}>
                        {post.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--aire-text-2)", letterSpacing: "0.04em" }}>
                        {PLATFORM_ICONS[post.platform] ?? post.platform}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>
                      {post.publishedAt ? timeAgo(post.publishedAt) : post.scheduledFor ? `Scheduled ${new Date(post.scheduledFor).toLocaleDateString("en-US",{month:"short",day:"numeric"})}` : timeAgo(post.createdAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--aire-text)", lineHeight: "1.6", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {post.caption}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compose panel — ink card (signature dark surface for creative tooling) */}
        <div className="card-ink" style={{ padding: "26px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.22em", color: "var(--aire-muted-inv)", marginBottom: "20px", fontWeight: 500 }}>COMPOSE POST</p>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted-inv)", display: "block", marginBottom: "8px", fontWeight: 500 }}>PLATFORM</label>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["facebook", "instagram", "both"] as const).map(p => {
                const active = platform === p;
                return (
                  <button key={p} onClick={() => setPlatform(p)} style={{
                    flex: 1, fontSize: "10px", letterSpacing: "0.10em", padding: "8px 4px",
                    background: active ? "var(--aire-coral)" : "rgba(250,246,238,0.06)",
                    border: `1px solid ${active ? "var(--aire-coral)" : "var(--aire-border-ink)"}`,
                    color: active ? "var(--aire-ink)" : "var(--aire-muted-inv)",
                    borderRadius: "999px", cursor: "pointer",
                    fontWeight: active ? 700 : 500,
                    transition: "all 200ms",
                  }}>
                    {p === "both" ? "BOTH" : p.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted-inv)", display: "block", marginBottom: "8px", fontWeight: 500 }}>CAPTION</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={7}
              style={{
                width: "100%", padding: "12px 14px", fontSize: "13px",
                resize: "vertical", lineHeight: "1.6",
                background: "rgba(250,246,238,0.06)",
                border: "1px solid var(--aire-border-ink)",
                borderRadius: "10px",
                color: "var(--aire-text-inv)",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 200ms",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--aire-coral)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--aire-border-ink)"; }}
              placeholder="Paste your caption here or generate with AI..."
            />
            <Link href="/create-post" style={{ fontSize: "10px", color: "var(--aire-coral)", textDecoration: "none", display: "block", marginTop: "6px", letterSpacing: "0.04em" }}>
              Generate with AI →
            </Link>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted-inv)", display: "block", marginBottom: "8px", fontWeight: 500 }}>IMAGE URL (optional)</label>
            <input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", fontSize: "12px",
                background: "rgba(250,246,238,0.06)",
                border: "1px solid var(--aire-border-ink)",
                borderRadius: "10px",
                color: "var(--aire-text-inv)",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 200ms",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--aire-coral)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--aire-border-ink)"; }}
              placeholder="https://..."
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <button
              onClick={() => setPublishNow(p => !p)}
              style={{
                width: "34px", height: "20px", borderRadius: "999px",
                background: publishNow ? "var(--aire-coral)" : "rgba(250,246,238,0.14)",
                border: "none", cursor: "pointer", position: "relative",
                transition: "background 200ms",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: "2px",
                left: publishNow ? "16px" : "2px",
                width: "16px", height: "16px", borderRadius: "50%",
                background: "var(--aire-text-inv)",
                transition: "left 200ms var(--ease-spring)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }} />
            </button>
            <span style={{ fontSize: "12px", color: "var(--aire-text-inv)" }}>
              {publishNow ? "Publish immediately" : "Save as draft"}
            </span>
          </div>

          {!publishNow && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-muted-inv)", display: "block", marginBottom: "8px", fontWeight: 500 }}>SCHEDULE FOR (optional)</label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={e => setScheduledFor(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", fontSize: "12px",
                  background: "rgba(250,246,238,0.06)",
                  border: "1px solid var(--aire-border-ink)",
                  borderRadius: "10px",
                  color: "var(--aire-text-inv)",
                  outline: "none",
                  fontFamily: "inherit",
                  colorScheme: "light",
                }}
              />
            </div>
          )}

          {publishResult && (
            <div style={{
              padding: "10px 14px", borderRadius: "10px", marginBottom: "14px",
              background: publishResult.includes("Error")
                ? "rgba(238,129,114,0.14)"
                : "rgba(184,230,208,0.14)",
              border: `1px solid ${publishResult.includes("Error") ? "rgba(238,129,114,0.3)" : "rgba(184,230,208,0.3)"}`,
            }}>
              <p style={{ fontSize: "12px", color: publishResult.includes("Error") ? "var(--aire-coral)" : "var(--aire-mint)" }}>
                {publishResult}
              </p>
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={!caption.trim() || publishing}
            style={{
              width: "100%", padding: "12px 18px",
              borderRadius: "999px",
              fontSize: "11px", letterSpacing: "0.14em", fontWeight: 700,
              background: !caption.trim() || publishing
                ? "rgba(250,246,238,0.10)"
                : "var(--aire-coral)",
              color: !caption.trim() || publishing
                ? "var(--aire-muted-inv)"
                : "var(--aire-ink)",
              border: "none",
              cursor: !caption.trim() || publishing ? "default" : "pointer",
              transition: "background 200ms, transform 150ms var(--ease-spring), box-shadow 200ms",
            }}
            onMouseEnter={e => {
              if (caption.trim() && !publishing) {
                e.currentTarget.style.background = "var(--aire-coral-deep)";
                e.currentTarget.style.boxShadow = "var(--shadow-glow-coral)";
              }
            }}
            onMouseLeave={e => {
              if (caption.trim() && !publishing) {
                e.currentTarget.style.background = "var(--aire-coral)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          >
            {publishing ? "PUBLISHING..." : publishNow ? "PUBLISH NOW →" : "SAVE POST"}
          </button>
        </div>
      </div>
    </div>
  );
}
