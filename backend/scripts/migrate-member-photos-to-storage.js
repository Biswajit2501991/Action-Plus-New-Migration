#!/usr/bin/env node
/**
 * Migrate legacy members.photo_url data URLs → Supabase Storage.
 * Requires: MEMBER_PHOTO_STORAGE_ENABLED=true, migration SQL applied, Supabase env set.
 *
 * Usage:
 *   MEMBER_PHOTO_STORAGE_ENABLED=true node scripts/migrate-member-photos-to-storage.js
 *   MEMBER_PHOTO_STORAGE_ENABLED=true node scripts/migrate-member-photos-to-storage.js --dry-run
 *   MEMBER_PHOTO_STORAGE_ENABLED=true node scripts/migrate-member-photos-to-storage.js --limit=50
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

async function main() {
  process.env.MEMBER_PHOTO_STORAGE_ENABLED = 'true';
  const { getSupabase, gymId } = await import('../src/db/supabase/client.js');
  const { T } = await import('../src/db/tables.js');
  const { memberPhotosStorageReady } = await import('../src/services/memberPhoto/memberPhotoSchema.js');
  const { migrateLegacyMemberPhoto } = await import('../src/services/memberPhoto/MemberPhotoService.js');

  const sb = getSupabase();
  const ready = await memberPhotosStorageReady(sb);
  if (!ready) {
    console.error('Run backend/migrations/supabase_member_photo_storage.sql first.');
    process.exit(1);
  }

  const gid = gymId();
  const { data: rows, error } = await sb
    .from(T.members)
    .select('member_code, photo_url, photo_path')
    .eq('gym_id', gid)
    .not('photo_url', 'is', null);
  if (error) throw new Error(error.message);

  const candidates = (rows || []).filter((r) => {
    const legacy = String(r.photo_url || '').trim();
    const path = String(r.photo_path || '').trim();
    return legacy.startsWith('data:image/') && !path;
  });

  const slice = limit > 0 ? candidates.slice(0, limit) : candidates;
  console.log(`Found ${candidates.length} legacy photos; processing ${slice.length}${dryRun ? ' (dry-run)' : ''}.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of slice) {
    const code = String(row.member_code || '').trim();
    if (!code) continue;
    if (dryRun) {
      console.log(`[dry-run] would migrate ${code}`);
      migrated += 1;
      continue;
    }
    try {
      const result = await migrateLegacyMemberPhoto(code);
      if (result.migrated) {
        migrated += 1;
        console.log(`OK ${code} → v${result.photoVersion}`);
      } else {
        skipped += 1;
        console.log(`SKIP ${code}: ${result.reason}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${code}: ${err?.message || err}`);
    }
  }

  console.log(JSON.stringify({ migrated, skipped, failed, total: slice.length }, null, 2));
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
