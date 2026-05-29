"use client";

import { useState } from "react";

interface Props {
  url: string;
  title: string;
  label: string;
}

export default function EmbeddedApp({ url, title, label }: Props) {
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function handleLoad() {
    setLoaded(true);
    // Try to detect X-Frame-Options block — if the iframe loads but has no content
    // we show the fallback. Most blocks show a blank iframe.
    try {
      const iframe = document.getElementById(`embed-${label}`) as HTMLIFrameElement;
      if (iframe?.contentDocument === null) {
        setBlocked(true);
      }
    } catch {
      // Cross-origin — can't read contentDocument, which means it loaded (cross-origin success)
      setLoaded(true);
    }
  }

  if (blocked) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          background: "var(--reve-surface)",
        }}
      >
        <p style={{ fontSize: "11px", letterSpacing: "0.16em", color: "var(--reve-muted)" }}>
          {title.toUpperCase()} BLOCKS EMBEDDING
        </p>
        <p style={{ fontSize: "13px", color: "var(--reve-text)", maxWidth: "320px", textAlign: "center", lineHeight: "1.7" }}>
          This app prevents iframe embedding for security. Open it in a side panel instead.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "11px",
            letterSpacing: "0.14em",
            background: "var(--reve-coral)",
            color: "var(--reve-black)",
            border: "none",
            borderRadius: "3px",
            padding: "10px 20px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          OPEN {title.toUpperCase()} →
        </a>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: "relative", background: "var(--reve-black)" }}>
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--reve-black)",
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "32px",
                height: "2px",
                background: "var(--reve-coral)",
                margin: "0 auto 12px",
                animation: "coral-sweep 1.2s cubic-bezier(0.65,0,0.35,1) infinite alternate",
              }}
            />
            <p style={{ fontSize: "11px", letterSpacing: "0.16em", color: "var(--reve-muted)" }}>
              LOADING {title.toUpperCase()}...
            </p>
          </div>
        </div>
      )}
      <iframe
        id={`embed-${label}`}
        src={url}
        title={title}
        onLoad={handleLoad}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          opacity: loaded ? 1 : 0,
          transition: "opacity 600ms cubic-bezier(0.65,0,0.35,1)",
        }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
