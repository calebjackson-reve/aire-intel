"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AuditData {
  totalPosts: number;
  byType: { type: string; count: number; avgReach: number; avgEngagement: number; avgEngagementRate: number }[];
  topPosts: { postId: string; caption: string; reach: number; engagement: number; engagementRate: number; postType: string }[];
  trends: { signal: string; detail: string }[];
}

interface InsightsData {
  connected: boolean;
  posts: {
    postId: string;
    platform: "facebook" | "instagram";
    publishedAt: string;
    reach: number;
    impressions: number;
    engagement: number;
    engagementRate: number;
    reactions: number;
    comments: number;
    shares: number;
    saves: number;
  }[];
  demographics: {
    totalFollowers: number;
    age: Record<string, number>;
    gender: Record<string, number>;
    topCities: { city: string; count: number }[];
  } | null;
}

// Cream/coral/black luxury palette — neutral, warm, restrained.
const SERIES_COLORS = [
  "var(--aire-coral)",
  "var(--aire-ink)",
  "var(--aire-cream)",
  "var(--aire-mint)",
];
const SERIES_TRACK_COLORS = [
  "var(--aire-coral-soft)",
  "var(--aire-bg-deep)",
  "var(--aire-cream-soft)",
  "var(--aire-mint-soft)",
];

// ─── Empty state with inline setup steps ────────────────────────────────────
function MetaSetupEmptyState() {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div
      style={{
        padding: "28px 32px",
        border: "1px solid var(--aire-border)",
        borderRadius: "12px",
        background: "var(--aire-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
        <div style={{ maxWidth: "560px" }}>
          <span
            className="pill pill-coral"
            style={{ display: "inline-block", fontSize: "10px", letterSpacing: "0.20em", marginBottom: "12px", textTransform: "uppercase" }}
          >
            Connect Facebook + Instagram
          </span>
          <h3
            className="font-display"
            style={{ fontSize: "20px", fontWeight: 600, color: "var(--aire-text)", marginBottom: "10px", letterSpacing: "-0.01em" }}
          >
            Unlock content performance insights
          </h3>
          <p style={{ fontSize: "13px", color: "var(--aire-text-2)", lineHeight: 1.6 }}>
            Once your Page + IG Business Account are linked, you&apos;ll see per-post reach, engagement, and audience demographics.
            Claude will use this data to tailor every new post you generate.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={() => setShowSteps(s => !s)}
            className="btn-ghost"
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              padding: "10px 16px",
              borderRadius: "999px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {showSteps ? "Hide steps" : "Show steps"}
          </button>
          <Link
            href="/settings"
            className="btn-coral"
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              padding: "10px 18px",
              borderRadius: "999px",
              fontWeight: 700,
              textDecoration: "none",
              textTransform: "uppercase",
            }}
          >
            Go to settings →
          </Link>
        </div>
      </div>

      {showSteps && (
        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--aire-border)" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.18em", color: "var(--aire-coral-deep)", marginBottom: "16px", textTransform: "uppercase", fontWeight: 600 }}>
            6 Steps · ~15 min
          </p>

          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
            <SetupStep n={1} title="Create a Meta app">
              Go to <ExtLink href="https://developers.facebook.com">developers.facebook.com</ExtLink> → My Apps → Create App → choose <b>Business</b>.
              Name it <Code>Rêve Realtors AIRE</Code>. From the App Dashboard, grab the <b>App ID</b> (top of page) and <b>App Secret</b> (Settings → Basic).
            </SetupStep>

            <SetupStep n={2} title="Add products to your app">
              In the app sidebar: <b>+ Add Product</b> → add <b>Facebook Login for Business</b> and <b>Instagram</b>.
            </SetupStep>

            <SetupStep n={3} title="Connect your Facebook Page + IG Business Account">
              If your IG isn&apos;t already a Business Account: IG app → Profile → Settings → <b>Switch to Professional</b> → Business → connect to your FB Page.
              Then in <ExtLink href="https://business.facebook.com">business.facebook.com</ExtLink> → Settings → Pages → make sure both are linked.
            </SetupStep>

            <SetupStep n={4} title="Generate a permanent Page Access Token">
              <b>Method B (never expires):</b> business.facebook.com → Settings → Users → <b>System Users</b> → Add → name it <Code>AIRE Server</Code> → Admin role.
              Click the system user → <b>Add Assets</b> → add your app (Develop + Manage) + your Page (Manage Page, Create Content, Analyze) + your IG account.
              Click <b>Generate New Token</b> → select your app → check these scopes: <Code>pages_show_list</Code>, <Code>pages_read_engagement</Code>, <Code>pages_manage_posts</Code>, <Code>read_insights</Code>, <Code>instagram_basic</Code>, <Code>instagram_content_publish</Code>, <Code>instagram_manage_insights</Code>.
              Copy the token — this is <Code>META_PAGE_ACCESS_TOKEN</Code>.
            </SetupStep>

            <SetupStep n={5} title="Find your Page ID + IG Business ID">
              <b>Page ID:</b> Open your FB Page → About → scroll to <b>Page transparency</b>. Copy the numeric ID.<br />
              <b>IG Business ID:</b> Go to <ExtLink href="https://developers.facebook.com/tools/explorer">Graph API Explorer</ExtLink>, query <Code>{`{PAGE_ID}?fields=instagram_business_account`}</Code>. The returned <Code>id</Code> is your IG Business ID.
            </SetupStep>

            <SetupStep n={6} title="Paste all 5 into AIRE Settings">
              <Link href="/settings" style={{ color: "var(--aire-coral-deep)", fontWeight: 600 }}>Open Settings</Link> → scroll to the <b>Meta</b> section → paste:
              <Code>META_APP_ID</Code>, <Code>META_APP_SECRET</Code>, <Code>META_PAGE_ACCESS_TOKEN</Code>, <Code>META_PAGE_ID</Code>, <Code>META_IG_BUSINESS_ID</Code>.
              Click Save. This panel will populate with your real numbers within a few seconds.
            </SetupStep>
          </ol>

          <div
            style={{
              marginTop: "20px",
              padding: "14px 16px",
              background: "var(--aire-coral-soft)",
              border: "1px solid rgba(238,129,114,0.30)",
              borderRadius: "10px",
            }}
          >
            <p style={{ fontSize: "10px", color: "var(--aire-coral-deep)", letterSpacing: "0.18em", marginBottom: "6px", textTransform: "uppercase", fontWeight: 600 }}>
              Stuck? Check these gotchas
            </p>
            <ul style={{ fontSize: "12px", color: "var(--aire-text-2)", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
              <li>Token expired → you used Method A (60-day token). Use Method B (System User) for permanent.</li>
              <li>&quot;Insufficient permissions&quot; → regenerate with ALL the scopes from Step 4 checked.</li>
              <li>App in Development Mode → you can test, but Key + Jenna can&apos;t use it until you submit for App Review.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div style={{
        flexShrink: 0,
        width: "28px", height: "28px", borderRadius: "50%",
        background: "var(--aire-coral)",
        color: "var(--aire-ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "12px", fontWeight: 700,
      }}>
        {n}
      </div>
      <div style={{ flex: 1, paddingTop: "3px" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--aire-text)", marginBottom: "4px" }}>{title}</p>
        <p style={{ fontSize: "12px", color: "var(--aire-text-2)", lineHeight: 1.7 }}>{children}</p>
      </div>
    </li>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--aire-coral-deep)", textDecoration: "underline", fontWeight: 500 }}
    >
      {children}
    </a>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: "ui-monospace, monospace",
      fontSize: "11px",
      background: "var(--aire-bg-deep)",
      padding: "1px 6px",
      borderRadius: "4px",
      color: "var(--aire-text)",
      border: "1px solid var(--aire-border)",
    }}>
      {children}
    </code>
  );
}

export default function ContentPerformancePanel() {
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/social/audit").then(r => r.json()),
      fetch("/api/social/insights").then(r => r.json()),
    ]).then(([a, i]) => {
      setAudit(a);
      setInsights(i);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} />;
  }

  if (!insights?.connected) {
    return <MetaSetupEmptyState />;
  }

  if (!audit || audit.totalPosts === 0) {
    return (
      <div
        style={{
          padding: "32px",
          border: "1px solid var(--aire-border)",
          borderRadius: "12px",
          background: "var(--aire-card)",
          boxShadow: "var(--shadow-card)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "13px", color: "var(--aire-text)" }}>
          Connected ✓ — publish 5+ posts via AIRE to start the audit loop.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "14px", alignItems: "start" }}>
      {/* Left: Performance by Post Type */}
      <div
        style={{
          background: "var(--aire-card)",
          border: "1px solid var(--aire-border)",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-text-2)", textTransform: "uppercase", fontWeight: 600 }}>
            Engagement by post type
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--aire-border)" }} />
          <span style={{ fontSize: "10px", color: "var(--aire-muted)" }}>{audit.totalPosts} posts</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {audit.byType.map((t, i) => {
            const widthPct = audit.byType[0].avgEngagementRate > 0
              ? (t.avgEngagementRate / audit.byType[0].avgEngagementRate) * 100
              : 0;
            const color = SERIES_COLORS[i] ?? "var(--aire-muted)";
            const trackColor = SERIES_TRACK_COLORS[i] ?? "var(--aire-bg-deep)";
            return (
              <div key={t.type}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--aire-text)", textTransform: "capitalize", fontWeight: 500 }}>
                    {t.type.replace(/_/g, " ")}
                  </span>
                  <span
                    className="metric-number"
                    style={{ fontSize: "13px", color: "var(--aire-text)", fontWeight: 600 }}
                  >
                    {(t.avgEngagementRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: "6px", background: trackColor, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${widthPct}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 400ms ease-out" }} />
                </div>
                <div style={{ fontSize: "10px", color: "var(--aire-muted)", marginTop: "4px", letterSpacing: "0.04em" }}>
                  {t.count} posts · avg reach {t.avgReach.toLocaleString()} · {t.avgEngagement} engagement
                </div>
              </div>
            );
          })}
        </div>

        {audit.trends.length > 0 && (
          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--aire-border)" }}>
            <p style={{ fontSize: "9px", letterSpacing: "0.18em", color: "var(--aire-text-2)", marginBottom: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Signals detected
            </p>
            {audit.trends.map((t, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--aire-text)", fontWeight: 600 }}>{t.signal}</div>
                <div style={{ fontSize: "11px", color: "var(--aire-text-2)" }}>{t.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Audience Demographics + Top Posts */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {insights.demographics && (
          <div
            style={{
              background: "var(--aire-card)",
              border: "1px solid var(--aire-border)",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-text-2)", textTransform: "uppercase", fontWeight: 600 }}>
                Audience
              </span>
              <div style={{ flex: 1, height: "1px", background: "var(--aire-border)" }} />
              <span
                className="metric-number"
                style={{ fontSize: "13px", color: "var(--aire-text)", fontWeight: 600 }}
              >
                {insights.demographics.totalFollowers.toLocaleString()}{" "}
                <span style={{ fontFamily: "inherit", fontSize: "10px", color: "var(--aire-muted)", fontWeight: 400, letterSpacing: "0.04em" }}>
                  followers
                </span>
              </span>
            </div>

            <p style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-text-2)", marginBottom: "6px", textTransform: "uppercase", fontWeight: 600 }}>
              Age
            </p>
            <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
              {Object.entries(insights.demographics.age).slice(0, 5).map(([range, pct]) => (
                <div key={range} style={{ flex: pct, minWidth: "40px" }}>
                  <div style={{ background: "var(--aire-coral)", height: "20px", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "10px", color: "var(--aire-ink)", fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--aire-muted)", textAlign: "center", marginTop: "3px", letterSpacing: "0.06em" }}>{range}</div>
                </div>
              ))}
            </div>

            {insights.demographics.topCities.length > 0 && (
              <>
                <p style={{ fontSize: "9px", letterSpacing: "0.16em", color: "var(--aire-text-2)", marginBottom: "8px", textTransform: "uppercase", fontWeight: 600 }}>
                  Top cities
                </p>
                {insights.demographics.topCities.slice(0, 4).map(c => (
                  <div key={c.city} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--aire-text)", marginBottom: "4px" }}>
                    <span>{c.city}</span>
                    <span style={{ color: "var(--aire-muted)", fontVariantNumeric: "tabular-nums" }}>{c.count.toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {audit.topPosts.length > 0 && (
          <div
            style={{
              background: "var(--aire-card)",
              border: "1px solid var(--aire-border)",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-text-2)", marginBottom: "12px", textTransform: "uppercase", fontWeight: 600 }}>
              Top 3 posts
            </p>
            {audit.topPosts.slice(0, 3).map((p, i) => (
              <div key={p.postId} style={{ paddingBottom: "10px", marginBottom: "10px", borderBottom: i < 2 ? "1px solid var(--aire-border)" : "none" }}>
                <p style={{ fontSize: "11px", color: "var(--aire-text)", lineHeight: 1.5, marginBottom: "6px" }}>
                  {p.caption}…
                </p>
                <div style={{ display: "flex", gap: "10px", fontSize: "10px", color: "var(--aire-muted)", letterSpacing: "0.04em", alignItems: "center" }}>
                  <span
                    style={{
                      color: "var(--aire-coral-deep)",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {(p.engagementRate * 100).toFixed(1)}%
                  </span>
                  <span>{p.reach.toLocaleString()} reach</span>
                  <span>{p.engagement} engagement</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
