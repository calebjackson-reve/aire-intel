"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface LineRationale { line: string; why: string }
interface Rationale {
  captionRationale?: {
    strategy?: string;
    lineByLine?: LineRationale[];
    complianceCheck?: { fairHousing?: string; louisianaRE?: string; flagged?: string };
  };
  photoRationale?: {
    selected?: string;
    why?: string;
    alternatives?: { file: string; tradeoff: string }[];
    engagementNote?: string;
  };
}

interface Draft {
  id: string;
  platform: string;
  caption: string;
  imageUrl: string | null;
  scheduledFor: string | null;
  status: string;
  createdAt: string;
  qualityScore: number | null;
  feedbackNote: string | null;
}

const PC: Record<string, string> = { facebook: "#1877F2", instagram: "#E1306C", both: "#EE8172" };

function Badge({ p }: { p: string }) {
  const c = PC[p] ?? "#888";
  return <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}44`, textTransform: "uppercase" as const }}>{p}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--aire-border)", paddingTop: 14 }}>
      <p style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: 10, textTransform: "uppercase" as const, fontWeight: 600 }}>{title}</p>
      {children}
    </div>
  );
}

function PreviewModal({ draft, onClose, onApprove, onReject, onSaveCaption }: {
  draft: Draft;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSaveCaption: (caption: string) => void;
}) {
  const [tab, setTab] = useState<"preview" | "rationale">("preview");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(draft.caption);
  const [aiFeedback, setAiFeedback] = useState("");
  const [aiCaption, setAiCaption] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);

  const rationale: Rationale = (() => {
    try { return draft.feedbackNote ? JSON.parse(draft.feedbackNote) : {}; } catch { return {}; }
  })();

  async function regenerate() {
    if (!aiFeedback.trim() || aiStreaming) return;
    setAiStreaming(true);
    setAiCaption("");
    try {
      const res = await fetch("/api/social/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCaption: editText || draft.caption,
          feedback: aiFeedback,
          imageContext: rationale.photoRationale?.selected ?? "twilight front exterior",
          platform: draft.platform,
        }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setAiCaption(full);
        setTimeout(() => aiRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
      }
    } catch (e) {
      setAiCaption("Error — try again.");
    }
    setAiStreaming(false);
  }

  function useAiCaption() {
    setEditText(aiCaption);
    setAiCaption("");
    setAiFeedback("");
    setEditing(true);
  }

  const captionToShow = editing ? editText : draft.caption;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(9,9,11,0.88)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ width: "min(980px, 96vw)", maxHeight: "92vh", display: "flex", gap: 20, alignItems: "flex-start", overflowY: "auto" }}>

        {/* LEFT — FB Post Mockup */}
        <div style={{ flex: "0 0 380px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const }}>
            Preview · {draft.platform}
          </p>
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
            <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#EE8172,#728AC5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>CJ</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#050505" }}>Caleb Jackson- Realtor</p>
                <p style={{ margin: 0, fontSize: 11, color: "#65676b" }}>{draft.scheduledFor ? new Date(draft.scheduledFor).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Draft"} · 🌐</p>
              </div>
            </div>
            <div style={{ padding: "0 16px 12px" }}>
              <p style={{ margin: 0, fontSize: 14, color: "#050505", lineHeight: 1.65, whiteSpace: "pre-line" }}>{captionToShow}</p>
            </div>
            {draft.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.imageUrl} alt="post" style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }} />
            )}
            <div style={{ padding: "6px 16px", display: "flex", borderTop: "1px solid #f0f2f5" }}>
              {["👍 Like", "💬 Comment", "↗ Share"].map(l => (
                <button key={l} style={{ flex: 1, background: "none", border: "none", padding: "6px 2px", color: "#65676b", fontSize: 13, fontWeight: 600, cursor: "default" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Controls */}
        <div style={{ flex: 1, minWidth: 0, background: "var(--aire-card)", borderRadius: 16, border: "1px solid var(--aire-border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--aire-border)" }}>
            {(["preview", "rationale"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
                fontSize: 10, letterSpacing: "0.1em", fontWeight: tab === t ? 700 : 400,
                color: tab === t ? "var(--aire-coral)" : "var(--aire-muted)",
                borderBottom: tab === t ? "2px solid var(--aire-coral)" : "2px solid transparent",
                textTransform: "uppercase" as const, fontFamily: "inherit",
              }}>{t === "preview" ? "Edit & Approve" : "Why This Post"}</button>
            ))}
            <button onClick={onClose} style={{ padding: "12px 16px", background: "none", border: "none", color: "var(--aire-muted)", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>

          <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            {tab === "preview" ? (
              <>
                {/* Caption editor */}
                <Section title="Caption">
                  {editing ? (
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={8}
                      autoFocus
                      style={{ width: "100%", padding: "12px", fontSize: 12, lineHeight: 1.7, background: "rgba(250,246,238,0.04)", border: "1px solid var(--aire-coral)", borderRadius: 10, color: "var(--aire-text)", outline: "none", resize: "vertical", fontFamily: "inherit", whiteSpace: "pre-line" as const }}
                    />
                  ) : (
                    <p style={{ fontSize: 12, color: "var(--aire-text-2)", lineHeight: 1.7, whiteSpace: "pre-line" as const, margin: 0, background: "rgba(250,246,238,0.03)", padding: "12px", borderRadius: 10, border: "1px solid var(--aire-border)" }}>
                      {draft.caption}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {editing ? (
                      <>
                        <button onClick={() => { onSaveCaption(editText); setEditing(false); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, background: "var(--aire-coral)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>SAVE</button>
                        <button onClick={() => { setEditing(false); setEditText(draft.caption); }} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 10, background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-muted)", cursor: "pointer", fontFamily: "inherit" }}>CANCEL</button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(true)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 10, letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-text-2)", cursor: "pointer", fontFamily: "inherit" }}>EDIT CAPTION</button>
                    )}
                  </div>
                </Section>

                {/* AI Regenerate */}
                <Section title="Regenerate with AI">
                  <p style={{ fontSize: 11, color: "var(--aire-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                    Tell Claude what to change — it knows the full Blueprint, the listing facts, and Fair Housing rules.
                  </p>
                  <textarea
                    value={aiFeedback}
                    onChange={e => setAiFeedback(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) regenerate(); }}
                    rows={3}
                    placeholder={'e.g. "mention the barn beams" · "make it more urgent" · "shorter, 2 lines only" · "more poetic tone"'}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 11, lineHeight: 1.6, background: "rgba(250,246,238,0.04)", border: "1px solid var(--aire-border)", borderRadius: 10, color: "var(--aire-text)", outline: "none", resize: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={regenerate}
                    disabled={aiStreaming || !aiFeedback.trim()}
                    style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 10, fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, background: aiStreaming ? "var(--aire-border)" : "rgba(238,129,114,0.15)", border: "1px solid rgba(238,129,114,0.4)", color: aiStreaming ? "var(--aire-muted)" : "var(--aire-coral)", cursor: aiStreaming ? "default" : "pointer", fontFamily: "inherit", transition: "all 150ms" }}
                  >
                    {aiStreaming ? "GENERATING…" : "⟳ REGENERATE  ⌘↵"}
                  </button>

                  {aiCaption && (
                    <div style={{ marginTop: 12, padding: "14px", borderRadius: 10, background: "rgba(114,138,197,0.08)", border: "1px solid rgba(114,138,197,0.25)" }}>
                      <p style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--blue)", marginBottom: 8, textTransform: "uppercase" as const, fontWeight: 600 }}>New Version</p>
                      <p style={{ fontSize: 12, color: "var(--aire-text)", lineHeight: 1.7, whiteSpace: "pre-line" as const, margin: 0 }} ref={aiRef}>{aiCaption}</p>
                      {!aiStreaming && (
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          <button onClick={useAiCaption} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, background: "var(--blue)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                            USE THIS VERSION
                          </button>
                          <button onClick={() => setAiCaption("")} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 10, background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-muted)", cursor: "pointer", fontFamily: "inherit" }}>
                            DISCARD
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Section>

                {/* Approve / Reject */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--aire-border)", paddingTop: 16 }}>
                  <button onClick={onApprove} style={{ width: "100%", padding: "14px", borderRadius: 10, fontSize: 12, letterSpacing: "0.1em", fontWeight: 700, background: "var(--aire-coral)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    APPROVE &amp; PUBLISH →
                  </button>
                  <button onClick={onReject} style={{ width: "100%", padding: "10px", borderRadius: 10, fontSize: 10, letterSpacing: "0.08em", background: "transparent", border: "1px solid rgba(238,129,114,0.25)", color: "var(--aire-coral)", cursor: "pointer", fontFamily: "inherit" }}>
                    ✕ REJECT
                  </button>
                </div>
              </>
            ) : (
              /* RATIONALE TAB */
              <>
                {rationale.captionRationale && (
                  <>
                    <Section title="Campaign Strategy">
                      <p style={{ fontSize: 12, color: "var(--aire-text-2)", lineHeight: 1.65 }}>{rationale.captionRationale.strategy}</p>
                    </Section>

                    {rationale.captionRationale.lineByLine && (
                      <Section title="Line-by-line breakdown">
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {rationale.captionRationale.lineByLine.map((item, i) => (
                            <div key={i} style={{ padding: "12px", borderRadius: 10, background: "rgba(250,246,238,0.03)", border: "1px solid var(--aire-border)" }}>
                              <p style={{ fontSize: 12, color: "var(--aire-text)", fontStyle: "italic", margin: "0 0 6px", letterSpacing: "0.02em" }}>&ldquo;{item.line}&rdquo;</p>
                              <p style={{ fontSize: 11, color: "var(--aire-muted)", lineHeight: 1.6, margin: 0 }}>{item.why}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {rationale.captionRationale.complianceCheck && (
                      <Section title="Compliance check">
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {Object.entries(rationale.captionRationale.complianceCheck).map(([k, v]) => (
                            <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: v?.toString().startsWith("CLEAR") ? "rgba(100,200,120,0.15)" : "rgba(238,129,114,0.15)", color: v?.toString().startsWith("CLEAR") ? "#64c878" : "var(--aire-coral)", fontWeight: 700, flexShrink: 0, letterSpacing: "0.04em" }}>
                                {k === "fairHousing" ? "FAIR HOUSING" : k === "louisianaRE" ? "LA RE LAW" : "FLAGGED"}
                              </span>
                              <p style={{ fontSize: 11, color: "var(--aire-text-2)", lineHeight: 1.5, margin: 0 }}>{v as string}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </>
                )}

                {rationale.photoRationale && (
                  <>
                    <Section title="Photo selection">
                      <p style={{ fontSize: 11, color: "var(--aire-muted)", marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.02em" }}>{rationale.photoRationale.selected}</p>
                      <p style={{ fontSize: 12, color: "var(--aire-text-2)", lineHeight: 1.65, margin: "0 0 10px" }}>{rationale.photoRationale.why}</p>
                      {rationale.photoRationale.engagementNote && (
                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(238,129,114,0.07)", border: "1px solid rgba(238,129,114,0.2)" }}>
                          <p style={{ fontSize: 11, color: "var(--aire-coral)", lineHeight: 1.5, margin: 0 }}>📈 {rationale.photoRationale.engagementNote}</p>
                        </div>
                      )}
                    </Section>

                    {rationale.photoRationale.alternatives && (
                      <Section title="Alternatives considered">
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {rationale.photoRationale.alternatives.map((alt, i) => (
                            <div key={i} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--aire-border)" }}>
                              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--aire-muted)", margin: "0 0 4px" }}>{alt.file}</p>
                              <p style={{ fontSize: 11, color: "var(--aire-text-2)", lineHeight: 1.5, margin: 0 }}>{alt.tradeoff}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </>
                )}

                {!rationale.captionRationale && !rationale.photoRationale && (
                  <p style={{ fontSize: 12, color: "var(--aire-muted)", textAlign: "center", padding: "40px 0" }}>No rationale stored for this draft.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SocialDraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pushingAll, setPushingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/social/drafts");
    const data = await res.json() as Draft[];
    setDrafts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  async function act(id: string, action: "approve" | "reject" | "edit", caption?: string) {
    setBusy(id);
    const res = await fetch("/api/social/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, caption }),
    });
    const data = await res.json() as { ok?: boolean; fbPostId?: string; note?: string; error?: string };
    setBusy(null);
    if (data.ok) {
      if (action === "approve") showToast(data.note ?? (data.fbPostId ? `Scheduled ✓ — ${data.fbPostId}` : "Approved ✓"));
      if (action === "reject") { showToast("Removed"); setDrafts(p => p.filter(d => d.id !== id)); setPreviewDraft(null); return; }
      if (action === "edit") showToast("Caption saved ✓");
      setDrafts(p => p.map(d => d.id === id ? { ...d, caption: caption ?? d.caption, status: action === "approve" ? "scheduled" : d.status } : d));
      if (previewDraft?.id === id) setPreviewDraft(p => p ? { ...p, caption: caption ?? p.caption } : null);
      if (action === "approve") setPreviewDraft(null);
    } else {
      showToast(`Error: ${data.error ?? "unknown"}`);
    }
  }

  const pending = drafts.filter(d => d.status === "draft");

  async function pushAllToFacebook() {
    if (pushingAll || pending.length === 0) return;
    setPushingAll(true);
    showToast(`Pushing ${pending.length} posts to Facebook…`);
    for (const d of pending) {
      setBusy(d.id);
      await fetch("/api/social/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, action: "approve" }),
      });
    }
    setBusy(null);
    setPushingAll(false);
    showToast(`All ${pending.length} posts saved to Facebook drafts ✓`);
    await load();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--aire-bg)", padding: "32px 32px 80px", paddingLeft: "112px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap" as const, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--aire-text)", marginBottom: 4 }}>Social Drafts</h1>
          <p style={{ fontSize: 12, color: "var(--aire-muted)" }}>{pending.length} pending · click any card to preview, edit, or approve</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          <a
            href="https://www.facebook.com/107195095165191/publishing_tools/?content_type=DRAFT"
            target="_blank"
            rel="noreferrer"
            style={{ padding: "8px 16px", borderRadius: 10, fontSize: 11, letterSpacing: "0.06em", background: "rgba(24,119,242,0.1)", border: "1px solid rgba(24,119,242,0.25)", color: "#1877F2", textDecoration: "none", fontWeight: 600 }}
          >
            VIEW ON FACEBOOK ↗
          </a>
          <button
            onClick={pushAllToFacebook}
            disabled={pushingAll || pending.length === 0}
            style={{ padding: "8px 18px", borderRadius: 10, fontSize: 11, letterSpacing: "0.06em", background: pushingAll ? "var(--aire-border)" : "var(--aire-coral)", border: "none", color: pushingAll ? "var(--aire-muted)" : "#fff", cursor: pending.length === 0 ? "default" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: pending.length === 0 ? 0.4 : 1 }}
          >
            {pushingAll ? "PUSHING…" : `PUSH ALL TO FACEBOOK (${pending.length})`}
          </button>
          <Link href="/social" style={{ padding: "8px 14px", borderRadius: 10, fontSize: 11, background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-muted)", textDecoration: "none" }}>+ New</Link>
          <button onClick={load} style={{ padding: "8px 14px", borderRadius: 10, fontSize: 11, background: "transparent", border: "1px solid var(--aire-border)", color: "var(--aire-muted)", cursor: "pointer", fontFamily: "inherit" }}>↻</button>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "var(--aire-card)", border: "1px solid var(--aire-border)", borderRadius: 10, padding: "10px 20px", fontSize: 12, color: "var(--aire-coral)", letterSpacing: "0.04em", zIndex: 9998, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />)}
        </div>
      ) : pending.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", background: "var(--aire-card)", borderRadius: 20, border: "1px solid var(--aire-border)" }}>
          <p style={{ fontSize: 14, color: "var(--aire-muted)" }}>No drafts waiting</p>
          <Link href="/social" style={{ display: "inline-block", marginTop: 16, fontSize: 11, color: "var(--aire-coral)", textDecoration: "none" }}>Create a post →</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {pending.map(d => (
            <div key={d.id} onClick={() => setPreviewDraft(d)}
              style={{ background: "var(--aire-card)", borderRadius: 16, border: "1px solid var(--aire-border)", overflow: "hidden", cursor: "pointer", opacity: busy === d.id ? 0.6 : 1, transition: "transform 150ms, border-color 150ms, box-shadow 150ms" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "var(--aire-coral)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(238,129,114,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "var(--aire-border)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              {d.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={d.imageUrl} alt="draft" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                : <div style={{ width: "100%", height: 120, background: "var(--aire-card-warm)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 32 }}>🖼</span></div>
              }
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" as const }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Badge p={d.platform} />
                    {(() => {
                      try {
                        const fn = d.feedbackNote ? JSON.parse(d.feedbackNote) : null;
                        if (fn?.track === "A") return <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(114,138,197,0.15)", color: "var(--blue)", fontWeight: 700, letterSpacing: "0.06em" }}>EVENT PAGE</span>;
                        if (fn?.day) return <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(238,129,114,0.12)", color: "var(--aire-coral)", fontWeight: 700, letterSpacing: "0.06em" }}>PUBLIC</span>;
                      } catch { return null; }
                      return null;
                    })()}
                  </div>
                  {d.scheduledFor && <span style={{ fontSize: 10, color: "var(--aire-muted)" }}>{new Date(d.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                </div>
                <p style={{ fontSize: 12, color: "var(--aire-text-2)", lineHeight: 1.5, margin: 0 }}>{d.caption.slice(0, 90)}{d.caption.length > 90 ? "…" : ""}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, padding: "7px 10px", borderRadius: 8, background: "rgba(238,129,114,0.08)", border: "1px solid rgba(238,129,114,0.2)", fontSize: 9, color: "var(--aire-coral)", letterSpacing: "0.08em", textAlign: "center" as const }}>
                    PREVIEW & APPROVE →
                  </div>
                  {d.feedbackNote && (
                    <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(114,138,197,0.1)", border: "1px solid rgba(114,138,197,0.25)", fontSize: 9, color: "var(--blue)", letterSpacing: "0.06em" }}>
                      WHY ↗
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDraft && (
        <PreviewModal
          draft={previewDraft}
          onClose={() => setPreviewDraft(null)}
          onApprove={() => act(previewDraft.id, "approve")}
          onReject={() => act(previewDraft.id, "reject")}
          onSaveCaption={cap => act(previewDraft.id, "edit", cap)}
        />
      )}
    </div>
  );
}
