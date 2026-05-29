"use client";

import { useRef, useState } from "react";

interface ImportResult {
  imported: number;
  closed: number;
  pending: number;
  totalAgci: number;
  totalVolume: number;
}

export default function DarwinSyncButton({ onSynced }: { onSynced?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/import/darwin", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
        onSynced?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        title="Upload your Darwin Cloud rpt_PendingAndClosing.csv to sync closed + pending deals"
        style={{
          fontSize: "10px",
          letterSpacing: "0.14em",
          padding: "10px 16px",
          background: "transparent",
          color: "var(--reve-text)",
          border: "1px solid var(--reve-border)",
          borderRadius: "8px",
          cursor: importing ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        {importing ? "SYNCING..." : "↻ SYNC FROM DARWIN"}
      </button>

      {result && (
        <div
          onClick={() => setResult(null)}
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 300,
            background: "var(--reve-surface)",
            border: "1px solid rgba(74,222,128,0.4)",
            borderLeft: "3px solid #4ade80",
            borderRadius: "8px",
            padding: "16px 20px",
            maxWidth: "340px",
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "#4ade80", marginBottom: "8px" }}>DARWIN SYNCED</p>
          <p style={{ fontSize: "13px", color: "var(--reve-text)", lineHeight: 1.5 }}>
            {result.closed} closed · {result.pending} pending
          </p>
          <p style={{ fontSize: "12px", color: "var(--reve-muted)", marginTop: "4px" }}>
            ${result.totalAgci.toLocaleString()} AGCI · ${(result.totalVolume / 1_000_000).toFixed(2)}M volume
          </p>
        </div>
      )}

      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 300,
            background: "var(--reve-surface)",
            border: "1px solid rgba(238,129,114,0.4)",
            borderLeft: "3px solid #EE8172",
            borderRadius: "8px",
            padding: "16px 20px",
            maxWidth: "340px",
            cursor: "pointer",
          }}
        >
          <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "#EE8172", marginBottom: "8px" }}>DARWIN IMPORT FAILED</p>
          <p style={{ fontSize: "13px", color: "var(--reve-text)" }}>{error}</p>
        </div>
      )}
    </>
  );
}
