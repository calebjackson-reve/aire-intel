export const dynamic = "force-dynamic";
// PropStream CSV import — attach homeowner intel to leads
//
// POST /api/import/propstream            (multipart file OR raw CSV body)
//   ?createMissing=1  → also create new seller leads for unmatched rows (opt-in;
//                        cold-record outreach is higher TCPA risk — see the memo)
//
// Returns counts: parsed / matched / intel upserted / unmatched (+ samples).
// PropStream has no API; this CSV path is the in-bounds ingest (docs/intent-data-legal.md).

import { NextRequest } from "next/server";
import { importPropStreamCsv } from "@/lib/propstream";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const createMissing = searchParams.get("createMissing") === "1";

  const contentType = request.headers.get("content-type") || "";
  let csvText: string;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
    csvText = await file.text();
  } else {
    csvText = await request.text();
  }

  if (!csvText || csvText.trim().length === 0) {
    return Response.json({ error: "Empty CSV" }, { status: 400 });
  }

  try {
    const result = await importPropStreamCsv(csvText, { createMissing });
    if (result.parsed === 0) {
      return Response.json(
        { error: "No rows parsed. Expected a PropStream CSV export with a header row." },
        { status: 400 }
      );
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
