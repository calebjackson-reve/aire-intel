"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Mission Control — the Home / identity of Caleb OS (Sprint 1, 2026-06-29).
//
// A calm morning brief, NOT a dashboard. It is a READ-ONLY projection:
//   - reads GET /api/mission (the 3 ranked moves + meta) and
//     GET /api/brief-signals (rate + owe-people) — and WRITES NOTHING.
//   - shows only TRUE signals (honesty / design constitution P10). There is no
//     "hours returned" line: that metric has no source of truth, so it's absent.
//
// Design law honored here:
//   - One-Orange Law: the ONLY orange fill on the page is "Yes — Handle It".
//   - Ambient, not announced: no process narration; a quiet skeleton while loading.
//   - "Yes — Handle It" ROUTES into the Going-Cold workflow — it never sends.
//   - Fraunces (--font-display) for the greeting; Hauora (--font-ui) for the rest.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import LogDealModal from "@/components/LogDealModal";

interface Move {
  rank: 1 | 2 | 3;
  type: "call" | "text" | "email" | "post" | "task";
  title: string;
  why: string;
}
interface MissionResp {
  greeting: string;
  intro?: string;
  moves: Move[];
  meta: { coldCount: number; hotCount: number; underContractCount: number };
}
interface SignalsResp {
  rate: { message: string; direction: "up" | "down" | "flat"; delta: number } | null;
  owe: { count: number; names: string[] } | null;
}
interface BrainRisk {
  entityId: string;
  label: string;
  risk: { band: "HIGH" | "MED" | "LOW"; summary: string; evidenceCount: number } | null;
}
interface BrainResp {
  atRisk: BrainRisk[];
  computed: boolean;
}
interface ScoreResp {
  scores: Array<{ engineVersion: string; graded: number; confirmed: number; incorrect: number; openPredictions: number; hitRate: number | null }>;
}

// Greeting computed locally so the identity ("Good morning, Caleb.") paints
// instantly — before the AI mission resolves.
function localGreeting(): string {
  const h = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }),
    10,
  );
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// "Sarah is waiting" / "Sarah and 2 others are waiting" — never an invented deadline.
function oweLine(owe: NonNullable<SignalsResp["owe"]>): string {
  const [first] = owe.names;
  if (owe.count === 1) return `${first ?? "Someone"} is waiting on a reply.`;
  const others = owe.count - 1;
  return `${first} and ${others} other${others > 1 ? "s" : ""} are waiting on a reply.`;
}

export default function MissionControl() {
  const router = useRouter();
  const [mission, setMission] = useState<MissionResp | null>(null);
  const [signals, setSignals] = useState<SignalsResp | null>(null);
  const [brain, setBrain] = useState<BrainResp | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [dealOpen, setDealOpen] = useState(false);
  const greeting = mission?.greeting || localGreeting();

  useEffect(() => {
    fetch("/api/mission").then((r) => r.json()).then(setMission).catch(() => setMission(null));
    fetch("/api/brief-signals").then((r) => r.json()).then(setSignals).catch(() => setSignals(null));
    // The Brain's derived read — comes ONLY through the consumer port.
    fetch("/api/brain/intelligence").then((r) => r.json()).then(setBrain).catch(() => setBrain(null));
    fetch("/api/brain/scorecard").then((r) => r.json()).then(setScore).catch(() => setScore(null));
  }, []);

  // The Brain's self-grade — honest at low n: show the count it's graded, and only
  // a hit-rate percentage once enough predictions have been decided to mean something.
  const v1 = score?.scores?.find((s) => s.engineVersion === "belief-engine-v1");
  const decided = v1 ? v1.confirmed + v1.incorrect : 0;
  const selfGradeLine = !v1 || v1.graded === 0
    ? ""
    : decided >= 5
      ? `${v1.engineVersion} · ${Math.round((v1.hitRate ?? 0) * 100)}% of ${decided} predictions held up`
      : `${v1.engineVersion} · ${v1.graded} prediction${v1.graded === 1 ? "" : "s"} graded so far`;

  // Re-enable the global "Log Deal" quick action / "D" shortcut on Home
  // (TopNav + Topbar dispatch this event; nothing was listening before).
  useEffect(() => {
    const open = () => setDealOpen(true);
    document.addEventListener("aire:open-log-deal", open);
    return () => document.removeEventListener("aire:open-log-deal", open);
  }, []);

  const coldCount = mission?.meta?.coldCount ?? 0;
  const moveCount = mission?.moves?.length ?? 0;
  const loading = mission === null;

  // Forward-leverage line — the honest replacement for "hours returned".
  const leverageLine = loading
    ? ""
    : moveCount > 0
      ? `${moveCount} move${moveCount > 1 ? "s" : ""} teed up so you don't have to decide where to start.`
      : "Pipeline's quiet — a good morning to get ahead.";

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <LogDealModal open={dealOpen} onClose={() => setDealOpen(false)} onSaved={() => setDealOpen(false)} />

      <div className="mc-wrap">
        <div className="mc-brief">

          {/* Greeting — instant identity, Fraunces */}
          <h1 className="mc-greeting">{greeting}, Caleb.</h1>
          {leverageLine && <p className="mc-leverage">{leverageLine}</p>}

          {/* True signals — quiet lines, no cards. Each renders only when real. */}
          <div className="mc-signals">
            {signals?.rate && <p className="mc-signal">{signals.rate.message}</p>}
            {signals?.owe && <p className="mc-signal">{oweLine(signals.owe)}</p>}
            {coldCount > 0 && (
              <p className="mc-signal">
                {coldCount} relationship{coldCount > 1 ? "s are" : " is"} slipping past your cadence.
              </p>
            )}
          </div>

          {/* The Brain noticed — derived intelligence, read only through the consumer port.
              Each line is a reproducible belief; provenance ("from N remembered signals")
              keeps it honest. Confidence is a register, never a number (P10). */}
          {brain && brain.atRisk.length > 0 && (
            <div className="mc-brain">
              <span className="mc-brain-eyebrow">The Brain noticed</span>
              <ul className="mc-brain-list">
                {brain.atRisk.slice(0, 2).map((r) => (
                  <li key={r.entityId} className={`mc-brain-item band-${r.risk?.band?.toLowerCase()}`}>
                    <span className="mc-brain-summary">{r.risk?.summary}</span>
                    {r.risk && (
                      <span className="mc-brain-prov">
                        from {r.risk.evidenceCount} remembered signal{r.risk.evidenceCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {selfGradeLine && <span className="mc-brain-grade">{selfGradeLine}</span>}
            </div>
          )}

          {/* Three things unlock today */}
          {loading ? (
            <div className="mc-skeleton" aria-hidden>
              <span className="mc-pulse" />
            </div>
          ) : moveCount > 0 ? (
            <div className="mc-moves">
              <h2 className="mc-moves-title">
                {moveCount === 3 ? "Three things unlock today." : `${moveCount} thing${moveCount > 1 ? "s" : ""} unlock${moveCount > 1 ? "" : "s"} today.`}
              </h2>
              <ol className="mc-move-list">
                {mission!.moves.map((m, i) => (
                  <li key={i} className="mc-move">
                    <span className="mc-move-n">{i + 1}</span>
                    <span className="mc-move-body">
                      <span className="mc-move-h">{m.title}</span>
                      {m.why && <span className="mc-move-why">{m.why}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* The ONE orange element — routes into the Going-Cold workflow, never sends */}
          <div className="mc-action">
            <button className="mc-yes" onClick={() => router.push("/people?lens=going-cold")}>
              Yes — Handle It <ArrowRight size={17} strokeWidth={2.4} />
            </button>
            {coldCount > 0 && (
              <span className="mc-action-sub">
                Start with the {coldCount} slipping relationship{coldCount > 1 ? "s" : ""}.
              </span>
            )}
          </div>

        </div>
      </div>

      <style>{`
        .mc-wrap { padding: clamp(48px, 12vh, 120px) 24px 80px; display: flex; justify-content: center; }
        .mc-brief {
          width: 100%; max-width: 600px;
          animation: mc-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes mc-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        .mc-greeting {
          font-family: var(--font-display);
          font-size: var(--type-display-hero-size);
          line-height: var(--type-display-hero-lh);
          color: var(--ink);
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0;
        }
        .mc-leverage {
          font-family: var(--font-ui);
          font-size: var(--type-body-md-size);
          color: var(--ink-muted);
          margin: 12px 0 0;
        }

        .mc-signals { margin-top: 28px; display: flex; flex-direction: column; gap: 10px; }
        .mc-signal {
          font-family: var(--font-ui);
          font-size: var(--type-ui-size);
          line-height: 1.5;
          color: var(--ink-2);
          margin: 0;
          padding-left: 16px;
          position: relative;
        }
        .mc-signal::before {
          content: ""; position: absolute; left: 0; top: 0.62em;
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--ink-faint);
        }

        .mc-brain { margin-top: 34px; }
        .mc-brain-eyebrow {
          font-family: var(--font-ui); font-size: 11px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-faint);
        }
        .mc-brain-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .mc-brain-item {
          position: relative; padding-left: 16px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .mc-brain-item::before {
          content: ""; position: absolute; left: 0; top: 0.5em;
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--ink-faint);
        }
        .mc-brain-item.band-high::before { background: var(--accent); }
        .mc-brain-summary { font-family: var(--font-ui); font-size: var(--type-ui-size); line-height: 1.5; color: var(--ink-2); }
        .mc-brain-prov { font-family: var(--font-ui); font-size: var(--type-caption-size); color: var(--ink-faint); }
        .mc-brain-grade {
          display: block; margin-top: 14px;
          font-family: var(--font-ui); font-size: var(--type-caption-size);
          color: var(--ink-faint); letter-spacing: 0.01em;
        }

        .mc-moves { margin-top: 40px; }
        .mc-moves-title {
          font-family: var(--font-display);
          font-size: var(--type-display-3-size);
          line-height: var(--type-display-3-lh);
          color: var(--ink);
          font-weight: 500;
          margin: 0 0 16px;
        }
        .mc-move-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        .mc-move { display: flex; gap: 14px; align-items: baseline; }
        .mc-move-n {
          font-family: var(--font-ui); font-size: 12px; font-weight: 600;
          color: var(--ink-faint); min-width: 14px;
        }
        .mc-move-body { display: flex; flex-direction: column; gap: 2px; }
        .mc-move-h { font-family: var(--font-ui); font-size: var(--type-body-md-size); font-weight: 600; color: var(--ink); }
        .mc-move-why { font-family: var(--font-ui); font-size: var(--type-body-sm-size); color: var(--ink-muted); line-height: 1.5; }

        .mc-action { margin-top: 44px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .mc-yes {
          display: inline-flex; align-items: center; gap: 9px;
          font-family: var(--font-ui); font-size: 16px; font-weight: 600;
          color: var(--on-accent); background: var(--accent);
          border: none; border-radius: var(--radius-lg);
          padding: 15px 26px; cursor: pointer;
          box-shadow: var(--shadow-glow-orange, 0 6px 22px rgba(251,122,1,0.32));
          transition: transform 160ms ease-out, box-shadow 160ms ease-out;
        }
        .mc-yes:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(251,122,1,0.40); }
        .mc-yes:active { transform: translateY(0); }
        .mc-action-sub { font-family: var(--font-ui); font-size: var(--type-caption-size); color: var(--ink-muted); }

        .mc-skeleton { margin-top: 40px; height: 96px; display: flex; align-items: center; }
        .mc-pulse {
          width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
          animation: mc-breathe 1.6s ease-in-out infinite;
        }
        @keyframes mc-breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
