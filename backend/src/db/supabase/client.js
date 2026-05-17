import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

let client;

export function getSupabase() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATA_BACKEND=supabase');
  }
  if (!env.APG_GYM_ID) {
    throw new Error('APG_GYM_ID is required when DATA_BACKEND=supabase');
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function gymId() {
  return env.APG_GYM_ID;
}
