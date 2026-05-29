"use client";

import { useEffect, useState } from "react";

interface StageRow {
  stage: string;
  label: string;
  deals: number;
  volume: number;
  prob: number;
  weighted: number;
}

interface MonthPoint {
  month: string;
  closed: number;
  projected: number;
  future: boolean;
}

interface Projection {
  year: number;
  goalGci: number;
  closed: { gci: number; volume: number; units: number; avgGci: number };
  projectedEoy: number;
  gap: number;
  dealsToGoal: number;
  weightedPipeline: number;
  pipeline: { gciUnweighted: number; volume: number; deals: number };
  stages: StageRow[];
  monthly: MonthPoint[];
}

const STAGE_DOT: Record<string, string> = {
  new_lead: "var(--blue)",
  active: "#fff",
  showing: "var(--cream)",
  under_contract: "var(--coral)",
};

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function ProjectionPage() {
  const [data, setData] = useState<Projection | null>(null);
  const [period, setPeriod] = useState<"Quarter" | "Year" | "All-time">("Year");

  useEffect(() => {
    fetch("/api/projection")
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <header className="pj-cmd"><h1>Commission Projection</h1></header>
        <div className="pj-body">
          <p style={{ color: "var(--white-40)", fontSize: "13px" }}>Loading projection…</p>
        </div>
      </>
    );
  }

  const { closed, goalGci, projectedEoy, weightedPipeline, gap, dealsToGoal, pipeline, stages, monthly } = data;
  const pctToGoal = goalGci > 0 ? Math.round((projectedEoy / goalGci) * 100) : 0;

  // Hero stack widths (proportion of goal)
  const closedPct = goalGci > 0 ? Math.min(100, (closed.gci / goalGci) * 100) : 0;
  const weightedPct = goalGci > 0 ? Math.min(100 - closedPct, (weightedPipeline / goalGci) * 100) : 0;
  const gapPct = Math.max(0, 100 - closedPct - weightedPct);

  const chartMax = Math.max(1, ...monthly.map(m => Math.max(m.closed, m.projected)));

  const underContract = stages.find(s => s.stage === "under_contract");
  const showing = stages.find(s => s.stage === "showing");

  return (
    <>
      <header className="pj-cmd">
        <h1>Commission Projection</h1>
        <div className="pj-seg">
          {(["Quarter", "Year", "All-time"] as const).map(p => (
            <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </header>

      <div className="pj-body">
        {/* HERO goal */}
        <section className="glass pad pj-hero">
          <h3 className="pj-sech">{data.year} toward $500M producer track</h3>
          <p className="pj-secs">
            Goal {fmtK(goalGci)} GCI · pacing to <span style={{ color: "var(--aire-mint)" }}>{fmtK(projectedEoy)} projected</span>
          </p>
          <div className="pj-heronums">
            <div className="pj-hn">
              <div className="l">Closed GCI</div>
              <div className="v" style={{ color: "var(--aire-mint)" }}>{fmtK(closed.gci)}</div>
              <div className="d" style={{ color: "var(--aire-mint)" }}>{closed.units} units · {fmtK(closed.volume)} vol</div>
            </div>
            <div className="pj-hn">
              <div className="l">Projected EOY</div>
              <div className="v" style={{ color: "var(--cream)" }}>{fmtK(projectedEoy)}</div>
              <div className="d" style={{ color: "var(--white-40)" }}>closed + weighted pipeline</div>
            </div>
            <div className="pj-hn">
              <div className="l">Goal</div>
              <div className="v">{fmtK(goalGci)}</div>
              <div className="d" style={{ color: "var(--coral)" }}>{fmtK(gap)} gap to projection</div>
            </div>
          </div>
          <div className="pj-stack">
            <span style={{ width: `${closedPct}%`, background: "var(--aire-mint)" }} />
            <span style={{ width: `${weightedPct}%`, background: "var(--cream)" }} />
            <span style={{ width: `${gapPct}%`, background: "rgba(238,129,114,.5)" }} />
          </div>
          <div className="pj-legend">
            <div className="pj-lg"><span className="sw" style={{ background: "var(--aire-mint)" }} />Closed <b>{fmtK(closed.gci)}</b></div>
            <div className="pj-lg"><span className="sw" style={{ background: "var(--cream)" }} />Weighted pipeline <b>{fmtK(weightedPipeline)}</b></div>
            <div className="pj-lg"><span className="sw" style={{ background: "rgba(238,129,114,.7)" }} />Gap to goal <b>{fmtK(gap)}</b></div>
          </div>
        </section>

        {/* tiles */}
        <div className="pj-tiles">
          <div className="pj-tile">
            <div className="l">Closed GCI</div>
            <div className="v" style={{ color: "var(--aire-mint)" }}>{fmtK(closed.gci)}</div>
            <div className="s">{closed.units} deals · avg {fmtK(closed.avgGci)}</div>
          </div>
          <div className="pj-tile">
            <div className="l">Pipeline GCI</div>
            <div className="v">{fmtK(pipeline.gciUnweighted)}</div>
            <div className="s">unweighted · {pipeline.deals} active</div>
          </div>
          <div className="pj-tile">
            <div className="l">Weighted forecast</div>
            <div className="v" style={{ color: "var(--cream)" }}>{fmtK(weightedPipeline)}</div>
            <div className="s">by stage probability</div>
          </div>
          <div className="pj-tile">
            <div className="l">Deals to goal</div>
            <div className="v" style={{ color: "var(--coral)" }}>{dealsToGoal}</div>
            <div className="s">at avg {fmtK(closed.avgGci)} GCI</div>
          </div>
        </div>

        <div className="pj-cols">
          {/* monthly chart */}
          <section className="glass pad">
            <h3 className="pj-sech">GCI by month</h3>
            <p className="pj-secs">Closed (mint) · projected (cream)</p>
            <div className="pj-chart">
              {monthly.map(m => {
                const val = m.future ? m.projected : m.closed;
                const h = Math.round((val / chartMax) * 128) + 8;
                return (
                  <div key={m.month} className={`pj-mo${m.future ? " future" : ""}`}>
                    <div className="bar" style={{ height: `${h}px`, background: m.future ? "var(--cream)" : "var(--aire-mint)", opacity: m.future ? 0.55 : 1 }} />
                    <div className="ml">{m.month}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* stage table */}
          <section className="glass pad">
            <h3 className="pj-sech">Pipeline by stage</h3>
            <p className="pj-secs">Weighted GCI = volume × 3% × close probability</p>
            <div className="pj-strow h">
              <span>Stage</span><span className="num">Deals</span><span className="num">Volume</span><span className="prob">Prob</span><span className="wt">Weighted</span>
            </div>
            {stages.map(s => (
              <div className="pj-strow" key={s.stage}>
                <span className="sn"><span className="sd" style={{ background: STAGE_DOT[s.stage] }} />{s.label}</span>
                <span className="num">{s.deals}</span>
                <span className="num">{fmtK(s.volume)}</span>
                <span className="prob">{Math.round(s.prob * 100)}%</span>
                <span className="wt">{fmtK(s.weighted)}</span>
              </div>
            ))}
            <div className="pj-strow tot">
              <span className="sn">Weighted pipeline</span>
              <span className="num">{pipeline.deals}</span>
              <span className="num">{fmtK(pipeline.volume)}</span>
              <span className="prob" />
              <span className="wt">{fmtK(weightedPipeline)}</span>
            </div>
          </section>
        </div>

        <section className="glass pad" style={{ marginTop: "22px" }}>
          <div className="pj-take">
            <span className="q">&ldquo;</span>
            <div className="t">
              <b>AIRE&apos;s read:</b> You&apos;re pacing to {fmtK(projectedEoy)} — {pctToGoal}% of goal — on current pipeline.
              {underContract && underContract.deals > 0 && (
                <> Closing the <b>{underContract.deals} under-contract {underContract.deals === 1 ? "deal" : "deals"}</b> alone lands {fmtK(underContract.weighted)}.</>
              )}
              {dealsToGoal > 0 && (
                <> To clear {fmtK(goalGci)}, add <b>{dealsToGoal} more {dealsToGoal === 1 ? "closing" : "closings"}</b> this year{showing && showing.deals > 0 ? <>, or convert your <b>{showing.deals} Showing-stage {showing.deals === 1 ? "buyer" : "buyers"}</b> to contract</> : null}.</>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
