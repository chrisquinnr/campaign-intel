// Supabase clients — server side only.
//
// Two clients:
//   - supabaseAnon():    RLS-respecting, used in user-bound API routes.
//   - supabaseService(): RLS-bypassing, used by ingest/enrich/trend workers.
//
// Both are typed against the generated Database schema, so table reads/writes
// are checked at compile time.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type DB = SupabaseClient<Database>;

interface Env {
  url: string;
  anon: string;
  service: string;
}

function readEnv(): Env {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL not set');
  if (!anon) throw new Error('SUPABASE_ANON_KEY not set');
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return { url, anon, service };
}

let _anon: DB | null = null;
let _service: DB | null = null;

/** RLS-respecting client. Use in user-bound code paths. */
export function supabaseAnon(): DB {
  if (_anon) return _anon;
  const env = readEnv();
  _anon = createClient<Database>(env.url, env.anon, {
    auth: { persistSession: false }
  });
  return _anon;
}

/** Service-role client. Bypasses RLS — use only in trusted server code. */
export function supabaseService(): DB {
  if (_service) return _service;
  const env = readEnv();
  _service = createClient<Database>(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _service;
}

// Re-export commonly used types so consumers don't need a second import.
export type { Database } from './database.types';
export type { Tables, TablesInsert, TablesUpdate, Enums } from './database.types';
