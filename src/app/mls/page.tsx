"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EmbeddedApp from "@/components/EmbeddedApp";

const PARAGON_URL = "https://mlsbox.paragonrels.com/ParagonLS/Default.mvc#1,1";

interface SettingStatus { set: boolean; preview?: string | null }

export default function MLSPage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: unknown) => {
        // Some routes return { statuses: {...} }, others a flat map. Support both.
        const root = data as Record<string, unknown>;
        const map = (root && typeof root === "object" && root.statuses && typeof root.statuses === "object")
          ? (root.statuses as Record<string, SettingStatus>)
          : (root as Record<string, SettingStatus>);
        const url = map?.["PARAGON_API_URL"]?.set;
        const key = map?.["PARAGON_API_KEY"]?.set;
        setConnected(!!(url && key));
      })
      .catch(() => setConnected(false));
  }, []);

  return (
    <div style={{ padding: "32px 40px 40px 80px", maxWidth: "1360px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div>
        <p style={{ fontSize: "11px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "8px" }}>MLS</p>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 className="font-display" style={{ fontSize: "44px", color: "var(--aire-text)", lineHeight: 1.05 }}>
              Paragon
            </h1>
            <p style={{ fontSize: "12px", color: "var(--aire-text-2)", marginTop: "8px", letterSpacing: "0.04em" }}>
              Greater Baton Rouge Association of REALTORS®
            </p>
          </div>
          <a
            href={PARAGON_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            OPEN IN NEW TAB ↗
          </a>
        </div>
        <div style={{ width: "36px", height: "2px", background: "var(--aire-coral)", marginTop: "14px" }} />
      </div>

      {/* Body */}
      {connected === false ? (
        // Disconnected state — coral-soft empty card
        <div
          className="hero-blob-wrap"
          style={{
            background: "var(--aire-coral-soft)",
            border: "1px solid rgba(238,129,114,0.25)",
            borderRadius: "20px",
            padding: "72px 56px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="blob blob-coral" style={{ opacity: 0.55 }} />
          <div className="blob blob-cream" style={{ opacity: 0.4 }} />
          <div style={{ position: "relative", zIndex: 1, maxWidth: "520px", margin: "0 auto" }}>
            <p style={{
              fontSize: "11px", letterSpacing: "0.22em",
              color: "var(--aire-coral-deep)", fontWeight: 600, marginBottom: "16px",
            }}>
              PARAGON NOT CONNECTED
            </p>
            <h2 className="font-display" style={{ fontSize: "32px", color: "var(--aire-text)", lineHeight: 1.15, marginBottom: "14px" }}>
              Connect your MLS to surface live listings inside AIRE
            </h2>
            <p style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 1.6, marginBottom: "28px" }}>
              Add your <code style={{
                background: "var(--aire-card)", padding: "1px 8px",
                borderRadius: "6px", fontSize: "12px", color: "var(--aire-coral-deep)",
              }}>PARAGON_API_URL</code> and <code style={{
                background: "var(--aire-card)", padding: "1px 8px",
                borderRadius: "6px", fontSize: "12px", color: "var(--aire-coral-deep)",
              }}>PARAGON_API_KEY</code> to enable real-time listing search, buyer matching, and Paragon-powered post creation.
            </p>
            <Link
              href="/settings#paragon"
              className="btn-coral"
              style={{ display: "inline-block", textDecoration: "none", padding: "12px 22px" }}
            >
              CONNECT PARAGON →
            </Link>
          </div>
        </div>
      ) : (
        // Iframe wrapper
        <div
          className="card-light"
          style={{
            padding: "0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 200px)",
            minHeight: "560px",
          }}
        >
          {/* Frame chrome */}
          <div style={{
            padding: "10px 18px",
            borderBottom: "1px solid var(--aire-border)",
            background: "var(--aire-card-warm)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}>
            <span className="live-dot" />
            <span style={{ fontSize: "10px", letterSpacing: "0.16em", color: "var(--aire-text-2)", fontWeight: 500 }}>
              LIVE · PARAGON LS
            </span>
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--aire-muted)" }}>
              {connected === null ? "Checking connection…" : "Embedded session"}
            </span>
          </div>
          <div style={{ flex: 1, position: "relative", background: "var(--aire-card)" }}>
            <EmbeddedApp
              url={PARAGON_URL}
              title="Paragon MLS"
              label="mls"
            />
          </div>
        </div>
      )}
    </div>
  );
}
