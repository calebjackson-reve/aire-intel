// Parser for Darwin Cloud "Pending and Closing" CSV report.
//
// The Darwin CSV has 5 ReportGroup categories that overlap (same deal appears
// in multiple groups depending on its state). To avoid duplicates we treat
// "Processed/Closed" as the authoritative source for closed deals, and
// "Open/Pending" as the source for pending deals.
//
// Side detection:
//   - AGCI_List2 has a value → listing side (we represented this deal)
//   - AGCI_Sell2 has a value → buyer side
//   - Both → dual agency

export interface ParsedDarwinDeal {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  salePrice: number;
  commission: number;
  commissionPct: number | null;
  side: "buyer" | "seller" | "both";
  status: "closed" | "pending" | "expired";
  contractDate: Date | null;
  closingDate: Date | null;
  listingDate: Date | null;
  source: "darwin";
  notes: string;
}

function parseMoney(v: string | undefined): number {
  if (!v || v === "-" || v === "$0.00") return 0;
  return parseFloat(v.replace(/[$,"]/g, "").trim()) || 0;
}

function parseDate(v: string | undefined): Date | null {
  if (!v || v === "-" || !v.trim()) return null;
  // Darwin format: M/D/YY → convert to full year 20YY
  const parts = v.trim().split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
  const month = parseInt(m) - 1;
  const day = parseInt(d);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

function parseAddress(full: string): { address: string; city: string | null; state: string | null; zip: string | null } {
  // "10006 Trails End Rd, St Francisville, LA, 70775"
  const parts = full.split(",").map(p => p.trim());
  if (parts.length >= 4) {
    return { address: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
  }
  return { address: full, city: null, state: null, zip: null };
}

// Robust CSV row splitter that handles quoted commas like `"189,307.50"`
function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export function parseDarwinCsv(csvText: string): ParsedDarwinDeal[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 4) return [];

  // After filtering empty lines: lines[0] = txtCriteria, lines[1] = criteria text,
  // lines[2] = header, lines[3+] = data
  // Strip BOM from first line if present, then locate the header by signature
  const headerIdx = lines.findIndex(l => l.includes("ReportGroup") && l.includes("propertyAddress5"));
  if (headerIdx < 0) return [];
  const header = splitCsvRow(lines[headerIdx]);
  const dataLines = lines.slice(headerIdx + 1);

  const idx = (col: string) => header.indexOf(col);

  const COL = {
    reportGroup: idx("ReportGroup"),
    status: idx("status2"),
    address: idx("propertyAddress5"),
    listingDate: idx("listingdate2"),
    pendingDate: idx("pendingdate2"),
    closeDate: idx("closedate2"),
    propertyType: idx("Textbox20"),
    // Per-deal AGCI columns
    agciTotal: idx("AGCI_Total2"),
    agciList: idx("AGCI_List2"),
    agciSell: idx("AGCI_Sell2"),
    // Per-deal volume — Darwin uses different columns by report group:
    //   Processed/Closed → Vol_Total4
    //   Open/Pending      → Textbox1072
    volumeClosed: idx("Vol_Total4"),
    volumePending: idx("Textbox1072"),
  };

  const seen = new Set<string>();
  const deals: ParsedDarwinDeal[] = [];

  for (const line of dataLines) {
    const cols = splitCsvRow(line);
    if (cols.length < header.length - 2) continue;

    const reportGroup = cols[COL.reportGroup]?.trim();
    const status = cols[COL.status]?.trim();
    const addressFull = cols[COL.address]?.trim();
    if (!addressFull) continue;

    // We only want "Processed/Closed" (authoritative closed) and "Open/Pending" (pending)
    // Skip "Listing taken", "Lost Listing", "Pending written" to avoid duplicates
    let dealStatus: "closed" | "pending" | "expired";
    if (reportGroup === "Processed/Closed" && status === "Closed") {
      dealStatus = "closed";
    } else if (reportGroup === "Open/Pending" && status === "Pending") {
      dealStatus = "pending";
    } else {
      continue;
    }

    // Dedupe on address + closing date (or pending date for pendings)
    const closingDate = parseDate(cols[COL.closeDate]);
    const pendingDate = parseDate(cols[COL.pendingDate]);
    const listingDate = parseDate(cols[COL.listingDate]);
    const dedupeKey = `${addressFull}|${dealStatus}|${closingDate?.toISOString() ?? pendingDate?.toISOString() ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const agciTotal = parseMoney(cols[COL.agciTotal]);
    const agciList = parseMoney(cols[COL.agciList]);
    const agciSell = parseMoney(cols[COL.agciSell]);
    const salePrice = dealStatus === "closed"
      ? parseMoney(cols[COL.volumeClosed])
      : parseMoney(cols[COL.volumePending]);

    let side: "buyer" | "seller" | "both";
    if (agciList > 0 && agciSell > 0) side = "both";
    else if (agciList > 0) side = "seller";
    else side = "buyer";

    const commissionPct = salePrice > 0 && agciTotal > 0 ? (agciTotal / salePrice) * 100 : null;
    const { address, city, state, zip } = parseAddress(addressFull);

    deals.push({
      address,
      city,
      state,
      zip,
      salePrice,
      commission: agciTotal,
      commissionPct,
      side,
      status: dealStatus,
      contractDate: pendingDate,
      closingDate: closingDate ?? pendingDate ?? new Date(),
      listingDate,
      source: "darwin",
      notes: `Imported from Darwin Cloud · ${cols[COL.propertyType] ?? "RESIDENTIAL"}`,
    });
  }

  return deals;
}
