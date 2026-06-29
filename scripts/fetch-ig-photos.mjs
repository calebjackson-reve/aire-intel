/**
 * AIRE — Fetch Instagram Profile Photos
 * For every lead with an instagramHandle and no photoUrl,
 * resolves the profile picture via unavatar.io and stores the final CDN URL.
 *
 * Run: node scripts/fetch-ig-photos.mjs
 */

import { PrismaClient } from '@prisma/client';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resolvePhotoUrl(handle) {
  // unavatar follows redirects to the real CDN URL
  const url = `https://unavatar.io/instagram/${handle}?json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AIRE-CRM/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

async function main() {
  const prisma = await createPrisma();

  const leads = await prisma.lead.findMany({
    where: {
      instagramHandle: { not: null },
      photoUrl: { equals: null },
    },
    select: { id: true, instagramHandle: true, name: true },
  });

  console.log(`📸 Fetching profile photos for ${leads.length} Instagram leads...\n`);

  let done = 0, updated = 0, failed = 0;

  for (const lead of leads) {
    const photoUrl = await resolvePhotoUrl(lead.instagramHandle);

    if (photoUrl) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { photoUrl },
      });
      updated++;
      process.stdout.write('▪');
    } else {
      failed++;
      process.stdout.write('·');
    }

    done++;
    if (done % 60 === 0) process.stdout.write(` ${done}/${leads.length}\n`);

    // 120ms between requests — ~8/sec, well within unavatar free tier
    await sleep(120);
  }

  console.log(`\n\n✅ Done. ${updated} photos saved, ${failed} not found.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
