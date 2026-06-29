"use client";

import { useState, useEffect, useCallback } from "react";

interface DbxEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  thumbnail: string | null;
}

interface Props {
  onSelect: (url: string, filename: string) => void;
  onClose: () => void;
}

export function DropboxPicker({ onSelect, onClose }: Props) {
  const [entries, setEntries] = useState<DbxEntry[]>([]);
  const [path, setPath] = useState("");
  const [breadcrumb, setBreadcrumb] = useState<{ label: string; path: string }[]>([{ label: "Dropbox", path: "" }]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dropbox/files?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (data.error) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      } else {
        setEntries(data.entries ?? []);
      }
    } catch {
      setError("Failed to load files");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(path); }, [load, path]);

  function navigate(entry: DbxEntry) {
    setPath(entry.path);
    setBreadcrumb(prev => [...prev, { label: entry.name, path: entry.path }]);
  }

  function navTo(idx: number) {
    const crumb = breadcrumb[idx];
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setPath(crumb.path);
  }

  async function selectFile(entry: DbxEntry) {
    setImporting(entry.path);
    try {
      const res = await fetch("/api/dropbox/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
      const data = await res.json();
      if (data.url) {
        onSelect(data.url, entry.name);
      } else {
        setError("Import failed — try again");
        setImporting(null);
      }
    } catch {
      setError("Network error during import");
      setImporting(null);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(9,9,11,0.80)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "min(860px, 96vw)", maxHeight: "82vh",
        background: "var(--aire-card)", borderRadius: "20px",
        border: "1px solid var(--aire-border)",
        boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--aire-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: "var(--aire-muted)", fontSize: 12 }}>›</span>}
                <button onClick={() => navTo(i)} style={{
                  background: "none", border: "none", cursor: i < breadcrumb.length - 1 ? "pointer" : "default",
                  fontSize: "12px", fontWeight: i === breadcrumb.length - 1 ? 700 : 500,
                  color: i === breadcrumb.length - 1 ? "var(--aire-text)" : "var(--aire-muted)",
                  padding: 0, letterSpacing: "0.02em",
                }}>
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--aire-muted)", fontSize: 20, lineHeight: 1, padding: "2px 6px",
            borderRadius: 6, flexShrink: 0,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(238,129,114,0.1)", border: "1px solid rgba(238,129,114,0.25)", marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--aire-coral)" }}>{error}</p>
              {error.includes("scope") && (
                <p style={{ fontSize: 11, color: "var(--aire-muted)", marginTop: 6 }}>
                  Enable <code>files.metadata.read</code> + <code>files.content.read</code> in your Dropbox App Console → Permissions, then regenerate the token.
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="skeleton" style={{ aspectRatio: "1", borderRadius: 10 }} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--aire-muted)" }}>
              <p style={{ fontSize: 13 }}>No images or folders here</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => entry.type === "folder" ? navigate(entry) : selectFile(entry)}
                  disabled={importing === entry.path}
                  style={{
                    background: "none", border: "1px solid var(--aire-border)",
                    borderRadius: 10, cursor: importing ? "default" : "pointer",
                    padding: 0, overflow: "hidden", aspectRatio: "1",
                    position: "relative",
                    opacity: importing && importing !== entry.path ? 0.5 : 1,
                    transition: "transform 150ms, border-color 150ms",
                  }}
                  onMouseEnter={e => { if (!importing) { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.borderColor = "var(--aire-coral)"; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = "var(--aire-border)"; }}
                >
                  {entry.type === "folder" ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--aire-card-warm)" }}>
                      <span style={{ fontSize: 28 }}>📁</span>
                      <span style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--aire-text-2)", padding: "0 8px", textAlign: "center", lineHeight: 1.3, wordBreak: "break-word" }}>
                        {entry.name}
                      </span>
                    </div>
                  ) : entry.thumbnail ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.thumbnail} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {importing === entry.path && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(9,9,11,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 10, color: "#fff", letterSpacing: "0.1em" }}>IMPORTING…</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--aire-card-warm)" }}>
                      <span style={{ fontSize: 24 }}>🖼</span>
                      <span style={{ fontSize: 9, color: "var(--aire-muted)", padding: "0 6px", textAlign: "center", wordBreak: "break-all" }}>{entry.name}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--aire-border)" }}>
          <p style={{ fontSize: 10, color: "var(--aire-muted)", letterSpacing: "0.06em" }}>
            {importing ? "Importing to storage — this takes a few seconds…" : "Click a photo to import it · Click a folder to open it"}
          </p>
        </div>
      </div>
    </div>
  );
}
