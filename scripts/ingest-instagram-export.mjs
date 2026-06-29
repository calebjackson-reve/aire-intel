/**
 * AIRE — Instagram Export Ingestion
 * Parses the official Instagram data export and imports into AIRE database.
 *
 * Sources extracted:
 *   - Followers (300)
 *   - Following (1010) — mutual + one-way
 *   - DM inbox threads (273 real conversations) — highest priority
 *   - DM message requests (12)
 *
 * Priority tiers:
 *   1. DM'd you (inbox) — they reached out, hottest signal
 *   2. Mutual follow — you know each other
 *   3. Follower only — they found you
 *   4. Following only — you followed them
 *
 * Run: node scripts/ingest-instagram-export.mjs
 */

import { PrismaClient } from '@prisma/client';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { readFileSync, readdirSync, statSync } from 'fs';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const EXPORT_DIR = '/Users/caleb/Downloads/instagram-export';

// ── Prisma setup (mirror src/lib/prisma.ts) ──────────────────────────────────
async function createPrisma() {
  const url = (process.env.DATABASE_URL ?? '').replace(/^["']|["']$/g, '');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }
  const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(url.replace('file:', ''));
  const adapter = new PrismaBetterSqlite3({ url: db.name });
  return new PrismaClient({ adapter });
}

// ── HTML parsers ──────────────────────────────────────────────────────────────

function extractIgUsernames(html) {
  const re = /href="https:\/\/www\.instagram\.com\/([^/"]+)\/?"/g;
  const usernames = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1].toLowerCase().replace(/\/$/, '');
    if (u && !u.includes('?') && u !== 'p' && u.length > 0) usernames.add(u);
  }
  return [...usernames];
}

function extractDmUsername(folderName) {
  // folder format: "username_threadid" — strip the numeric suffix
  return folderName.replace(/_\d+$/, '');
}

function listDirs(path) {
  try {
    return readdirSync(path).filter(f => statSync(`${path}/${f}`).isDirectory());
  } catch { return []; }
}

// ── Data collection ───────────────────────────────────────────────────────────

function collectAll() {
  const followersHtml = readFileSync(
    `${EXPORT_DIR}/connections/followers_and_following/followers_1.html`, 'utf8'
  );
  const followingHtml = readFileSync(
    `${EXPORT_DIR}/connections/followers_and_following/following.html`, 'utf8'
  );

  const followers = new Set(extractIgUsernames(followersHtml));
  const following = new Set(extractIgUsernames(followingHtml));

  const inboxDirs     = listDirs(`${EXPORT_DIR}/your_instagram_activity/messages/inbox`);
  const requestsDirs  = listDirs(`${EXPORT_DIR}/your_instagram_activity/messages/message_requests`);

  const dmUsernames    = new Set(inboxDirs.map(extractDmUsername));
  const reqUsernames   = new Set(requestsDirs.map(extractDmUsername));

  // Build unified map: username → { tier, signals[] }
  const people = new Map();

  const addSignal = (username, signal) => {
    if (!username || username.length < 2) return;
    const u = username.toLowerCase();
    if (!people.has(u)) people.set(u, { username: u, signals: [] });
    people.get(u).signals.push(signal);
  };

  for (const u of dmUsernames)   addSignal(u, 'dm_inbox');
  for (const u of reqUsernames)  addSignal(u, 'dm_request');
  for (const u of followers)     addSignal(u, 'follower');
  for (const u of following)     addSignal(u, 'following');

  return people;
}

// ── Priority + source mapping ─────────────────────────────────────────────────

function classifyPerson({ username, signals }) {
  const hasDm       = signals.includes('dm_inbox');
  const hasReq      = signals.includes('dm_request');
  const isFollower  = signals.includes('follower');
  const isFollowing = signals.includes('following');
  const isMutual    = isFollower && isFollowing;

  let source, priority, note;

  if (hasDm && isMutual) {
    source   = 'Instagram DM + Mutual';
    priority = 1;
    note     = 'Mutual follower who DM\'d you — high intent';
  } else if (hasDm) {
    source   = 'Instagram DM';
    priority = 1;
    note     = 'Sent you a DM on Instagram';
  } else if (hasReq) {
    source   = 'Instagram DM Request';
    priority = 2;
    note     = 'Sent a DM request (unanswered)';
  } else if (isMutual) {
    source   = 'Instagram Mutual';
    priority = 2;
    note     = 'Mutual follow — you know each other';
  } else if (isFollower) {
    source   = 'Instagram Follower';
    priority = 3;
    note     = 'Follows @calebjackson_24';
  } else {
    source   = 'Instagram Following';
    priority = 4;
    note     = 'You follow them on Instagram';
  }

  return { source, priority, note, signals: signals.join(', ') };
}

// ── Upsert ────────────────────────────────────────────────────────────────────

async function upsertLead(prisma, { username, source, priority, note }) {
  // Check if already exists by IG tag
  const igTag = `ig:${username}`;
  const existing = await prisma.lead.findFirst({
    where: { tags: { contains: igTag } },
    select: { id: true },
  });
  if (existing) return 'skipped';

  // Determine stage: DMs → active, mutual → new_lead, follower → new_lead
  const stage = priority <= 2 ? 'new_lead' : 'new_lead';

  await prisma.lead.create({
    data: {
      name:              username,
      firstName:         username,
      stage,
      source,
      preferredPlatform: 'instagram',
      tags:              igTag,
      notes:             note,
    },
  });
  return 'created';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = await createPrisma();

  console.log('📦 AIRE — Instagram Export Ingestion');
  console.log(`   Export: ${EXPORT_DIR}\n`);

  const people = collectAll();
  console.log(`Found ${people.size} unique people across all signals:\n`);

  // Sort by priority
  const sorted = [...people.values()]
    .map(p => ({ ...p, ...classifyPerson(p) }))
    .sort((a, b) => a.priority - b.priority);

  // Summary
  const bySource = {};
  for (const p of sorted) {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
  }
  for (const [src, count] of Object.entries(bySource)) {
    console.log(`  ${count.toString().padStart(4)}  ${src}`);
  }

  console.log(`\nImporting into AIRE database...\n`);

  let created = 0, skipped = 0, errors = 0;
  for (const person of sorted) {
    try {
      const result = await upsertLead(prisma, person);
      if (result === 'created') { created++; process.stdout.write('✓'); }
      else                      { skipped++; process.stdout.write('.'); }
    } catch (e) {
      errors++;
      process.stdout.write('✗');
    }
    if ((created + skipped + errors) % 60 === 0) process.stdout.write('\n');
  }

  console.log(`\n\n✅ Done.`);
  console.log(`   Created : ${created} new leads`);
  console.log(`   Skipped : ${skipped} already in DB`);
  console.log(`   Errors  : ${errors}`);
  console.log(`\n   In AIRE → Contacts, filter source by "Instagram DM" to see the hottest tier first.`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
