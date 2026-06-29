"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Loader2, Film, Zap, Upload, X, ChevronRight, Check, Mic, MicOff, ThumbsUp, ThumbsDown, Download, Sparkles, Link, AlertCircle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type OutputType = "reel" | "carousel" | "caption" | "brief";

interface Clip {
  id: string;
  name: string;
  url: string;
  durationSec?: number;
  previewUrl?: string;
}

interface LibraryItem {
  id: string;
  url?: string;
  sourceType: string;
  thumbnailUrl?: string;
  notes?: string;
  hookPatterns?: { archetype?: string; formula?: string }[];
  approvalRate?: number;
  createdAt: string;
}

interface TrendFormat {
  name: string;
  direction: "up" | "stable" | "down";
}

interface BrainResult {
  type: OutputType;
  renderJobId?: string;
  contentProjectId?: string;
  renderUrl?: string;
  shotstack?: { id: string; status: string };
  recipe?: Record<string, unknown>;
  caption?: string;
  slides?: { headline: string; body: string }[];
  brief?: string;
  hookText?: string;
  status: "pending" | "rendering" | "done" | "error";
  message?: string;
}

const QUICK_VIBES = [
  "🔥 Hype listing reveal",
  "🏡 Just listed announcement",
  "🎬 Cinematic walkthrough",
  "📍 Neighborhood lifestyle",
  "💰 Just sold celebration",
  "📊 Market update",
];

// ── Mic button (Web Speech API) ───────────────────────────────────────────────
function MicButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported(Boolean(SR));
  }, []);

  if (!supported) return null;

  const toggle = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
      setListening(false);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  };

  return (
    <button
      onClick={toggle}
      title={listening ? "Stop listening" : "Speak your idea"}
      style={{
        background: listening ? "rgba(238,129,114,0.15)" : "transparent",
        border: `1px solid ${listening ? "var(--reve-coral, #EE8172)" : "rgba(255,255,255,0.15)"}`,
        borderRadius: 8,
        padding: "6px 10px",
        cursor: "pointer",
        color: listening ? "var(--reve-coral, #EE8172)" : "rgba(255,255,255,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        transition: "all 0.15s",
      }}
    >
      {listening ? <><MicOff size={13} /><span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>Listening…</span></> : <><Mic size={13} />Speak</>}
    </button>
  );
}

// ── Clip uploader ─────────────────────────────────────────────────────────────
function ClipZone({ clips, onAdd, onRemove }: {
  clips: Clip[];
  onAdd: (clips: Clip[]) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // In-flight uploads keyed by a temp id → { name, pct }
  const [inFlight, setInFlight] = useState<Record<string, { name: string; pct: number }>>({});
  const [error, setError] = useState<string | null>(null);

  // Client-direct-to-Blob upload. Phone footage (50–200MB+) blows past Vercel's
  // ~4.5MB server-route limit, so we DON'T proxy bytes through the server — the
  // browser uploads straight to Vercel Blob via a short-lived token minted by
  // /api/reel/upload, then we get back a public HTTPS URL the render pipeline
  // (Shotstack) can actually reach.
  const upload = async (files: FileList) => {
    setError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      const tempId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setInFlight((u) => ({ ...u, [tempId]: { name: file.name, pct: 0 } }));
      try {
        const blob = await blobUpload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/reel/upload",
          contentType: file.type || undefined,
          onUploadProgress: ({ percentage }) =>
            setInFlight((u) => ({ ...u, [tempId]: { name: file.name, pct: Math.round(percentage) } })),
        });
        // blob.url is a public HTTPS URL — feed it to the reel pipeline.
        onAdd([{ id: tempId, name: file.name, url: blob.url, previewUrl }]);
      } catch (err) {
        // Don't silently feed an unreachable blob: URL — tell Caleb it failed.
        URL.revokeObjectURL(previewUrl);
        setError(`"${file.name}" failed to upload — check the file and try again.`);
        console.error("Footage upload failed:", err);
      } finally {
        setInFlight((u) => {
          const next = { ...u };
          delete next[tempId];
          return next;
        });
      }
    }
    setUploading(false);
  };

  return (
    <div>
      <div
        style={{
          border: `2px dashed ${dragging ? "var(--reve-coral, #EE8172)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 14,
          padding: "20px 16px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.15s",
          background: dragging ? "rgba(238,129,114,0.05)" : "transparent",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      >
        <Upload size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
        <div style={{ fontSize: 13, opacity: 0.6 }}>{uploading ? "Uploading…" : "Drop footage here or click to browse"}</div>
        <div style={{ fontSize: 11, opacity: 0.4, marginTop: 4 }}>MP4 · MOV · from Dropbox or phone</div>
        <input ref={inputRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) upload(e.target.files); }} />
      </div>

      {/* In-flight upload progress (per file) */}
      {Object.entries(inFlight).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {Object.entries(inFlight).map(([id, { name, pct }]) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--reve-coral, #EE8172)", transition: "width 0.2s" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload error */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--reve-coral, #EE8172)" }}>
          <AlertCircle size={13} />
          <span>{error}</span>
        </div>
      )}

      {clips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {clips.map((c) => (
            <div key={c.id} style={{ position: "relative", width: 72, height: 72 }}>
              {c.previewUrl ? (
                <video src={c.previewUrl} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} muted />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 4 }}>
                  {c.name.slice(0, 12)}
                </div>
              )}
              <button onClick={() => onRemove(c.id)} style={{ position: "absolute", top: -4, right: -4, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Output card ───────────────────────────────────────────────────────────────
function ResultCard({
  result,
  onFeedback,
}: {
  result: BrainResult;
  onFeedback?: (decision: "approved" | "rejected" | "edited", note?: string) => void;
}) {
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackDone, setFeedbackDone] = useState(false);

  if (result.status === "pending" || result.status === "rendering") {
    return (
      <div className="glass-card" style={{ padding: 24, display: "flex", alignItems: "center", gap: 14 }}>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--reve-coral, #EE8172)" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {result.status === "rendering" ? "Rendering your video…" : "Video Brain is working…"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
            {result.status === "rendering" ? "Shotstack is cutting your footage (~60s)" : "Analyzing reference + routing to tools"}
          </div>
        </div>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="glass-card" style={{ padding: 20, borderLeft: "3px solid var(--reve-coral, #EE8172)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Something went wrong</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>{result.message}</div>
      </div>
    );
  }

  const hasFeedback = result.renderJobId && onFeedback;

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Check size={16} style={{ color: "var(--reve-coral, #EE8172)" }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {result.type === "reel" ? "Reel rendered" : result.type === "carousel" ? "Carousel generated" : result.type === "brief" ? "Production brief ready" : "Caption ready"}
        </span>
      </div>

      {/* In-app video player */}
      {result.renderUrl && (
        <div style={{ marginBottom: 16 }}>
          <video src={result.renderUrl} controls autoPlay muted playsInline style={{ width: "100%", borderRadius: 10, maxHeight: 400 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a href={result.renderUrl} download style={{ fontSize: 11 }} className="btn-ghost">
              <Download size={11} style={{ display: "inline", marginRight: 4 }} />Download MP4
            </a>
            {result.contentProjectId && (
              <a href={`/api/studio/capcut?contentProjectId=${result.contentProjectId}`} style={{ fontSize: 11 }} className="btn-ghost">
                ✂️ CapCut brief
              </a>
            )}
          </div>
        </div>
      )}

      {result.hookText && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>Hook text</div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{result.hookText}</div>
        </div>
      )}

      {result.caption && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Caption</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{result.caption}</div>
          <button className="btn-ghost" style={{ marginTop: 8, fontSize: 11 }} onClick={() => navigator.clipboard.writeText(result.caption!)}>Copy caption</button>
        </div>
      )}

      {result.slides && result.slides.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Carousel slides</div>
          {result.slides.map((s, i) => (
            <div key={i} style={{ marginBottom: 10, padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Slide {i + 1}: {s.headline}</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{s.body}</div>
            </div>
          ))}
        </div>
      )}

      {result.brief && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Production brief</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap", opacity: 0.85 }}>{result.brief}</div>
        </div>
      )}

      {/* 👍/👎 Feedback row */}
      {hasFeedback && !feedbackDone && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>How'd it turn out?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
              onClick={() => { onFeedback!("approved"); setFeedbackDone(true); }}>
              <ThumbsUp size={13} /> Approved — ship it
            </button>
            <button className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
              onClick={() => { onFeedback!("rejected"); setFeedbackDone(true); }}>
              <ThumbsDown size={13} /> Not right
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="aire-input"
              placeholder="What would you change? (optional)"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="btn-primary" style={{ fontSize: 11, padding: "6px 12px" }}
              onClick={() => { onFeedback!("edited", feedbackNote); setFeedbackDone(true); }}>
              Submit
            </button>
          </div>
        </div>
      )}

      {feedbackDone && (
        <div style={{ fontSize: 12, opacity: 0.4, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Check size={11} /> Feedback recorded — brain updated
        </div>
      )}

      {result.shotstack?.id && !result.renderUrl && (
        <div style={{ marginTop: 12, fontSize: 11, opacity: 0.4 }}>Render ID: {result.shotstack.id}</div>
      )}
    </div>
  );
}

// ── Seed Brain banner ─────────────────────────────────────────────────────────
function SeedBrainBanner({ onSeeded }: { onSeeded: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const seed = async () => {
    setSeeding(true);
    setProgress(["Connecting to teardown-studio intelligence…"]);
    try {
      const res = await fetch("/api/studio/seed-brain", { method: "POST" });
      const data = await res.json() as { studiesIngested?: number; formatsSeeded?: number; preferencesSeeded?: number; lessonsLoaded?: number; digestsProcessed?: number; skipped?: boolean };
      if (data.skipped) { setDone(true); onSeeded(); return; }
      setProgress([
        `✓ ${data.studiesIngested ?? 0} creator studies ingested`,
        `✓ ${data.formatsSeeded ?? 0} formats loaded from grammar`,
        `✓ ${data.preferencesSeeded ?? 0} preferences bootstrapped`,
        `✓ ${data.lessonsLoaded ? "21" : "0"} hard lessons loaded`,
        `✓ ${data.digestsProcessed ?? 0} daily digests processed`,
      ]);
      setDone(true);
      onSeeded();
    } catch (err) {
      setProgress([`Error: ${String(err)}`]);
      setSeeding(false);
    }
  };

  if (done) return null;

  return (
    <div className="glass-card" style={{ padding: 20, marginBottom: 24, borderLeft: "3px solid var(--reve-coral, #EE8172)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            <Sparkles size={14} style={{ display: "inline", marginRight: 6, color: "var(--reve-coral, #EE8172)" }} />
            Seed the Brain before your first reel
          </div>
          <div style={{ fontSize: 12, opacity: 0.55 }}>
            Loads 734-line grammar, 4 creator studies, 21 hard lessons, and 7 trend digests. Takes ~30s, runs once.
          </div>
          {progress.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {progress.map((p, i) => <div key={i} style={{ fontSize: 11, opacity: 0.7 }}>{p}</div>)}
            </div>
          )}
        </div>
        <button className="btn-primary" style={{ whiteSpace: "nowrap", padding: "9px 18px", fontSize: 13 }} onClick={seed} disabled={seeding}>
          {seeding ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite", display: "inline", marginRight: 6 }} />Seeding…</> : "Seed Brain"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [refVideo, setRefVideo] = useState<{ id?: string; url: string; label: string; thumbnailUrl?: string } | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [result, setResult] = useState<BrainResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [trending, setTrending] = useState<TrendFormat[]>([]);
  const [brainSeeded, setBrainSeeded] = useState<boolean | null>(null); // null = loading
  const [addingUrl, setAddingUrl] = useState(false);
  const [queueUrl, setQueueUrl] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Check if brain is seeded + load library/trending on mount
  useEffect(() => {
    (async () => {
      try {
        const [libRes, trendRow] = await Promise.all([
          fetch("/api/studio/library"),
          fetch("/api/settings/reel.installedFormats").catch(() => null),
        ]);
        if (libRes.ok) {
          const data = await libRes.json() as { items: LibraryItem[] };
          setLibrary(data.items ?? []);
          // If library has study items, brain is seeded
          setBrainSeeded(data.items.some((i) => i.sourceType === "study") || data.items.length > 3);
        } else {
          setBrainSeeded(false);
        }

        // Load trending formats
        const trendRes = await fetch("/api/studio/trends").catch(() => null);
        if (trendRes?.ok) {
          const td = await trendRes.json() as { topFormats?: TrendFormat[] };
          setTrending(td.topFormats ?? []);
        }
      } catch {
        setBrainSeeded(false);
      }
    })();
  }, []);

  // SSE polling when we get a renderJobId
  const startSsePolling = useCallback((renderJobId: string) => {
    sseRef.current?.close();
    const es = new EventSource(`/api/studio/status?renderJobId=${renderJobId}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { state: string; url?: string; error?: string };
        if (data.state === "done") {
          setResult((prev) => prev ? { ...prev, status: "done", renderUrl: data.url ?? prev.renderUrl } : prev);
          es.close();
        } else if (data.state === "failed") {
          setResult((prev) => prev ? { ...prev, status: "error", message: data.error ?? "Render failed" } : prev);
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => es.close();
    sseRef.current = es;
  }, []);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const pickVibe = (v: string) => {
    setPrompt(v.replace(/^[^\s]+\s/, ""));
    textRef.current?.focus();
  };

  const submit = useCallback(async () => {
    if (!prompt.trim() && clips.length === 0) return;
    setThinking(true);
    setResult({ type: "reel", status: "pending" });

    try {
      const res = await fetch("/api/studio/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          footage: clips.map((c) => ({ url: c.url, name: c.name, durationSec: c.durationSec })),
          referenceUrl: refVideo?.url || refUrl || undefined,
          referenceRecipeId: refVideo?.id ?? undefined,
        }),
      });

      const data = await res.json() as BrainResult;
      setResult(data);

      // Start SSE polling if we got a renderJobId
      if (data.renderJobId) {
        startSsePolling(data.renderJobId);
      }
    } catch (err) {
      setResult({ type: "reel", status: "error", message: String(err) });
    } finally {
      setThinking(false);
    }
  }, [prompt, clips, refVideo, refUrl, startSsePolling]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  };

  const handleFeedback = async (decision: "approved" | "rejected" | "edited", note?: string) => {
    if (!result?.renderJobId) return;
    await fetch("/api/studio/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ renderJobId: result.renderJobId, decision, note }),
    }).catch(() => {});
  };

  const queueInspiration = async () => {
    if (!queueUrl.trim()) return;
    setAddingUrl(true);
    try {
      await fetch("/api/studio/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: queueUrl.trim(), notes: "Queued inspiration" }),
      });
      setQueueUrl("");
      // Refresh library
      const libRes = await fetch("/api/studio/library");
      if (libRes.ok) {
        const data = await libRes.json() as { items: LibraryItem[] };
        setLibrary(data.items ?? []);
      }
    } catch { /* ignore */ }
    setAddingUrl(false);
  };

  return (
    <main style={{ padding: "32px 32px 80px 80px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Zap size={20} style={{ color: "var(--reve-coral, #EE8172)" }} />
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Video Brain</h1>
        </div>
        <p style={{ fontSize: 13, opacity: 0.5, lineHeight: 1.6 }}>
          Tell Jarvis what you want. Drop your footage. He routes it through the right tool and hands you the output.
        </p>
      </div>

      {/* Seed Brain banner */}
      {brainSeeded === false && (
        <SeedBrainBanner onSeeded={() => setBrainSeeded(true)} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        {/* LEFT — idea box */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Quick vibe chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_VIBES.map((v) => (
              <button key={v} className="btn-ghost" style={{ fontSize: 12, padding: "5px 12px", borderRadius: 99 }} onClick={() => pickVibe(v)}>
                {v}
              </button>
            ))}
          </div>

          {/* Main prompt box */}
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <textarea
              ref={textRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKey}
              placeholder={`"Here's footage from the Oak St shoot — make a hype reel to announce the listing. Moody, cinematic, beat-sync cuts."\n\n"Use this reference video as the style guide and recreate it with my clips."`}
              style={{
                width: "100%",
                minHeight: 140,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "vertical",
                padding: "18px 20px",
                fontSize: 14,
                lineHeight: 1.7,
                color: "inherit",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.35 }}>⌘↵ to run</span>
                <MicButton onResult={(text) => setPrompt((prev) => prev ? `${prev} ${text}` : text)} />
              </div>
              <button
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px" }}
                onClick={submit}
                disabled={thinking || (!prompt.trim() && clips.length === 0)}
              >
                {thinking ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
                {thinking ? "Working…" : "Run"}
              </button>
            </div>
          </div>

          {/* Footage drop */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5, marginBottom: 10 }}>
              Your footage {clips.length > 0 && <span style={{ opacity: 0.7 }}>· {clips.length} clip{clips.length > 1 ? "s" : ""}</span>}
            </div>
            <ClipZone
              clips={clips}
              onAdd={(c) => setClips((prev) => [...prev, ...c])}
              onRemove={(id) => setClips((prev) => prev.filter((c) => c.id !== id))}
            />
          </div>

          {/* Reference video */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
                Reference video (style guide)
              </div>
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowRefPanel((v) => !v)}>
                {showRefPanel ? "Hide" : refVideo ? "Change" : "Pick one →"}
              </button>
            </div>

            {refVideo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(238,129,114,0.08)", borderRadius: 10, border: "1px solid rgba(238,129,114,0.2)" }}>
                {refVideo.thumbnailUrl && <img src={refVideo.thumbnailUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />}
                <Film size={16} style={{ color: "var(--reve-coral, #EE8172)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1 }}>{refVideo.label}</span>
                <button onClick={() => setRefVideo(null)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.35, padding: "8px 0" }}>
                No reference — Jarvis synthesizes from your vibe + Caleb&apos;s learned grammar
              </div>
            )}

            {showRefPanel && (
              <div className="glass-card" style={{ marginTop: 10, padding: 16 }}>
                {/* Add inspiration URL */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>Add inspiration (ingest + analyze):</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="aire-input"
                      placeholder="Instagram, TikTok, or direct MP4 URL"
                      value={queueUrl}
                      onChange={(e) => setQueueUrl(e.target.value)}
                      style={{ flex: 1, fontSize: 12 }}
                    />
                    <button className="btn-primary" style={{ padding: "8px 12px", fontSize: 11 }} onClick={queueInspiration} disabled={addingUrl}>
                      {addingUrl ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Link size={12} />}
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Library ({library.length})</div>
                {library.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.4, padding: "8px 0" }}>No references yet — drop a URL above or seed the brain</div>
                ) : (
                  library.slice(0, 8).map((r) => (
                    <button key={r.id} className="btn-ghost" style={{ width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 6, borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}
                      onClick={() => { setRefVideo({ id: r.id, url: r.url ?? "", label: r.notes ?? r.sourceType, thumbnailUrl: r.thumbnailUrl }); setShowRefPanel(false); }}>
                      {r.thumbnailUrl ? (
                        <img src={r.thumbnailUrl} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                      ) : (
                        <Film size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.notes ?? r.sourceType}</div>
                        {r.hookPatterns?.[0] && (
                          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 1 }}>{(r.hookPatterns[0] as { archetype?: string }).archetype}</div>
                        )}
                      </div>
                      <ChevronRight size={12} style={{ opacity: 0.3, flexShrink: 0 }} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Trending this week */}
          {trending.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5, marginBottom: 10 }}>
                Trending this week
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {trending.map((t) => (
                  <button key={t.name} className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, opacity: t.direction === "down" ? 0.5 : 1 }}
                    onClick={() => setPrompt(t.name + " style")}>
                    {t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "·"} {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — output */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5, marginBottom: 12 }}>
            Output
          </div>

          {result ? (
            <ResultCard result={result} onFeedback={handleFeedback} />
          ) : (
            <div className="glass-card" style={{ padding: 32, textAlign: "center" }}>
              <Film size={28} style={{ opacity: 0.15, marginBottom: 10 }} />
              <div style={{ fontSize: 13, opacity: 0.35, lineHeight: 1.7 }}>
                Drop footage + describe what you want.<br />
                Jarvis tears down the reference, matches the cuts, and renders with your clips.
              </div>
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["🎬 Reel", "Shotstack render — actual MP4"],
                  ["📱 Carousel", "Claude slide copy"],
                  ["✂️ CapCut brief", "Shot list + text overlays"],
                  ["📝 Caption", "Viral hook + hashtags"],
                ].map(([label, desc]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <span style={{ opacity: 0.6 }}>{label}</span>
                    <span style={{ opacity: 0.35 }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
