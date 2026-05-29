"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardLabel, StatTile, Badge, useToast } from "@/components/ui";

interface ArmOutcome {
  count: number;
  replied: number;
  revived: number;
  replyRate: number;
  revivalRate: number;
  recoveredPipeline: number;
}

interface CohortOutcome {
  id: string;
  name: string;
  createdAt: string;
  baselineRate: number;
  treatment: ArmOutcome;
  holdout: ArmOutcome;
  revivalLift: number;
}

interface ProofData {
  deadCount: number;
  deadPipeline: number;
  baseline: { totalEverDead: number; revived: number; rate: number };
  cohorts: CohortOutcome[];
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
function money(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export default function RevivalProof() {
  const [data, setData] = useState<ProofData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/revival")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCohort() {
    setCreating(true);
    try {
      const res = await fetch("/api/revival?action=cohort", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error ?? "Could not create cohort", "error");
      } else {
        toast(
          `Cohort created — ${d.treatmentCount} to revive, ${d.holdoutCount} held out`,
          "success"
        );
        load();
      }
    } catch {
      toast("Network error creating cohort", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: "32px 40px 48px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ fontSize: "10px", letterSpacing: "0.20em", color: "var(--aire-muted)", marginBottom: "6px", fontWeight: 500 }}>
            DEAD-LEAD REVIVAL
          </p>
          <h2 className="font-display" style={{ fontSize: "26px", color: "var(--aire-text)", letterSpacing: "-0.01em" }}>
            Found Money
          </h2>
          <div style={{ width: "32px", height: "2px", background: "var(--aire-coral)", marginTop: "10px" }} />
        </div>
        <button
          onClick={createCohort}
          disabled={creating || !data?.deadCount}
          className="btn-coral"
          style={{
            fontSize: "10px",
            letterSpacing: "0.12em",
            padding: "10px 16px",
            opacity: creating || !data?.deadCount ? 0.5 : 1,
            cursor: creating || !data?.deadCount ? "default" : "pointer",
          }}
        >
          {creating ? "FREEZING…" : "+ NEW REVIVAL COHORT"}
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "var(--aire-muted)", lineHeight: 1.6, marginBottom: "24px", maxWidth: "640px" }}>
        A dead lead is 90+ days old, never advanced past <em>active</em>, and never once replied.
        Each cohort freezes today&apos;s dead pool and splits ~20% into a holdout (no outreach) so revival
        results are provable against both the historical baseline and a live control group.
      </p>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--aire-muted)" }}>Loading proof data…</p>
      ) : (
        <>
          {/* Top-line stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "28px" }}>
            <StatTile
              label="Dead Leads"
              value={data?.deadCount ?? 0}
              accent="var(--aire-coral)"
              sub="90+ days, never replied"
            />
            <StatTile
              label="Dormant Pipeline"
              value={money(data?.deadPipeline ?? 0)}
              sub="price-point value sitting cold"
            />
            <StatTile
              label="Baseline Revival Rate"
              value={pct(data?.baseline.rate ?? 0)}
              sub={`${data?.baseline.revived ?? 0} of ${data?.baseline.totalEverDead ?? 0} historically revived`}
            />
          </div>

          {/* Cohorts */}
          <CardLabel>EXPERIMENT COHORTS</CardLabel>
          {(!data?.cohorts || data.cohorts.length === 0) ? (
            <Card style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "13px", color: "var(--aire-muted)", padding: "8px 0" }}>
                No cohorts yet. Freeze your dead pool into a cohort, then generate voice-matched
                revival drafts from the approval queue.
              </p>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
              {data.cohorts.map((c) => (
                <CohortCard key={c.id} cohort={c} onToast={toast} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CohortCard({ cohort, onToast }: { cohort: CohortOutcome; onToast: (msg: string, variant?: "success" | "error" | "info" | "warning") => void }) {
  const liftPositive = cohort.revivalLift >= 0;
  const [running, setRunning] = useState(false);

  async function generateDrafts() {
    setRunning(true);
    try {
      const res = await fetch("/api/revival/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId: cohort.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast(d.error ?? "Could not generate drafts", "error");
      } else if (d.created === 0) {
        onToast(`No new drafts — ${d.alreadyQueued} already queued`, "info");
      } else {
        onToast(`${d.created} revival drafts queued — review in the Queue`, "success");
      }
    } catch {
      onToast("Network error generating drafts", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--aire-text)" }}>{cohort.name}</p>
          <p style={{ fontSize: "10px", color: "var(--aire-muted)", marginTop: "2px" }}>
            {new Date(cohort.createdAt).toLocaleDateString()} · baseline {pct(cohort.baselineRate)}
          </p>
        </div>
        <Badge variant={liftPositive ? "mint" : "coral"}>
          {liftPositive ? "+" : ""}{pct(cohort.revivalLift)} vs holdout
        </Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <ArmBlock title="TREATMENT" arm={cohort.treatment} accent="var(--aire-coral)" />
        <ArmBlock title="HOLDOUT (control)" arm={cohort.holdout} accent="var(--aire-muted)" />
      </div>

      <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={generateDrafts}
          disabled={running}
          className="btn-ghost"
          style={{ fontSize: "10px", letterSpacing: "0.12em", padding: "8px 14px", opacity: running ? 0.5 : 1, cursor: running ? "default" : "pointer" }}
        >
          {running ? "GENERATING…" : "GENERATE REVIVAL DRAFTS →"}
        </button>
      </div>
    </Card>
  );
}

function ArmBlock({ title, arm, accent }: { title: string; arm: ArmOutcome; accent: string }) {
  return (
    <div style={{ background: "var(--aire-card-warm)", border: "1px solid var(--aire-border)", borderRadius: "10px", padding: "14px 16px" }}>
      <p style={{ fontSize: "9px", letterSpacing: "0.16em", color: accent, fontWeight: 600, marginBottom: "10px" }}>
        {title} · {arm.count}
      </p>
      <Row label="Replied" value={`${arm.replied} (${pct(arm.replyRate)})`} />
      <Row label="Revived" value={`${arm.revived} (${pct(arm.revivalRate)})`} />
      <Row label="Pipeline recovered" value={money(arm.recoveredPipeline)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontSize: "11px", color: "var(--aire-muted)" }}>{label}</span>
      <span style={{ fontSize: "11px", color: "var(--aire-text)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
