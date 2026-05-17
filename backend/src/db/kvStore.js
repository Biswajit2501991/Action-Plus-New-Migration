import { query } from './adapter.js';

export async function readJsonCollection(key, fallback = []) {
  const result = await query(
    `select value_json
     from app_kv
     where key = $1
     limit 1`,
    [key],
  );
  if (!result.rowCount) return fallback;
  try {
    const parsed = JSON.parse(result.rows[0].value_json || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonCollection(key, value) {
  const payload = JSON.stringify(Array.isArray(value) ? value : []);
  await query(
    `insert into app_kv (key, value_json, updated_at)
     values ($1, $2, CURRENT_TIMESTAMP)
     on conflict(key) do update
     set value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    [key, payload],
  );
}

export async function readJsonValue(key, fallback = null) {
  const result = await query(
    `select value_json
     from app_kv
     where key = $1
     limit 1`,
    [key],
  );
  if (!result.rowCount) return fallback;
  try {
    return JSON.parse(result.rows[0].value_json || 'null');
  } catch {
    return fallback;
  }
}

export async function writeJsonValue(key, value) {
  const payload = JSON.stringify(value);
  await query(
    `insert into app_kv (key, value_json, updated_at)
     values ($1, $2, CURRENT_TIMESTAMP)
     on conflict(key) do update
     set value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    [key, payload],
  );
}
