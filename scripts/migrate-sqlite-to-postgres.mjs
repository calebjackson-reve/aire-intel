// One-time data migration: SQLite (local dev.db) -> Postgres (production).
//
// The Prisma client is now generated for Postgres, so we read the SQLite source
// with raw better-sqlite3 and coerce SQLite's storage types (0/1 booleans, ISO
// date strings) into the JS types Prisma/Postgres expects, then insert.
//
// Usage:
//   SQLITE_URL="file:./prisma/dev.db" \
//   POSTGRES_URL="postgresql://..." \
//   node scripts/migrate-sqlite-to-postgres.mjs
//
// Safe to re-run: rows that already exist (by id) are skipped.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Database from "better-sqlite3";
import { readFileSync } from "fs";

const SQLITE_URL = process.env.SQLITE_URL ?? "file:./prisma/dev.db";
// Read the Postgres URL from POSTGRES_URL, else from DATABASE_URL in .env.local.
function readEnvLocal(key) {
  try {
    const m = readFileSync(".env.local", "utf8").match(new RegExp("^" + key + '="?([^"\\n]+)"?', "m"));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const POSTGRES_URL = process.env.POSTGRES_URL || readEnvLocal("DATABASE_URL");
if (!POSTGRES_URL || !POSTGRES_URL.startsWith("postgres")) { console.error("❌ No valid Postgres URL found (POSTGRES_URL or DATABASE_URL in .env.local)."); process.exit(1); }

// Parent -> child-ish order; the retry loop fixes any remaining FK ordering.
const MODELS = [
  "Lead", "SmartPlan", "Goal", "Setting", "SocialConnection", "ErrorLog",
  "DailyBrief", "RevivalCohort",
  "PropertyIntel", "DotloopLoop", "ContactLog", "Task", "SmartPlanEnrollment",
  "GeneratedPost", "BuyerSearch", "ListingAlert", "Notification",
  "ScheduledPost", "Deal", "MessageDraft", "LinkedInOutreach",
];

// Parse schema.prisma to learn which fields are Boolean / DateTime per model.
function buildTypeMap() {
  const text = readFileSync("prisma/schema.prisma", "utf8");
  const map = {};
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const [, model, body] = m;
    const bools = [], dates = [];
    for (const line of body.split("\n")) {
      const f = line.trim().match(/^(\w+)\s+(\w+)(\?|\[\])?/);
      if (!f) continue;
      if (f[2] === "Boolean") bools.push(f[1]);
      else if (f[2] === "DateTime") dates.push(f[1]);
    }
    map[model] = { bools, dates };
  }
  return map;
}

function coerce(row, types) {
  const out = { ...row };
  for (const k of types.bools) if (out[k] !== null && out[k] !== undefined) out[k] = Boolean(out[k]);
  for (const k of types.dates) if (out[k] !== null && out[k] !== undefined) out[k] = new Date(out[k]);
  return out;
}

const typeMap = buildTypeMap();
const sqlite = new Database(SQLITE_URL.replace("file:", ""), { readonly: true });
const target = new PrismaClient({ adapter: new PrismaPg({ connectionString: POSTGRES_URL }), errorFormat: "pretty" });

const isFk = e => e?.code === "P2003" || /foreign key/i.test(String(e?.message ?? e));
const isDup = e => e?.code === "P2002" || /unique constraint/i.test(String(e?.message ?? e));
const delegate = m => m.charAt(0).toLowerCase() + m.slice(1);

async function run() {
  console.log("\n📦 Copying data SQLite -> Postgres\n");
  const queue = [];
  for (const model of MODELS) {
    let rows;
    try { rows = sqlite.prepare(`SELECT * FROM "${model}"`).all(); }
    catch { console.log(`   (skip ${model} — no table in source)`); continue; }
    const types = typeMap[model] ?? { bools: [], dates: [] };
    for (const r of rows) queue.push({ model: delegate(model), row: coerce(r, types) });
    console.log(`   read ${String(rows.length).padStart(5)}  ${model}`);
  }
  console.log(`\n   ${queue.length} rows to insert…\n`);

  let remaining = queue, pass = 0;
  const counts = {}, skipped = {};
  while (remaining.length) {
    pass++;
    const next = [];
    let progressed = 0;
    for (const item of remaining) {
      try {
        await target[item.model].create({ data: item.row });
        counts[item.model] = (counts[item.model] ?? 0) + 1; progressed++;
      } catch (e) {
        if (isDup(e)) { skipped[item.model] = (skipped[item.model] ?? 0) + 1; progressed++; }
        else if (isFk(e)) { next.push(item); }
        else { console.error(`   ⚠️  ${item.model}: ${e?.code ?? ""} ${String(e?.message ?? e).split("\n").filter(Boolean)[0] ?? "unknown error"}`); progressed++; }
      }
    }
    console.log(`   pass ${pass}: handled ${progressed}, ${next.length} deferred`);
    if (!progressed) { console.error(`\n❌ Stuck on ${next.length} rows (FK with no parent). Aborting.`); break; }
    remaining = next;
  }

  console.log(`\n✅ Done.\n   inserted:`, counts);
  if (Object.keys(skipped).length) console.log(`   skipped (already existed):`, skipped);
  await target.$disconnect();
}

run().catch(async e => { console.error("\n❌ Failed:", e); await target.$disconnect().catch(()=>{}); process.exit(1); });
