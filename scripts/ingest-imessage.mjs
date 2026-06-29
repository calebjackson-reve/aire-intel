#!/usr/bin/env node
// ─── Apple Messages → Touch Tracker ingest ────────────────────────────────
// Reads the local iMessage SQLite DB, matches each conversation handle
// (phone or email) to an AIRE Lead, and records a dated ContactLog touch
// on platform "imessage". Deduped by message GUID so it's safe to re-run.
//
// ONE-TIME SETUP: your terminal app needs Full Disk Access —
//   System Settings → Privacy & Security → Full Disk Access → enable Terminal.
//   (macOS gate; cannot be granted programmatically.)
//
// Run:  node scripts/ingest-imessage.mjs            (last 90 days)
//       node scripts/ingest-imessage.mjs --days 365
//       node scripts/ingest-imessage.mjs --since 0  (full history)

import "dotenv/config";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import os from "node:os";
import path from "node:path";

// Mirror src/lib/prisma.ts: pick the driver adapter from the URL scheme.
function makePrisma() {
  const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^["']|["']$/g, "");
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: ["error"] });
  }
  const db = new Database(url.replace("file:", ""));
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: db.name }), log: ["error"] });
}
const prisma = makePrisma();

const argDays = Number(process.argv[process.argv.indexOf("--days") + 1]) || 90;
const chatDbPath = path.join(os.homedir(), "Library", "Messages", "chat.db");

// Apple stores message.date as nanoseconds since 2001-01-01 UTC.
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
const appleDateToJs = (d) => new Date(APPLE_EPOCH_MS + Number(d) / 1_000_000);

const normPhone = (s) => (s || "").replace(/[^\d]/g, "").replace(/^1(\d{10})$/, "$1");
const normEmail = (s) => (s || "").trim().toLowerCase();

async function main() {
  let db;
  try {
    db = new Database(chatDbPath, { readonly: true, fileMustExist: true });
    db.prepare("SELECT 1 FROM message LIMIT 1").get(); // permission probe
  } catch (e) {
    console.error(
      "\n✗ Can't read chat.db. Grant your terminal Full Disk Access:\n" +
        "  System Settings → Privacy & Security → Full Disk Access → enable your terminal, then re-run.\n"
    );
    process.exit(1);
  }

  // Build a phone/email → leadId lookup from the CRM.
  const leads = await prisma.lead.findMany({
    where: { doNotContact: false },
    select: { id: true, phone: true, email: true },
  });
  const byPhone = new Map();
  const byEmail = new Map();
  for (const l of leads) {
    const p = normPhone(l.phone);
    if (p.length >= 10) byPhone.set(p.slice(-10), l.id);
    const e = normEmail(l.email);
    if (e) byEmail.set(e, l.id);
  }

  const sinceApple = (Date.now() - argDays * 86400_000 - APPLE_EPOCH_MS) * 1_000_000;

  // Join messages → handles. handle.id is the phone/email of the other party.
  const rows = db
    .prepare(
      `SELECT m.guid AS guid, m.date AS date, m.is_from_me AS isFromMe,
              h.id AS handle
       FROM message m
       JOIN handle h ON m.handle_id = h.ROWID
       WHERE m.date > ? AND h.id IS NOT NULL
       ORDER BY m.date ASC`
    )
    .all(sinceApple);

  let matched = 0,
    inserted = 0,
    skipped = 0;

  for (const r of rows) {
    const handle = r.handle;
    let leadId = null;
    if (handle.includes("@")) {
      leadId = byEmail.get(normEmail(handle)) ?? null;
    } else {
      const p = normPhone(handle);
      if (p.length >= 10) leadId = byPhone.get(p.slice(-10)) ?? null;
    }
    if (!leadId) continue;
    matched++;

    const externalId = `imsg:${r.guid}`;
    try {
      await prisma.contactLog.create({
        data: {
          leadId,
          platform: "imessage",
          method: "text",
          direction: r.isFromMe ? "outbound" : "inbound",
          externalId,
          touchedAt: appleDateToJs(r.date),
          note: null,
        },
      });
      inserted++;
    } catch (e) {
      if (e.code === "P2002") skipped++; // already ingested (unique externalId)
      else throw e;
    }
  }

  console.log(
    `\n✓ iMessage ingest complete — scanned ${rows.length} msgs (${argDays}d), ` +
      `matched ${matched} to leads, inserted ${inserted}, skipped ${skipped} dupes.\n`
  );

  db.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
