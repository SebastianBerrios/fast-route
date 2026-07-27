/**
 * Reads the public Supabase env vars with a clear error if they're missing,
 * instead of a cryptic "supabaseUrl is required" deep inside supabase-js.
 * These are NEXT_PUBLIC_ on purpose: the publishable key is safe in the
 * browser because Row Level Security governs what it can access.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local.",
    );
  }
  return { url, anonKey };
}

/**
 * Reads the service_role key. It bypasses Row Level Security entirely, so it is
 * deliberately NOT prefixed with NEXT_PUBLIC_ — it must never reach the browser
 * bundle. Only server-only modules may call this.
 */
export function getServiceRoleEnv() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Creating team accounts needs the " +
        "service_role key server-side; add it to your .env.local.",
    );
  }
  return { url, serviceRoleKey };
}
