import { prisma } from "@/lib/prisma";
import type { ContactLog, ChatMessage, Lead } from "@prisma/client";

/**
 * Builds the text content that gets indexed for a Lead row.
 * Combines every searchable field into a single string.
 */
function buildLeadText(lead: {
  name: string;
  email: string | null;
  phone: string | null;
  areas: string | null;
  notes: string | null;
  motivation: string | null;
  tags: string | null;
  source: string | null;
  type: string;
  stage: string;
  timeline: string | null;
  nextActionNote: string | null;
}): string {
  return [
    lead.name,
    lead.email,
    lead.phone,
    lead.areas,
    lead.notes,
    lead.motivation,
    lead.tags,
    lead.source,
    lead.type,
    lead.stage,
    lead.timeline,
    lead.nextActionNote,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Full rebuild — upserts every Lead, ContactLog, and ChatMessage into MemoryIndex.
 * Safe to run repeatedly (idempotent via @@unique[sourceType, sourceId]).
 * Runs in batches to avoid memory pressure on large datasets.
 */
export async function rebuildMemoryIndex(): Promise<{
  leads: number;
  logs: number;
  messages: number;
}> {
  let leads = 0;
  let logs = 0;
  let messages = 0;

  // --- Index Leads ---
  const LEAD_BATCH = 200;
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.lead.findMany({
      take: LEAD_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        areas: true,
        notes: true,
        motivation: true,
        tags: true,
        source: true,
        type: true,
        stage: true,
        timeline: true,
        nextActionNote: true,
        createdAt: true,
        lastContactDate: true,
      },
    });
    if (!batch.length) break;

    for (const lead of batch) {
      const rawText = buildLeadText(lead);
      const excerpt = rawText.slice(0, 300);
      await prisma.memoryIndex.upsert({
        where: { sourceType_sourceId: { sourceType: "lead", sourceId: lead.id } },
        create: {
          sourceType: "lead",
          sourceId: lead.id,
          leadId: lead.id,
          excerpt,
          rawText,
          sourceAt: lead.lastContactDate ?? lead.createdAt,
        },
        update: {
          excerpt,
          rawText,
          sourceAt: lead.lastContactDate ?? lead.createdAt,
          indexedAt: new Date(),
        },
      });
      leads++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < LEAD_BATCH) break;
  }

  // --- Index ContactLogs ---
  const LOG_BATCH = 500;
  cursor = undefined;
  while (true) {
    const batch: (ContactLog & { lead: { name: string } })[] = cursor
      ? await prisma.contactLog.findMany({
          take: LOG_BATCH, skip: 1, cursor: { id: cursor },
          orderBy: { id: "asc" }, include: { lead: { select: { name: true } } },
        })
      : await prisma.contactLog.findMany({
          take: LOG_BATCH,
          orderBy: { id: "asc" }, include: { lead: { select: { name: true } } },
        });
    if (!batch.length) break;

    for (const log of batch) {
      if (!log.note) continue; // skip empty logs
      const rawText = [log.lead.name, log.method, log.note, log.direction].filter(Boolean).join(" ");
      const excerpt = rawText.slice(0, 300);
      await prisma.memoryIndex.upsert({
        where: { sourceType_sourceId: { sourceType: "contact_log", sourceId: log.id } },
        create: {
          sourceType: "contact_log",
          sourceId: log.id,
          leadId: log.leadId,
          excerpt,
          rawText,
          sourceAt: log.createdAt,
        },
        update: {
          excerpt,
          rawText,
          sourceAt: log.createdAt,
          indexedAt: new Date(),
        },
      });
      logs++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < LOG_BATCH) break;
  }

  // --- Index ChatMessages (assistant turns only — user turns are noise) ---
  const MSG_BATCH = 500;
  cursor = undefined;
  while (true) {
    const batch: ChatMessage[] = cursor
      ? await prisma.chatMessage.findMany({
          take: MSG_BATCH, skip: 1, cursor: { id: cursor },
          where: { role: "assistant" }, orderBy: { id: "asc" },
        })
      : await prisma.chatMessage.findMany({
          take: MSG_BATCH,
          where: { role: "assistant" }, orderBy: { id: "asc" },
        });
    if (!batch.length) break;

    for (const msg of batch) {
      const rawText = msg.content.slice(0, 2000);
      const excerpt = rawText.slice(0, 300);
      await prisma.memoryIndex.upsert({
        where: { sourceType_sourceId: { sourceType: "chat_message", sourceId: msg.id } },
        create: {
          sourceType: "chat_message",
          sourceId: msg.id,
          leadId: null,
          excerpt,
          rawText,
          sourceAt: msg.createdAt,
        },
        update: {
          excerpt,
          rawText,
          sourceAt: msg.createdAt,
          indexedAt: new Date(),
        },
      });
      messages++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < MSG_BATCH) break;
  }

  return { leads, logs, messages };
}

/**
 * Incremental index — only rows newer than the last indexedAt.
 * Called by the 15-min background cron.
 */
export async function incrementalMemoryIndex(): Promise<void> {
  const latest = await prisma.memoryIndex.findFirst({
    orderBy: { indexedAt: "desc" },
    select: { indexedAt: true },
  });
  const since = latest?.indexedAt ?? new Date(0);

  // New/updated leads
  const newLeads = await prisma.lead.findMany({
    where: { updatedAt: { gt: since } },
    select: {
      id: true, name: true, email: true, phone: true, areas: true, notes: true,
      motivation: true, tags: true, source: true, type: true, stage: true,
      timeline: true, nextActionNote: true, createdAt: true, lastContactDate: true,
    },
  });
  for (const lead of newLeads) {
    const rawText = buildLeadText(lead);
    await prisma.memoryIndex.upsert({
      where: { sourceType_sourceId: { sourceType: "lead", sourceId: lead.id } },
      create: {
        sourceType: "lead", sourceId: lead.id, leadId: lead.id,
        excerpt: rawText.slice(0, 300), rawText,
        sourceAt: lead.lastContactDate ?? lead.createdAt,
      },
      update: { excerpt: rawText.slice(0, 300), rawText, indexedAt: new Date() },
    });
  }

  // New contact logs
  const newLogs = await prisma.contactLog.findMany({
    where: { createdAt: { gt: since }, note: { not: null } },
    include: { lead: { select: { name: true } } },
  });
  for (const log of newLogs) {
    const rawText = [log.lead.name, log.method, log.note, log.direction].filter(Boolean).join(" ");
    await prisma.memoryIndex.upsert({
      where: { sourceType_sourceId: { sourceType: "contact_log", sourceId: log.id } },
      create: {
        sourceType: "contact_log", sourceId: log.id, leadId: log.leadId,
        excerpt: rawText.slice(0, 300), rawText, sourceAt: log.createdAt,
      },
      update: { excerpt: rawText.slice(0, 300), rawText, indexedAt: new Date() },
    });
  }

  // New chat messages (assistant only)
  const newMsgs = await prisma.chatMessage.findMany({
    where: { createdAt: { gt: since }, role: "assistant" },
  });
  for (const msg of newMsgs) {
    const rawText = msg.content.slice(0, 2000);
    await prisma.memoryIndex.upsert({
      where: { sourceType_sourceId: { sourceType: "chat_message", sourceId: msg.id } },
      create: {
        sourceType: "chat_message", sourceId: msg.id, leadId: null,
        excerpt: rawText.slice(0, 300), rawText, sourceAt: msg.createdAt,
      },
      update: { excerpt: rawText.slice(0, 300), rawText, indexedAt: new Date() },
    });
  }
}

export interface MemorySearchResult {
  sourceType: string;
  sourceId: string;
  leadId: string | null;
  leadName: string | null;
  excerpt: string;
  sourceAt: Date;
  rank: number;
}

export async function searchMemory(
  query: string,
  types?: string[],
  limit = 8
): Promise<MemorySearchResult[]> {
  const allowedTypes = types ?? ["lead", "contact_log", "chat_message"];
  const tsQuery = query
    .replace(/[^a-zA-Z0-9 '-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  if (!tsQuery) return [];

  let rows: Array<{
    id: string; source_type: string; source_id: string; lead_id: string | null;
    excerpt: string; source_at: Date; rank: number;
  }> = [];

  try {
    rows = await prisma.$queryRaw<typeof rows>`
      SELECT id, "sourceType" AS source_type, "sourceId" AS source_id, "leadId" AS lead_id,
        excerpt, "sourceAt" AS source_at,
        ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS rank
      FROM "MemoryIndex"
      WHERE "sourceType" = ANY(${allowedTypes}::text[])
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC, "sourceAt" DESC
      LIMIT ${limit}
    `;
  } catch { /* fall through to ILIKE */ }

  if (!rows.length) {
    rows = await prisma.$queryRaw<typeof rows>`
      SELECT id, "sourceType" AS source_type, "sourceId" AS source_id, "leadId" AS lead_id,
        excerpt, "sourceAt" AS source_at, 0::float AS rank
      FROM "MemoryIndex"
      WHERE "sourceType" = ANY(${allowedTypes}::text[])
        AND "rawText" ILIKE ${'%' + query + '%'}
      ORDER BY "sourceAt" DESC
      LIMIT ${limit}
    `;
  }

  const leadIds = rows.map((r) => r.lead_id).filter((x): x is string => x !== null);
  const leads = leadIds.length
    ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(leads.map((l) => [l.id, l.name]));

  return rows.map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    leadId: r.lead_id,
    leadName: r.lead_id ? (nameMap.get(r.lead_id) ?? null) : null,
    excerpt: r.excerpt,
    sourceAt: r.source_at,
    rank: Number(r.rank),
  }));
}
