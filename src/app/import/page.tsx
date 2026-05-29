"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        setAllRows(rows);
        setHeaders(results.meta.fields ?? []);
        setPreview(rows.slice(0, 5));
        setResult(null);
      },
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }

  async function runImport() {
    setImporting(true);
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: allRows }),
    });
    const data = await res.json();
    setResult(data);
    setImporting(false);
  }

  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>
          CONTACT IMPORT
        </p>
        <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05 }}>
          Import from Lofty
        </h1>
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "14px", animation: "coral-sweep 700ms cubic-bezier(0.65,0,0.35,1) 200ms both" }} />
      </div>

      <div className="card-warm" style={{ padding: "22px 24px", marginBottom: "20px" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: "10px" }}>
          HOW TO EXPORT FROM LOFTY
        </p>
        <ol style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 2, paddingLeft: "18px" }}>
          <li>Log into <strong style={{ color: "var(--aire-text)" }}>crm.reverealtors.com</strong></li>
          <li>Go to <strong style={{ color: "var(--aire-text)" }}>Contacts</strong> → select all</li>
          <li>Click <strong style={{ color: "var(--aire-text)" }}>Export</strong> → choose CSV</li>
          <li>Download the file and drag it below</li>
        </ol>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--aire-coral)" : "var(--aire-border-2)"}`,
          borderRadius: "16px",
          padding: "56px 32px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "var(--aire-coral-soft)" : "var(--aire-card-warm)",
          transition: "all 300ms",
          marginBottom: "20px",
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <p style={{ fontSize: "14px", color: "var(--aire-text-2)" }}>
          {preview.length > 0 ? `✓ ${allRows.length} contacts loaded` : "Drop your Lofty CSV here, or click to browse"}
        </p>
        {preview.length === 0 && (
          <p style={{ fontSize: "11px", color: "var(--aire-muted)", marginTop: "8px" }}>
            Accepts .csv files
          </p>
        )}
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", marginBottom: "10px" }}>
            PREVIEW — FIRST 5 ROWS
          </p>
          <div className="card-light" style={{ overflowX: "auto", padding: "0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {headers.slice(0, 8).map(h => (
                    <th key={h} style={{ padding: "12px 14px", borderBottom: "1px solid var(--aire-border)", textAlign: "left", fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.slice(0, 8).map(h => (
                      <td key={h} style={{ padding: "10px 14px", borderBottom: "1px solid var(--aire-border)", color: "var(--aire-text)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
      {preview.length > 0 && !result && (
        <button
          onClick={runImport}
          disabled={importing}
          className="btn-coral"
          style={{
            opacity: importing ? 0.6 : 1,
            cursor: importing ? "default" : "pointer",
          }}
        >
          {importing ? `IMPORTING ${allRows.length} CONTACTS...` : `IMPORT ${allRows.length} CONTACTS →`}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="card-light" style={{ padding: "28px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-muted)", marginBottom: "18px" }}>
            IMPORT COMPLETE
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
            {[
              { label: "CREATED", value: result.created, color: "#2d7a55" },
              { label: "UPDATED", value: result.updated, color: "#2d7a55" },
              { label: "SKIPPED", value: result.skipped, color: "var(--aire-muted)" },
              { label: "TOTAL", value: result.total, color: "var(--aire-text)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card-warm" style={{ padding: "16px 18px" }}>
                <div className="metric-number" style={{ fontSize: "28px", fontWeight: 700, color, lineHeight: 1.1 }}>
                  {value}
                </div>
                <div style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--aire-muted)", marginTop: "6px" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "22px", alignItems: "center" }}>
            <a href="/contacts" className="btn-coral" style={{ textDecoration: "none" }}>
              VIEW CONTACTS →
            </a>
            <button
              onClick={() => { setResult(null); setPreview([]); setAllRows([]); setHeaders([]); }}
              className="btn-ghost"
            >
              IMPORT AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
