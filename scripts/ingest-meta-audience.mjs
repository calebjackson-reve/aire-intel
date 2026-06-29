/**
 * AIRE — Meta Audience Ingestion
 * Pulls IG commenters, IG mentions, FB page commenters, FB page DMs
 * and upserts them as Leads in the AIRE database.
 *
 * Run: node scripts/ingest-meta-audience.mjs
 */

import { PrismaClient } from '@prisma/client';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// Mirror the same driver-adapter pattern as src/lib/prisma.ts
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

const prisma = await createPrisma();
const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const IG_ID      = process.env.META_IG_BUSINESS_ID;
const PAGE_ID    = process.env.META_PAGE_ID;
const API_BASE   = 'https://graph.facebook.com/v21.0';

// ── helpers ──────────────────────────────────────────────────────────────────

async function gql(path, params = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set('access_token', PAGE_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const json = await r.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message} (path: ${path})`);
  return json;
}

async function paginate(path, params = {}, maxPages = 20) {
  const items = [];
  let nextUrl = null;
  let page = 0;

  const first = await gql(path, { ...params, limit: 100 });
  items.push(...(first.data || []));
  nextUrl = first.paging?.next;

  while (nextUrl && page < maxPages) {
    const r = await fetch(nextUrl);
    const json = await r.json();
    if (json.error || !json.data) break;
    items.push(...json.data);
    nextUrl = json.paging?.next;
    page++;
    await sleep(200); // rate limit courtesy
  }
  return items;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── upsert lead ──────────────────────────────────────────────────────────────

async function upsertLead({ username, name, source, platform, note }) {
  // Dedup check: facebookUrl for FB leads, tags for IG leads
  const igTag = platform === 'instagram' ? `ig:${username}` : null;
  const fbUrl = platform === 'facebook'  ? username : null;

  const existing = await prisma.lead.findFirst({
    where: {
      OR: [
        fbUrl  ? { facebookUrl: fbUrl }                           : undefined,
        igTag  ? { tags: { contains: igTag } }                    : undefined,
      ].filter(Boolean),
    },
  });

  if (existing) return { action: 'skipped', id: existing.id };

  const displayName = name || username || 'Unknown';
  const nameParts   = displayName.trim().split(' ');
  const firstName   = nameParts[0];
  const lastName    = nameParts.slice(1).join(' ') || '';

  const lead = await prisma.lead.create({
    data: {
      name:              displayName,
      firstName,
      lastName,
      stage:             'new_lead',
      source,
      preferredPlatform: platform,
      facebookUrl:       fbUrl || null,
      facebookName:      platform === 'facebook' ? displayName : null,
      tags:              igTag || null,
      notes:             note || null,
    },
  });
  return { action: 'created', id: lead.id };
}

// ── collectors ───────────────────────────────────────────────────────────────

async function collectIgMentions() {
  console.log('\n📍 Collecting IG mentions/tags...');
  const items = await paginate(`${IG_ID}/tags`, { fields: 'id,username,timestamp' });
  console.log(`   Found ${items.length} mentions`);
  return items.map(m => ({
    username:   m.username,
    name:       m.username,
    source:     'Instagram Mention',
    platform:   'instagram',
    note:       `Tagged you on ${m.timestamp?.slice(0, 10)}`,
  }));
}

async function collectIgCommenters() {
  console.log('\n💬 Collecting IG post commenters...');
  const media = await paginate(`${IG_ID}/media`, { fields: 'id,timestamp' }, 50);
  console.log(`   Found ${media.length} posts — pulling commenters...`);

  const commenters = new Map();
  for (const post of media) {
    try {
      const comments = await paginate(`${post.id}/comments`, { fields: 'id,username,text,timestamp' }, 5);
      for (const c of comments) {
        if (!commenters.has(c.username)) {
          commenters.set(c.username, {
            username:   c.username,
            name:       c.username,
            source:     'Instagram Commenter',
            platform:   'instagram',
            note:       `Commented on IG post: "${c.text?.slice(0, 80)}"`,
          });
        }
      }
      await sleep(100);
    } catch (e) {
      // some posts may not allow comment reads — skip
    }
  }
  console.log(`   Found ${commenters.size} unique commenters`);
  return [...commenters.values()];
}

async function collectFbPageCommenters() {
  console.log('\n💬 Collecting Facebook Page post commenters...');
  let posts;
  try {
    posts = await paginate(`${PAGE_ID}/posts`, { fields: 'id,created_time' }, 20);
  } catch (e) {
    console.log('   ⚠ Could not access page posts:', e.message);
    return [];
  }
  console.log(`   Found ${posts.length} page posts`);

  const commenters = new Map();
  for (const post of posts) {
    try {
      const comments = await paginate(`${post.id}/comments`, { fields: 'id,from,message' }, 5);
      for (const c of comments) {
        if (c.from && !commenters.has(c.from.id)) {
          commenters.set(c.from.id, {
            username:   c.from.name || c.from.id,
            name:       c.from.name || '',
            source:     'Facebook Page Commenter',
            platform:   'facebook',
            note:       `Commented on FB page post: "${c.message?.slice(0, 80)}"`,
          });
        }
      }
      await sleep(100);
    } catch (e) { /* skip */ }
  }
  console.log(`   Found ${commenters.size} unique FB commenters`);
  return [...commenters.values()];
}

async function collectFbPageDMs() {
  console.log('\n📨 Collecting Facebook Page DMs (Messenger)...');
  try {
    const convos = await paginate(`${PAGE_ID}/conversations`, { fields: 'id,participants' }, 20);
    console.log(`   Found ${convos.length} conversations`);
    const leads = [];
    for (const c of convos) {
      for (const p of (c.participants?.data || [])) {
        // Skip the page itself
        if (p.id === PAGE_ID) continue;
        leads.push({
          username:   p.name || p.id,
          name:       p.name || '',
          source:     'Facebook Messenger',
          platform:   'facebook',
          note:       'Sent a DM to your Facebook Page',
        });
      }
    }
    return leads;
  } catch (e) {
    console.log('   ⚠ Messenger access error:', e.message);
    return [];
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 AIRE — Meta Audience Ingestion');
  console.log(`   IG: @calebjackson_24 (${IG_ID})`);
  console.log(`   FB: Caleb Jackson- Realtor (${PAGE_ID})\n`);

  const allLeads = [
    ...(await collectIgMentions()),
    ...(await collectIgCommenters()),
    ...(await collectFbPageCommenters()),
    ...(await collectFbPageDMs()),
  ];

  // Dedupe by username before upserting
  const seen = new Set();
  const unique = allLeads.filter(l => {
    if (seen.has(l.username)) return false;
    seen.add(l.username);
    return true;
  });

  console.log(`\n✅ ${unique.length} unique people to import (${allLeads.length - unique.length} cross-source dupes removed)`);
  console.log('   Upserting into AIRE database...\n');

  let created = 0, skipped = 0;
  for (const lead of unique) {
    const result = await upsertLead(lead);
    if (result.action === 'created') { created++; process.stdout.write('✓'); }
    else { skipped++; process.stdout.write('.'); }
    if ((created + skipped) % 50 === 0) process.stdout.write('\n');
  }

  console.log(`\n\n🎯 Done.`);
  console.log(`   Created: ${created} new leads`);
  console.log(`   Skipped: ${skipped} already in DB`);
  console.log(`\n   View them in AIRE → Contacts, filter by source:`);
  console.log(`   "Instagram Commenter" | "Instagram Mention" | "Facebook Page Commenter" | "Facebook Messenger"`);
}

main()
  .catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
