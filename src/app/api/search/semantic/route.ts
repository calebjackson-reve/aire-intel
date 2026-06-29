export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  sourceType: "lead" | "contact_log" | "chat_message";
  sourceId: string;
  leadId: string | null;
  leadName: string | null;
  excerpt: string;
  sourceAt: Date;
  rank: number;
}

export interface SemanticSearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

/**
 * POST /api/search/semantic
 * Body: { query: string, types?: string[], limit?: number }
 *
 * Uses Postgres tsvector full-text search with ts_rank for relevance ordering.
 * Falls back to an ILIKE query when ts_rank returns zero results (handles
 * single-word or numeric queries that don't tokenize well).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      query?: string;
      types?: string[];
      limit?: number;
    };

    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ results: [], query, total: 0 });
    }

    const limit = Math.min(body.limit ?? 10, 50);
    const types = body.types ?? ["lead", "contact_log", "chat_message"];

    // Convert the query to a tsquery — AND logic with prefix matching
    // e.g. "acreage Zachary" → "acreage:* & Zachary:*"
    const tsQuery = query
      .replace(/[^a-zA-Z0-9 '-]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(" & ");

    if (!tsQuery) {
      return NextResponse.json({ results: [], query, total: 0 });
    }

    // Raw SQL because Prisma doesn't surface tsvector/tsquery operators
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      source_type: string;
      source_id: string;
      lead_id: string | null;
      excerpt: string;
      source_at: Date;
      rank: number;
    }>>`
      SELECT
        id,
        "sourceType"     AS source_type,
        "sourceId"       AS source_id,
        "leadId"         AS lead_id,
        excerpt,
        "sourceAt"       AS source_at,
        ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS rank
      FROM "MemoryIndex"
      WHERE
        "sourceType" = ANY(${types}::text[])
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC, "sourceAt" DESC
      LIMIT ${limit}
    `;

    // Fallback: ILIKE search when tsvector returns nothing
    // (handles proper nouns, phone numbers, "John Smith" style queries)
    let finalRows = rows;
    if (!rows.length) {
      const likePattern = `%${query}%`;
      finalRows = await prisma.$queryRaw<typeof rows>`
        SELECT
          id,
          "sourceType"  AS source_type,
          "sourceId"    AS source_id,
          "leadId"      AS lead_id,
          excerpt,
          "sourceAt"    AS source_at,
          0::float      AS rank
        FROM "MemoryIndex"
        WHERE
          "sourceType" = ANY(${types}::text[])
          AND "rawText" ILIKE ${likePattern}
        ORDER BY "sourceAt" DESC
        LIMIT ${limit}
      `;
    }

    // Enrich with lead names via a single batch lookup
    const leadIds = finalRows.map((r) => r.lead_id).filter((x): x is string => x !== null);
    const leads = leadIds.length
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, name: true },
        })
      : [];
    const leadNameMap = new Map(leads.map((l) => [l.id, l.name]));

    const results: SearchResult[] = finalRows.map((r) => ({
      sourceType: r.source_type as SearchResult["sourceType"],
      sourceId: r.source_id,
      leadId: r.lead_id,
      leadName: r.lead_id ? (leadNameMap.get(r.lead_id) ?? null) : null,
      excerpt: r.excerpt,
      sourceAt: r.source_at,
      rank: Number(r.rank),
    }));

    return NextResponse.json({ results, query, total: results.length } satisfies SemanticSearchResponse);
  } catch (err) {
    console.error("[search/semantic]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
