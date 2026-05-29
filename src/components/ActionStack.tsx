"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LeadPreview {
  id: string;
  name: string;
  lastContactDate?: string | null;
  stage?: string;
  pricePoint?: number | null;
  address?: string | null;
  nextActionNote?: string | null;
}

interface ActionsData {
  coldFollowups: { count: number; preview: LeadPreview[] };
  weeklyPost: { generated: boolean; lastGeneratedAt: string | null; preview: string | null };
  sphereCheckins: { count: number; preview: LeadPreview[] };
  contractMilestones: { count: number; preview: LeadPreview[] };
}

type SectionColor = "coral" | "cream" | "mint";

interface ColorTokens {
  /** CSS color for the left accent stripe + count text */
  stripe: string;
  /** Status dot for the "ready" state */
  dotReady: string;
  /** True if the primary CTA should use the coral pill */
  ctaCoral: boolean;
}

const COLORS: Record<SectionColor, ColorTokens> = {
  coral: {
    stripe: "var(--aire-coral)",
    dotReady: "var(--aire-coral)",
    ctaCoral: true,
  },
  cream: {
    stripe: "var(--aire-cream)",
    dotReady: "var(--aire-cream)",
    ctaCoral: false,
  },
  mint: {
    stripe: "var(--aire-mint)",
    dotReady: "var(--aire-mint)",
    ctaCoral: false,
  },
};

interface CardProps {
  title: string;
  status: "ready" | "pending" | "done" | "empty";
  count?: number;
  detail: string;
  preview?: React.ReactNode;
  primaryLabel: string;
  primaryHref?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  color: SectionColor;
}

function ActionCard({
  title,
  status,
  count,
  detail,
  preview,
  primaryLabel,
  primaryHref,
  onPrimary,
  secondaryLabel,
  secondaryHref,
  color,
}: CardProps) {
  const tokens = COLORS[color];

  const statusDot =
    status === "ready"
      ? tokens.dotReady
      : status === "pending"
        ? "var(--aire-cream)"
        : status === "done"
          ? "var(--aire-mint)"
          : "var(--aire-muted)";

  const isEmpty = status === "empty";
  const primaryClass = isEmpty
    ? "btn-ghost"
    : tokens.ctaCoral
      ? "btn-coral"
      : "btn-primary";

  const primaryStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "10px",
    letterSpacing: "0.14em",
    padding: "9px 14px",
    textDecoration: "none",
    flex: 1,
    textAlign: "center",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: isEmpty ? "default" : "pointer",
  };

  return (
    <div
      style={{
        background: "var(--aire-card)",
        border: "1px solid var(--aire-border)",
        borderLeft: `4px solid ${tokens.stripe}`,
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: "188px",
        transition: "box-shadow 320ms var(--ease-apple), transform 320ms var(--ease-apple)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: statusDot,
              animation: status === "ready" ? "pulse-dot 2s ease-in-out infinite" : "none",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "11px",
              letterSpacing: "0.16em",
              color: "var(--aire-text-2)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {title}
          </span>
        </div>
        {count !== undefined && count > 0 && (
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: tokens.stripe,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </span>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <p
          style={{
            fontSize: "13px",
            color: "var(--aire-text)",
            lineHeight: 1.5,
            marginBottom: "8px",
          }}
        >
          {detail}
        </p>
        {preview && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--aire-muted)",
              fontStyle: "italic",
              lineHeight: 1.5,
              marginTop: "8px",
            }}
          >
            {preview}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "auto" }}>
        {primaryHref ? (
          <Link href={primaryHref} className={primaryClass} style={primaryStyle}>
            {primaryLabel}
          </Link>
        ) : (
          <button
            onClick={onPrimary}
            disabled={isEmpty}
            className={primaryClass}
            style={primaryStyle}
          >
            {primaryLabel}
          </button>
        )}
        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              padding: "9px 10px",
              color: "var(--aire-muted)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ActionStack() {
  const [data, setData] = useState<ActionsData | null>(null);
  const [paragonConnected, setParagonConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/actions").then(r => r.json()).then(setData).catch(() => {});
    // Pre-check Paragon connection so Weekly Post knows whether to drive to
    // /create-post (data available) or /settings#paragon (needs key first).
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, { set: boolean }>) => {
        setParagonConnected(!!s["PARAGON_API_KEY"]?.set);
      })
      .catch(() => setParagonConnected(false));
  }, []);

  if (!data) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ minHeight: "188px", borderRadius: "16px" }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "20px" }}>
      <p
        style={{
          fontSize: "10px",
          letterSpacing: "0.20em",
          color: "var(--aire-text-2)",
          textTransform: "uppercase",
          marginBottom: "14px",
          fontWeight: 600,
        }}
      >
        Do it now — one click
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {/* Card 1: Cold lead follow-ups */}
        <ActionCard
          title="Cold Follow-Ups"
          status={data.coldFollowups.count > 0 ? "ready" : "done"}
          count={data.coldFollowups.count}
          color="coral"
          detail={
            data.coldFollowups.count > 0
              ? `${data.coldFollowups.count} contacts cold 5+ days. AI will draft a personalized message for each.`
              : "All caught up. Pipeline is warm."
          }
          preview={
            data.coldFollowups.preview.slice(0, 3).map(l => l.name).join(" · ") || null
          }
          primaryLabel={data.coldFollowups.count > 0 ? "REVIEW & SEND" : "ALL DONE"}
          primaryHref={data.coldFollowups.count > 0 ? "/contacts?cold=5" : undefined}
        />

        {/* Card 2: Weekly market post — pre-check that Paragon is connected
            before driving to /create-post (which would otherwise hit an
            empty-data state). When disconnected, route the user to Settings. */}
        <ActionCard
          title="Weekly Post"
          status={data.weeklyPost.generated ? "done" : paragonConnected === false ? "empty" : "pending"}
          color="cream"
          detail={
            data.weeklyPost.generated
              ? "This week's market post is live. Generated " + new Date(data.weeklyPost.lastGeneratedAt!).toLocaleDateString() + "."
              : paragonConnected === false
                ? "Connect Paragon MLS first so weekly posts pull live BR market data."
                : "Generate this week's market update with BR data pre-loaded."
          }
          preview={
            data.weeklyPost.generated
              ? data.weeklyPost.preview
              : paragonConnected === false
                ? "MLS data unavailable — Paragon disconnected"
                : "BR median · DOM · 30-yr rate · YoY"
          }
          primaryLabel={
            data.weeklyPost.generated
              ? "VIEW POST"
              : paragonConnected === false
                ? "CONNECT PARAGON →"
                : "GENERATE NOW"
          }
          primaryHref={
            data.weeklyPost.generated
              ? "/social"
              : paragonConnected === false
                ? "/settings#paragon"
                : "/create-post?type=market_update"
          }
          secondaryLabel={data.weeklyPost.generated || paragonConnected === false ? undefined : "SKIP"}
          secondaryHref={data.weeklyPost.generated || paragonConnected === false ? undefined : "#"}
        />

        {/* Card 3: Sphere quarterly check-ins */}
        <ActionCard
          title="Sphere Check-Ins"
          status={data.sphereCheckins.count > 0 ? "ready" : "done"}
          count={data.sphereCheckins.count}
          color="cream"
          detail={
            data.sphereCheckins.count > 0
              ? `${data.sphereCheckins.count} sphere contacts haven't heard from you in 90+ days.`
              : "Sphere is well-maintained."
          }
          preview={
            data.sphereCheckins.preview.slice(0, 3).map(l => l.name).join(" · ") || "Past clients · referral partners"
          }
          primaryLabel={data.sphereCheckins.count > 0 ? "START SEQUENCE" : "ALL DONE"}
          primaryHref={data.sphereCheckins.count > 0 ? "/follow-up?type=sphere" : undefined}
        />

        {/* Card 4: Contract milestones */}
        <ActionCard
          title="Contract Check-Ins"
          status={data.contractMilestones.count > 0 ? "ready" : "empty"}
          count={data.contractMilestones.count}
          color="mint"
          detail={
            data.contractMilestones.count > 0
              ? `${data.contractMilestones.count} under contract. Milestone touches: inspection, appraisal, closing.`
              : "No active contracts. When you have one, milestone check-ins auto-appear here."
          }
          preview={
            data.contractMilestones.preview.slice(0, 3).map(l => l.name).join(" · ") || null
          }
          primaryLabel={data.contractMilestones.count > 0 ? "REVIEW" : "NONE ACTIVE"}
          primaryHref={data.contractMilestones.count > 0 ? "/pipeline" : undefined}
        />
      </div>
    </div>
  );
}
