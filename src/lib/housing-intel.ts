import { withRetry } from "@/lib/error-memory";

// FRED (Federal Reserve Economic Data) — free, no key required by default
// Optional: set FRED_API_KEY in .env for higher rate limits
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function fetchFRED(seriesId: string, limit = 2): Promise<Array<{ date: string; value: string }>> {
  return withRetry(async () => {
    const key = process.env.FRED_API_KEY ?? "abcdefghijklmnopqrstuvwxyz012345"; // FRED public sandbox key
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: key,
      file_type: "json",
      sort_order: "desc",
      limit: String(limit),
    });
    const res = await fetch(`${FRED_BASE}?${params}`);
    if (!res.ok) throw new Error(`FRED fetch failed for ${seriesId}: ${res.status}`);
    const data = await res.json();
    return data.observations ?? [];
  }, { maxAttempts: 2, source: `fred/${seriesId}` });
}

export interface MortgageRateSnapshot {
  current: number;
  priorWeek: number;
  delta: number; // positive = rates went up, negative = down
  asOf: string;
}

export interface RateAlert {
  triggered: boolean;
  delta: number;
  direction: "up" | "down" | "flat";
  message: string;
}

export interface BatonRougeMacro {
  // FRED series: BATON ROUGE MSA unemployment rate
  unemployment: number | null;
  unemploymentDate: string | null;
  // FRED series: 30-yr fixed mortgage rate
  mortgageRate: number | null;
  mortgageRateDate: string | null;
  // FRED series: US housing starts (proxy for market direction)
  housingStarts: number | null;
  housingStartsDate: string | null;
  // Computed
  marketDirection: "expanding" | "contracting" | "stable";
  lastUpdated: string;
}

// 30-year fixed mortgage rate (MORTGAGE30US)
export async function getMortgageRate(): Promise<MortgageRateSnapshot> {
  const obs = await fetchFRED("MORTGAGE30US", 2);
  const current = obs[0] ? parseFloat(obs[0].value) : 0;
  const prior = obs[1] ? parseFloat(obs[1].value) : current;
  return {
    current,
    priorWeek: prior,
    delta: Number((current - prior).toFixed(3)),
    asOf: obs[0]?.date ?? "unknown",
  };
}

// Returns a rate alert if the weekly move is >= threshold (default 0.125%)
export async function getRateAlert(thresholdPct = 0.125): Promise<RateAlert> {
  const snap = await getMortgageRate();
  const absDelta = Math.abs(snap.delta);
  const triggered = absDelta >= thresholdPct;
  const direction = snap.delta < -0.001 ? "down" : snap.delta > 0.001 ? "up" : "flat";

  let message = `30-yr rate: ${snap.current}% (${direction === "flat" ? "unchanged" : `${direction} ${absDelta.toFixed(3)}%`} from last week)`;
  if (triggered && direction === "down") {
    message = `Rates dropped ${absDelta.toFixed(3)}% to ${snap.current}% — opportunity to blast pre-approval leads.`;
  } else if (triggered && direction === "up") {
    message = `Rates rose ${absDelta.toFixed(3)}% to ${snap.current}% — consider messaging fence-sitters about locking in.`;
  }

  return { triggered, delta: snap.delta, direction, message };
}

// Baton Rouge MSA macro snapshot
export async function getBatonRougeMacro(): Promise<BatonRougeMacro> {
  // BATUNUR: Baton Rouge unemployment rate (not seasonally adjusted)
  // MORTGAGE30US: 30-yr fixed rate
  // HOUST: US housing starts (thousands of units, seasonally adjusted annual rate)
  const [unemploymentObs, mortgageObs, startsObs] = await Promise.all([
    fetchFRED("BATUNUR", 1).catch(() => []),
    fetchFRED("MORTGAGE30US", 1).catch(() => []),
    fetchFRED("HOUST", 2).catch(() => []),
  ]);

  const unemployment = unemploymentObs[0] ? parseFloat(unemploymentObs[0].value) : null;
  const mortgageRate = mortgageObs[0] ? parseFloat(mortgageObs[0].value) : null;
  const starts = startsObs[0] ? parseFloat(startsObs[0].value) : null;
  const startsPrior = startsObs[1] ? parseFloat(startsObs[1].value) : null;

  let marketDirection: BatonRougeMacro["marketDirection"] = "stable";
  if (starts && startsPrior) {
    const pctChange = (starts - startsPrior) / startsPrior;
    if (pctChange > 0.03) marketDirection = "expanding";
    else if (pctChange < -0.03) marketDirection = "contracting";
  }

  return {
    unemployment,
    unemploymentDate: unemploymentObs[0]?.date ?? null,
    mortgageRate,
    mortgageRateDate: mortgageObs[0]?.date ?? null,
    housingStarts: starts,
    housingStartsDate: startsObs[0]?.date ?? null,
    marketDirection,
    lastUpdated: new Date().toISOString(),
  };
}

// Formats the macro snapshot as a brief human-readable string for the morning brief
export function formatMacroForBrief(macro: BatonRougeMacro): string {
  const lines: string[] = [];
  if (macro.mortgageRate) lines.push(`30-yr rate: ${macro.mortgageRate}%`);
  if (macro.unemployment) lines.push(`BR unemployment: ${macro.unemployment}%`);
  if (macro.housingStarts) lines.push(`US housing starts: ${macro.housingStarts}k units (${macro.marketDirection})`);
  return lines.join(" · ") || "Market data unavailable";
}
