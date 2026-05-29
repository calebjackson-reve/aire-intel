// PropStream Ingest — CSV import (AIRE Platform)
//
// PropStream has NO public API (see docs/intent-data-legal.md). The in-bounds path
// is the user's own native CSV export, uploaded here. This module:
//   parsePropStreamCsv() → tolerant CSV → normalized rows (flexible header matching)
//   matchRowToLead()     → tie a row to an existing Lead (email → phone → fuzzy name)
//   importPropStreamCsv()→ upsert PropertyIntel onto matched leads
//
// Homeowner attributes are a marketing-prioritization input ONLY — never an FCRA
// credit/eligibility decision. By default we only attach intel to leads that already
// exist; creating brand-new leads from cold records is opt-in (TCPA risk, per memo).

import { prisma } from "./prisma";

export interface ParsedRow {
  name: string | null;
  email: string | null;
  phone: string | null;
  siteAddress: string | null;
  equityPct: number | null;
  estimatedValue: number | null;
  ownershipYears: number | null;
  lastSaleDate: Date | null;
  ownerOccupied: boolean | null;
  absentee: boolean | null;
  preForeclosure: boolean | null;
  propertyType: string | null;
  raw: Record<string, string>;
}

// ─── CSV parsing (RFC-4180-ish, no deps) ─────────────────────────────────────

/** Split CSV text into rows of string cells, honoring quotes + escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ─── Header normalization ────────────────────────────────────────────────────

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Find the first header whose normalized form includes any of the given keys. */
function pick(headers: string[], keys: string[]): number {
  const normed = headers.map(norm);
  for (let i = 0; i < normed.length; i++) {
    if (keys.some((k) => normed[i].includes(k))) return i;
  }
  return -1;
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(v: string | undefined): boolean | null {
  if (v == null || v.trim() === "") return null;
  const t = v.trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(t)) return true;
  if (["n", "no", "false", "0"].includes(t)) return false;
  return null;
}

function date(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a PropStream CSV export into normalized rows. Tolerant of column naming. */
export function parsePropStreamCsv(text: string): ParsedRow[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];

  const headers = grid[0];
  const idx = {
    // Specific full-name headers only — bare "name"/"owner" would collide with the
    // separate first/last columns ("owner first name" contains "name").
    name: pick(headers, ["ownername", "owner1", "fullname", "ownerfullname"]),
    first: pick(headers, ["ownerfirstname", "firstname"]),
    last: pick(headers, ["ownerlastname", "lastname"]),
    email: pick(headers, ["email"]),
    phone: pick(headers, ["phone", "mobile", "cell"]),
    site: pick(headers, ["propertyaddress", "siteaddress", "address"]),
    equity: pick(headers, ["equitypercent", "equity", "estimatedequity"]),
    value: pick(headers, ["estimatedvalue", "estvalue", "marketvalue", "avm"]),
    tenure: pick(headers, ["ownershipyears", "yearsowned", "lengthofownership", "yearsofownership"]),
    lastSale: pick(headers, ["lastsaledate", "salesdate", "lastsale", "saledate"]),
    ownerOcc: pick(headers, ["owneroccupied"]),
    absentee: pick(headers, ["absentee", "absenteeowner"]),
    preFc: pick(headers, ["preforeclosure", "foreclosure"]),
    propType: pick(headers, ["propertytype", "landusetype"]),
  };

  const rows: ParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const get = (i: number) => (i >= 0 ? cells[i]?.trim() || undefined : undefined);

    // Name: prefer explicit first+last columns; fall back to a single full-name col.
    const f = get(idx.first);
    const l = get(idx.last);
    let name = [f, l].filter(Boolean).join(" ") || null;
    if (!name) name = get(idx.name) ?? null;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (cells[i]) raw[h] = cells[i]; });

    rows.push({
      name,
      email: get(idx.email)?.toLowerCase() ?? null,
      phone: get(idx.phone) ?? null,
      siteAddress: get(idx.site) ?? null,
      equityPct: num(get(idx.equity)),
      estimatedValue: num(get(idx.value)),
      ownershipYears: num(get(idx.tenure)),
      lastSaleDate: date(get(idx.lastSale)),
      ownerOccupied: bool(get(idx.ownerOcc)),
      absentee: bool(get(idx.absentee)),
      preForeclosure: bool(get(idx.preFc)),
      propertyType: get(idx.propType) ?? null,
      raw,
    });
  }
  return rows;
}

// ─── Lead matching (email → phone → fuzzy name) ──────────────────────────────

/** Match a parsed row to an existing Lead. Mirrors dotloop's matchLoopToLead order. */
export async function matchRowToLead(row: ParsedRow): Promise<string | null> {
  if (row.email) {
    const f = await prisma.lead.findFirst({ where: { email: row.email }, select: { id: true } });
    if (f) return f.id;
  }
  if (row.phone) {
    const digits = row.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const f = await prisma.lead.findFirst({ where: { phone: { contains: digits } }, select: { id: true } });
      if (f) return f.id;
    }
  }
  if (row.name) {
    const parts = row.name.trim().split(/\s+/);
    const last = parts[parts.length - 1]?.toLowerCase();
    const firstInitial = parts[0]?.charAt(0).toLowerCase();
    if (last && firstInitial && parts.length >= 2) {
      const f = await prisma.lead.findFirst({
        where: { lastName: { contains: last }, firstName: { startsWith: firstInitial } },
        select: { id: true },
      });
      if (f) return f.id;
    }
  }
  return null;
}

// ─── If-tenure-only derivation ───────────────────────────────────────────────

/** Derive ownership tenure (years) from last sale date when not given directly. */
function deriveTenure(row: ParsedRow): number | null {
  if (row.ownershipYears != null) return row.ownershipYears;
  if (row.lastSaleDate) {
    const yrs = (Date.now() - row.lastSaleDate.getTime()) / (365.25 * 86_400_000);
    return Math.max(0, Math.round(yrs * 10) / 10);
  }
  return null;
}

export interface ImportResult {
  parsed: number;
  matched: number;
  intelUpserted: number;
  unmatched: number;
  createdLeads: number;
  unmatchedSamples: { name: string | null; siteAddress: string | null }[];
}

/**
 * Import a PropStream CSV: attach PropertyIntel to matched leads. By default does NOT
 * create new leads from unmatched (cold) rows — pass createMissing to opt in (the
 * memo flags cold-record outreach as higher TCPA risk, so creation is deliberate).
 */
export async function importPropStreamCsv(
  text: string,
  opts: { createMissing?: boolean } = {}
): Promise<ImportResult> {
  const rows = parsePropStreamCsv(text);
  let matched = 0;
  let intelUpserted = 0;
  let createdLeads = 0;
  const unmatchedSamples: { name: string | null; siteAddress: string | null }[] = [];

  for (const row of rows) {
    let leadId = await matchRowToLead(row);

    if (!leadId) {
      if (opts.createMissing && row.name) {
        const created = await prisma.lead.create({
          data: {
            name: row.name,
            email: row.email ?? undefined,
            phone: row.phone ?? undefined,
            address: row.siteAddress ?? undefined,
            type: "seller",
            source: "propstream",
            stage: "new_lead",
          },
          select: { id: true },
        });
        leadId = created.id;
        createdLeads++;
      } else {
        if (unmatchedSamples.length < 10) {
          unmatchedSamples.push({ name: row.name, siteAddress: row.siteAddress });
        }
        continue;
      }
    } else {
      matched++;
    }

    const data = {
      equityPct: row.equityPct,
      estimatedValue: row.estimatedValue,
      ownershipYears: deriveTenure(row),
      lastSaleDate: row.lastSaleDate,
      ownerOccupied: row.ownerOccupied,
      absentee: row.absentee,
      preForeclosure: row.preForeclosure,
      propertyType: row.propertyType,
      siteAddress: row.siteAddress,
      source: "propstream",
      raw: JSON.stringify(row.raw),
    };
    await prisma.propertyIntel.upsert({
      where: { leadId },
      create: { leadId, ...data },
      update: data,
    });
    intelUpserted++;
  }

  return {
    parsed: rows.length,
    matched,
    intelUpserted,
    unmatched: rows.length - matched - createdLeads,
    createdLeads,
    unmatchedSamples,
  };
}
