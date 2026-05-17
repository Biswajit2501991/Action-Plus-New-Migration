/**
 * Post-rename checks + optional SQL apply via SUPABASE_DB_URL.
 *
 *   npm run db:post-rename-setup
 */

import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { initMembersTableName, membersTableName } from '../src/db/tables.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GYM_ID = String(process.env.APG_GYM_ID || '').trim();
function projectRef() {
  return String(process.env.SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
}

/** Parse postgresql:// URI without `new URL()` (passwords may contain @ or special chars). */
function parsePgConfig(raw) {
  const trimmed = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return null;
  if (/\[(?:YOUR-)?PASSWORD\]|\[ref\]|\[region\]/i.test(trimmed)) {
    fail(
      'SUPABASE_DB_URL still has a Supabase template placeholder — replace [YOUR-PASSWORD] with your real database password.',
    );
  }
  const prefix = trimmed.match(/^postgres(?:ql)?:\/\//i);
  if (!prefix) fail('SUPABASE_DB_URL must start with postgresql://');
  const rest = trimmed.slice(prefix[0].length);
  const at = rest.lastIndexOf('@');
  if (at < 0) fail('SUPABASE_DB_URL is missing @ before the host');
  const creds = rest.slice(0, at);
  const hostpart = rest.slice(at + 1);
  const colon = creds.indexOf(':');
  if (colon < 0) fail('SUPABASE_DB_URL must include :password after the username');
  const user = decodeURIComponent(creds.slice(0, colon));
  const password = decodeURIComponent(creds.slice(colon + 1));
  const slash = hostpart.indexOf('/');
  const hostport = slash >= 0 ? hostpart.slice(0, slash) : hostpart;
  const database = slash >= 0 ? hostpart.slice(slash + 1).split('?')[0] : 'postgres';
  const portSep = hostport.lastIndexOf(':');
  const host = portSep >= 0 ? hostport.slice(0, portSep) : hostport;
  const port = portSep >= 0 ? Number(hostport.slice(portSep + 1)) : 5432;
  return {
    user,
    password,
    host,
    port: Number.isFinite(port) ? port : 5432,
    database: database || 'postgres',
  };
}

function buildPgConfig() {
  const direct = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
  if (direct) return parsePgConfig(direct);

  const password = String(process.env.SUPABASE_DB_PASSWORD || '').trim();
  const ref = projectRef();
  const region = String(process.env.SUPABASE_DB_REGION || 'ap-south-1').trim();
  if (!password || !ref) return null;

  return {
    user: `postgres.${ref}`,
    password,
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
  };
}

function poolerFallbackConfigs(config) {
  const ref = projectRef();
  if (!ref || !String(config.host || '').startsWith('db.')) {
    return [];
  }
  const regions = [
    String(process.env.SUPABASE_DB_REGION || '').trim(),
    'ap-south-1',
    'ap-southeast-1',
    'ap-northeast-1',
    'us-east-1',
    'us-west-1',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
  ].filter(Boolean);
  const uniqueRegions = [...new Set(regions)];
  const out = [];
  for (const region of uniqueRegions) {
    for (const port of [6543, 5432]) {
      out.push({
        ...config,
        user: `postgres.${ref}`,
        host: `aws-0-${region}.pooler.supabase.com`,
        port,
      });
    }
  }
  return out;
}

async function resolveIpv4Host(host) {
  if (!host || host.includes(':')) return host;
  try {
    const { address } = await dns.lookup(host, { family: 4 });
    return address;
  } catch {
    return host;
  }
}

async function connectPg(config) {
  const ipv4Config = {
    ...config,
    host: await resolveIpv4Host(config.host),
  };
  const attempts = [ipv4Config, ...poolerFallbackConfigs(config)];
  let lastErr;
  for (const attempt of attempts) {
    const client = new pg.Client({
      ...attempt,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      if (attempt !== ipv4Config) {
        console.log(`[post-rename] Connected via ${attempt.user}@${attempt.host}:${attempt.port}`);
      } else if (attempt.host !== config.host) {
        console.log(`[post-rename] Connected via IPv4 ${attempt.host}:${attempt.port}`);
      }
      return client;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {}
    }
  }
  throw lastErr;
}

function fail(msg) {
  console.error(`\n[post-rename] ERROR: ${msg}`);
  process.exit(1);
}

async function checkUpsert(supabase, gid) {
  const probe = {
    gym_id: gid,
    member_code: '__upsert_probe__',
    full_name: 'Probe',
    email: 'probe@test.local',
    mobile: '0000000000',
    status: 'Active',
    medical_skipped: false,
    ack_accepted: false,
  };
  const { error } = await supabase
    .from(membersTableName)
    .upsert(probe, { onConflict: 'gym_id,member_code' });
  await supabase.from(membersTableName).delete().eq('gym_id', gid).eq('member_code', '__upsert_probe__');
  return !error;
}

async function checkRealtimeInDb(client) {
  const { rows } = await client.query(
    `select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'`,
  );
  return rows.length > 0;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !GYM_ID) {
    fail('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and APG_GYM_ID in backend/.env');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await initMembersTableName(supabase);

  if (membersTableName !== 'members') {
    fail(`Expected public.members but resolved "${membersTableName}". Finish the rename first.`);
  }

  const { count, error: countErr } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('gym_id', GYM_ID);
  if (countErr) fail(countErr.message);
  console.log(`[post-rename] members table OK (${count} rows for gym)`);

  const sqlPath = path.resolve(__dirname, '../migrations/supabase_post_rename_setup.sql');
  let upsertOk = await checkUpsert(supabase, GYM_ID);
  let realtimeOk = false;

  const pgConfig = buildPgConfig();
  if (pgConfig) {
    console.log(`[post-rename] Applying SQL via ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}...`);
    const sql = await fs.readFile(sqlPath, 'utf8');
    let client;
    try {
      client = await connectPg(pgConfig);
    } catch (err) {
      const msg = String(err?.message || err);
      fail(
        `Database login failed (${msg}).\n`
        + '  • Supabase → Project Settings → Database → reset/copy the database password\n'
        + '  • Use the URI from "Connection string" (not the service_role API key)\n'
        + '  • Try the Session pooler URI (port 6543), or set SUPABASE_DB_PASSWORD=...',
      );
    }
    try {
      await client.query(sql);
      upsertOk = await checkUpsert(supabase, GYM_ID);
      realtimeOk = await checkRealtimeInDb(client);
    } finally {
      await client.end();
    }
  } else {
    console.log('[post-rename] SUPABASE_DB_URL / SUPABASE_DB_PASSWORD not set — skipping SQL apply.');
    console.log(`[post-rename] Paste this file in Supabase SQL Editor:\n  ${sqlPath}`);
  }

  console.log(`[post-rename] Bulk upsert ready: ${upsertOk ? 'yes' : 'no (run SQL for UNIQUE constraint)'}`);
  console.log(`[post-rename] members in realtime publication: ${realtimeOk ? 'yes' : 'no (run SQL or enable in Dashboard → Database → Replication)'}`);

  if (!upsertOk || !realtimeOk) {
    console.log('\n[post-rename] After running SQL, restart backend: npm start');
    process.exit(pgConfig ? 1 : 0);
  }

  console.log('\n[post-rename] All set. Restart backend: npm start');
}

main().catch((err) => fail(err.message || err));
