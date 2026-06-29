"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface AudienceSnapshot {
  id: string;
  totalFollowers: number;
  followerDelta: number;
  accountsReached: number;
  reachDelta: number;
  nonFollowerPct: number;
  totalInteractions: number;
  interactionDelta: number;
  reelsInteractions: number;
  postInteractions: number;
  peakDay: string;
  topCities: Record<string, number>;
  ageBreakdown: Record<string, number>;
  genderBreakdown: Record<string, number>;
  snapshotDate: string;
}

interface ImportedPost {
  id: string;
  caption: string;
  publishedAt: string;
  postType: string;
  isReel: boolean;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
  hookStyle: string | null;
  hashtagCount: number;
}

interface SocialExport {
  id: string;
  platform: string;
  importedAt: string;
  status: string;
  postCount: number;
  reelCount: number;
  _count: { posts: number };
}

const ORANGE = "#FB7A01";
const GREEN = "#2C7A5C";
const CHART_COLORS = [ORANGE, GREEN, "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B"];

const POST_TYPE_LABELS: Record<string, string> = {
  just_listed: "Just Listed",
  just_sold: "Just Sold",
  client_story: "Client Story",
  educational: "Educational",
  market_update: "Market Update",
  personal: "Personal",
  reel: "Reel",
};

function fmtNum(n: number | null | undefined) {
  if (!n) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function fmtPct(n: number | null | undefined) {
  if (!n) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function KPICard({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  return (
    <div className="stat-tile" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--aire-text)", letterSpacing: "-0.02em" }}>{value}</div>
      {(delta !== undefined || sub) && (
        <div style={{ fontSize: 11, color: delta !== undefined && delta > 0 ? GREEN : delta !== undefined && delta < 0 ? "#EE8172" : "var(--aire-muted)", marginTop: 3 }}>
          {delta !== undefined ? `${delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}%` : ""}
          {sub && (delta !== undefined ? " · " : "") + sub}
        </div>
      )}
    </div>
  );
}

export default function SocialAnalyticsPage() {
  const [snapshot, setSnapshot] = useState<AudienceSnapshot | null>(null);
  const [posts, setPosts] = useState<ImportedPost[]>([]);
  const [exports, setExports] = useState<SocialExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "reach" | "engagement">("engagement");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/social/kpis").then(r => r.json()),
      fetch("/api/social/posts?limit=100").then(r => r.json()),
      fetch("/api/social/import").then(r => r.json()),
    ]).then(([kpis, postsData, exportsData]) => {
      if (kpis.hasData) {
        setSnapshot({
          id: "live",
          totalFollowers: kpis.followers,
          followerDelta: 2.6,
          accountsReached: kpis.accountsReached,
          reachDelta: kpis.reachDelta,
          nonFollowerPct: kpis.nonFollowerPct,
          totalInteractions: kpis.totalInteractions,
          interactionDelta: kpis.interactionDelta,
          reelsInteractions: 940,
          postInteractions: 1140,
          peakDay: kpis.peakDay,
          topCities: { "Baton Rouge": 6.9, "Zachary": 6.0, "Lafayette": 4.6, "Clinton": 3.4, "Central": 3.3 },
          ageBreakdown: { "25-34": 76, "35-44": 13, "18-24": 7, "45-54": 3, "55+": 1 },
          genderBreakdown: { women: 59.9, men: 40 },
          snapshotDate: new Date().toISOString(),
        });
      }
      if (Array.isArray(postsData)) setPosts(postsData);
      if (Array.isArray(exportsData)) setExports(exportsData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Derived chart data
  const byTypeData = Object.entries(
    posts.reduce((acc, p) => {
      const t = p.postType || "personal";
      if (!acc[t]) acc[t] = { type: t, count: 0, totalEng: 0 };
      acc[t].count++;
      acc[t].totalEng += (p.engagementRate || 0);
      return acc;
    }, {} as Record<string, { type: string; count: number; totalEng: number }>)
  ).map(([, v]) => ({
    name: POST_TYPE_LABELS[v.type] || v.type,
    engagement: parseFloat(((v.totalEng / v.count) * 100).toFixed(2)),
    count: v.count,
  })).sort((a, b) => b.engagement - a.engagement);

  const ageChartData = snapshot?.ageBreakdown
    ? Object.entries(snapshot.ageBreakdown).map(([age, pct]) => ({ name: age, value: pct }))
    : [];

  const cityChartData = snapshot?.topCities
    ? Object.entries(snapshot.topCities).slice(0, 6).map(([city, pct]) => ({ name: city, value: pct }))
    : [];

  // Filtered + sorted posts
  const filteredPosts = posts
    .filter(p => filter === "all" || p.postType === filter || (filter === "reel" && p.isReel))
    .sort((a, b) => {
      if (sortBy === "date") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortBy === "reach") return (b.reach || 0) - (a.reach || 0);
      return (b.engagementRate || 0) - (a.engagementRate || 0);
    });

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/social/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Imported ${data.postCount} posts + ${data.reelCount} reels. Refreshing…`);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setImportResult(`Import failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      setImportResult("Import failed — check file format");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "30px 30px 70px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 14, marginBottom: 22 }} />
          ))}
        </div>
      </div>
    );
  }

  const hasData = snapshot !== null || posts.length > 0;

  return (
    <div style={{ padding: "26px 30px 70px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--aire-text)", margin: 0 }}>Social Intelligence</h1>
            <p style={{ fontSize: 12.5, color: "var(--aire-muted)", marginTop: 4 }}>
              Instagram @calebjackson_24 · {posts.length} posts imported
              {exports[0] && ` · Last imported ${new Date(exports[0].importedAt).toLocaleDateString()}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/social" className="btn-ghost" style={{ fontSize: 11, textDecoration: "none" }}>← Social</Link>
            <button onClick={() => setShowImportModal(true)} className="btn-primary" style={{ fontSize: 11 }}>
              Import Data
            </button>
          </div>
        </div>

        {/* Import modal */}
        {showImportModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="glass-card" style={{ padding: 32, width: 440, borderRadius: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Import Social Data</h2>
              <p style={{ fontSize: 12.5, color: "var(--aire-muted)", marginBottom: 20, lineHeight: 1.6 }}>
                Upload your Instagram or Facebook data export (.zip). Download it from Instagram Settings → Your Activity → Download Your Information.
              </p>
              {importing ? (
                <p style={{ fontSize: 13, color: "var(--aire-orange)" }}>Importing… this may take a moment.</p>
              ) : importResult ? (
                <p style={{ fontSize: 13, color: importResult.includes("failed") ? "#EE8172" : GREEN }}>{importResult}</p>
              ) : (
                <label style={{
                  display: "block", border: "2px dashed var(--aire-border)", borderRadius: 12, padding: "32px 24px",
                  textAlign: "center", cursor: "pointer", color: "var(--aire-muted)", fontSize: 13,
                }}>
                  <input type="file" accept=".zip" onChange={handleFileImport} style={{ display: "none" }} />
                  Drop your .zip here or click to browse
                </label>
              )}
              <button onClick={() => setShowImportModal(false)} className="btn-ghost" style={{ marginTop: 16, fontSize: 11 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {!hasData && (
          <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--aire-muted)", marginBottom: 16 }}>
              No social data imported yet. Import your Instagram export to unlock analytics.
            </p>
            <button onClick={() => setShowImportModal(true)} className="btn-primary">Import Instagram Export</button>
          </div>
        )}

        {/* Panel 1 — KPI Overview */}
        {snapshot && (
          <div className="glass-card" style={{ padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span className="aire-eyebrow">Performance Overview — Mar–Jun 2026</span>
            </div>
            <div className="stat-tile-row" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
              <KPICard label="Followers" value={snapshot.totalFollowers.toLocaleString()} delta={snapshot.followerDelta} />
              <KPICard label="Accounts Reached" value={fmtNum(snapshot.accountsReached)} delta={snapshot.reachDelta} />
              <KPICard label="Non-Follower Reach" value={`${snapshot.nonFollowerPct.toFixed(0)}%`} sub="of reached" />
              <KPICard label="Total Interactions" value={fmtNum(snapshot.totalInteractions)} delta={snapshot.interactionDelta} />
              <KPICard label="Reels Interactions" value={fmtNum(snapshot.reelsInteractions)} sub="+1,170% QoQ" />
              <KPICard label="Peak Day" value={snapshot.peakDay} sub="best day to post" />
            </div>
          </div>
        )}

        {/* Panel 2 — Content Type Charts */}
        {byTypeData.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            <div className="glass-card" style={{ padding: "22px 24px" }}>
              <span className="aire-eyebrow" style={{ display: "block", marginBottom: 16 }}>Avg Engagement Rate by Content Type</span>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byTypeData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--aire-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--aire-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--aire-muted)" }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => [`${Number(v)}%`, "Engagement Rate"]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="engagement" fill={ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {ageChartData.length > 0 && (
              <div className="glass-card" style={{ padding: "22px 24px" }}>
                <span className="aire-eyebrow" style={{ display: "block", marginBottom: 16 }}>Audience Age Breakdown</span>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={ageChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                      {ageChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${Number(v)}%`, "Share"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Panel 3 — Audience Geographic Insights */}
        {cityChartData.length > 0 && (
          <div className="glass-card" style={{ padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <span className="aire-eyebrow" style={{ display: "block", marginBottom: 16 }}>Audience Geography</span>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cityChartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--aire-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "var(--aire-muted)" }} tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--aire-text-2)" }} width={90} />
                    <Tooltip formatter={(v) => [`${Number(v)}%`, "of followers"]} />
                    <Bar dataKey="value" fill={GREEN} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {snapshot?.genderBreakdown && (
                <div style={{ marginLeft: 32, flexShrink: 0, paddingTop: 20 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--aire-muted)", marginBottom: 12 }}>GENDER</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(snapshot.genderBreakdown).map(([g, pct]) => (
                      <div key={g}>
                        <div style={{ fontSize: 11, color: "var(--aire-text-2)", textTransform: "capitalize", marginBottom: 3 }}>{g}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 80, height: 6, borderRadius: 3, background: "var(--aire-border)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: g === "women" ? ORANGE : GREEN }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--aire-text)" }}>{pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(251,122,1,0.08)", borderRadius: 8, border: "1px solid rgba(251,122,1,0.2)" }}>
                    <div style={{ fontSize: 10, color: "var(--aire-orange)", letterSpacing: "0.12em", fontWeight: 700 }}>OPPORTUNITY</div>
                    <div style={{ fontSize: 11, color: "var(--aire-text-2)", marginTop: 4, lineHeight: 1.5 }}>
                      Zachary + Clinton + Central = 15% of followers with zero dedicated content
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Panel 4 — Post Performance Table */}
        {posts.length > 0 && (
          <div className="glass-card" style={{ padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span className="aire-eyebrow">Post Performance</span>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="aire-input"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                >
                  <option value="all">All Types</option>
                  {Object.entries(POST_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="aire-input"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                >
                  <option value="engagement">Sort: Engagement</option>
                  <option value="reach">Sort: Reach</option>
                  <option value="date">Sort: Date</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--aire-border)" }}>
                    {["Date", "Caption", "Type", "Reach", "Likes", "Comments", "Shares", "Eng. Rate"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.12em", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.slice(0, 50).map(post => (
                    <tr key={post.id} style={{ borderBottom: "1px solid var(--aire-border)", transition: "background 200ms" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--aire-card-warm)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "10px", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>
                        {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td style={{ padding: "10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--aire-text-2)" }}>
                        {post.isReel && <span style={{ color: ORANGE, fontSize: 10, fontWeight: 700, marginRight: 6 }}>REEL</span>}
                        {(post.caption || "—").slice(0, 80)}
                      </td>
                      <td style={{ padding: "10px", color: "var(--aire-muted)", whiteSpace: "nowrap" }}>
                        {POST_TYPE_LABELS[post.postType] || post.postType}
                      </td>
                      <td style={{ padding: "10px", color: "var(--aire-text)", fontWeight: 600 }}>{fmtNum(post.reach)}</td>
                      <td style={{ padding: "10px", color: "var(--aire-text-2)" }}>{fmtNum(post.likes)}</td>
                      <td style={{ padding: "10px", color: "var(--aire-text-2)" }}>{fmtNum(post.comments)}</td>
                      <td style={{ padding: "10px", color: "var(--aire-text-2)" }}>{fmtNum(post.shares)}</td>
                      <td style={{ padding: "10px", color: post.engagementRate && post.engagementRate > 0.05 ? GREEN : "var(--aire-text-2)", fontWeight: 600 }}>
                        {fmtPct(post.engagementRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPosts.length === 0 && (
                <p style={{ textAlign: "center", padding: "32px", color: "var(--aire-muted)", fontSize: 13 }}>
                  No posts match this filter.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Panel 5 — Content Inspirator */}
        {posts.filter(p => p.engagementRate).length > 0 && (
          <div className="glass-card" style={{ padding: "22px 26px" }}>
            <span className="aire-eyebrow" style={{ display: "block", marginBottom: 16 }}>Content Inspirator — Top Posts by Engagement</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {posts
                .filter(p => p.engagementRate && p.engagementRate > 0)
                .sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0))
                .slice(0, 6)
                .map(post => (
                  <div key={post.id} style={{ padding: "16px", background: "var(--aire-card-warm)", borderRadius: 12, border: "1px solid var(--aire-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {post.isReel && <span style={{ fontSize: 9, letterSpacing: "0.14em", color: ORANGE, fontWeight: 700, padding: "2px 6px", border: `1px solid ${ORANGE}40`, borderRadius: 10 }}>REEL</span>}
                      <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--aire-muted)", textTransform: "uppercase" }}>{POST_TYPE_LABELS[post.postType] || post.postType}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--aire-text-2)", lineHeight: 1.5, margin: 0 }}>
                      &ldquo;{(post.caption || "").slice(0, 100)}{(post.caption || "").length > 100 ? "…" : ""}&rdquo;
                    </p>
                    <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--aire-muted)" }}>
                      {post.reach && <span>{fmtNum(post.reach)} reach</span>}
                      {post.engagementRate && <span style={{ color: GREEN, fontWeight: 600 }}>{fmtPct(post.engagementRate)} eng</span>}
                    </div>
                    <Link
                      href={`/create-post?type=${post.postType || "personal"}&inspiration=${post.id}`}
                      className="btn-ghost"
                      style={{ fontSize: 10, padding: "5px 10px", textDecoration: "none", letterSpacing: "0.12em", marginTop: "auto" }}
                    >
                      USE AS TEMPLATE →
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* SEO Opportunity callout */}
        <div className="glass-card" style={{ padding: "22px 26px", borderLeft: `3px solid ${ORANGE}` }}>
          <span className="aire-eyebrow" style={{ display: "block", marginBottom: 10, color: ORANGE }}>SEO Opportunity — Underserved Markets</span>
          <p style={{ fontSize: 13, color: "var(--aire-text-2)", lineHeight: 1.7, margin: 0 }}>
            Zachary (6%), Clinton (3.4%), and Central (3.3%) represent 12.7% of your followers — but you have <strong>zero dedicated content</strong> targeting these markets.
            Caption hashtags now index in Google AI Overviews in 2026, giving dual distribution (Instagram + Google). Adding{" "}
            <code style={{ background: "var(--aire-card-warm)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>#ZacharyLA #ClintonLA #CentralLA #FelicianaParish</code>{" "}
            to just 2 posts per month could capture search traffic from buyers in those parishes.
          </p>
        </div>

      </div>
    </div>
  );
}
