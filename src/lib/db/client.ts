// Supabase client — server side only.
// Two clients: anon (RLS-respecting, used in user-bound routes) and service
// (RLS-bypassing, used by ingest/enrich/trend workers).
//
// Phase 0: stub. Wire up when SUPABASE_URL + keys land in env.
// See PLAN.md §3.2.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

// TODO(phase-0): import @supabase/supabase-js once the dep is added; export
// `supabaseAnon()` and `supabaseService()` factories. Keeping this file as a
// typed stub so downstream modules can import the shape without pulling in
// the SDK before the schema is provisioned.
